import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createStaticBookshelfApp,
  parseBookDetailsOutput,
  parseBookshelfOutput
} from "./static-main.js";

const bookshelfOutput = {
  view: "bookshelf" as const,
  bookshelf: [
    {
      bookId: "book-debris",
      title: "侦破我的命案",
      author: "安东尼·霍洛维茨",
      genre: "mystery" as const,
      status: "active" as const,
      tavPosition: { kind: "page" as const, index: 91, label: "第 91 页" },
      sharedPosition: { kind: "page" as const, index: 88, label: "第 88 页" },
      spoilerBoundary: { kind: "page" as const, index: 91, label: "第 91 页" },
      lastReadAt: "2026-08-19T12:00:00.000Z",
      lastNotionSyncedAt: null,
      latestThought: {
        id: "thought-1",
        sessionId: "book-debris",
        author: "tav" as const,
        kind: "question" as const,
        content: "为什么会留下两条进度？",
        status: "open" as const,
        createdAt: "2026-08-19T12:00:00.000Z",
        updatedAt: "2026-08-19T12:00:00.000Z"
      },
      openQuestionCount: 1,
      unsyncedThoughtCount: 1,
      casebookInProgress: true,
      casebookItemCount: 4
    },
    {
      bookId: "book-monsters",
      title: "打怪",
      genre: "nonfiction" as const,
      status: "completed" as const,
      tavPosition: { kind: "page" as const, index: 19, label: "第 19 页" },
      sharedPosition: null,
      spoilerBoundary: null,
      lastReadAt: "2026-08-18T12:00:00.000Z",
      lastNotionSyncedAt: "2026-08-18T13:00:00.000Z",
      openQuestionCount: 0,
      unsyncedThoughtCount: 0,
      casebookInProgress: false,
      casebookItemCount: 0
    }
  ]
};

const pagedBookshelfOutput = {
  view: "bookshelf" as const,
  bookshelf: Array.from({ length: 5 }, (_, index) => ({
    ...bookshelfOutput.bookshelf[0],
    bookId: `book-${index + 1}`,
    title: `分页书 ${index + 1}`,
    latestThought: undefined
  }))
};

const bookDetailsOutput = {
  session: {
    id: "book-debris",
    title: "侦破我的命案",
    author: "安东尼·霍洛维茨",
    genre: "mystery",
    status: "active" as const,
    userCurrentPosition: { kind: "page" as const, index: 91, label: "第 91 页" },
    assistantSyncedPosition: { kind: "page" as const, index: 88, label: "第 88 页" },
    spoilerBoundary: { kind: "page" as const, index: 91, label: "第 91 页" },
    lastReadAt: "2026-08-19T12:00:00.000Z"
  },
  thoughts: [
    {
      id: "thought-1",
      author: "tav" as const,
      kind: "question",
      content: "为什么会留下两条进度？",
      position: { kind: "page" as const, index: 91, label: "第 91 页" },
      status: "open",
      updatedAt: "2026-08-19T12:00:00.000Z"
    }
  ],
  openQuestions: [
    {
      id: "thought-1",
      author: "tav" as const,
      kind: "question",
      content: "为什么会留下两条进度？",
      position: { kind: "page" as const, index: 91, label: "第 91 页" },
      status: "open",
      updatedAt: "2026-08-19T12:00:00.000Z"
    }
  ],
  unsyncedThoughtCount: 1,
  quotes: [],
  bookmarks: [],
  casebook: { clues: [{ id: "clue-1" }], hypotheses: [] }
};

function mountShell() {
  document.body.innerHTML = `
    <main id="bookshelf-static-v4" data-state="shell">
      <section id="bookshelf-probe"></section>
      <section id="bookshelf-content" hidden>
        <h2 id="bookshelf-title">我们的书架</h2>
        <span id="bookshelf-count"></span>
        <div id="bookshelf-list"></div>
        <nav id="bookshelf-pagination" hidden>
          <button id="bookshelf-previous" type="button">上一页</button>
          <span id="bookshelf-page"></span>
          <button id="bookshelf-next" type="button">下一页</button>
        </nav>
      </section>
      <section id="bookshelf-detail" hidden></section>
      <p id="bookshelf-status"></p>
    </main>`;
}

function createHarness({ compatibility }: {
  compatibility?: {
    toolOutput?: unknown;
    callTool?: (name: string, args: Record<string, unknown>) => Promise<{
      structuredContent?: unknown;
      isError?: boolean;
    }>;
    notifyIntrinsicHeight?: (input: { height: number }) => void | Promise<void>;
  };
} = {}) {
  const posted: unknown[] = [];
  const frames: Array<() => void> = [];
  let messageListener: ((message: unknown) => void) | undefined;
  let globalsListener: ((value: unknown) => void) | undefined;
  let resizeListener: (() => void) | undefined;
  const dimensions = { width: 390, height: 320 };
  const app = createStaticBookshelfApp({
    document,
    getCompatibilityHost: () => compatibility,
    postToParent: (message) => posted.push(message),
    addMessageListener: (listener) => {
      messageListener = listener;
      return vi.fn();
    },
    addGlobalsListener: (listener) => {
      globalsListener = listener;
      return vi.fn();
    },
    observeSize: (listener) => {
      resizeListener = listener;
      return vi.fn();
    },
    requestFrame: (listener) => {
      frames.push(listener);
      return frames.length;
    },
    cancelFrame: vi.fn(),
    createOperationId: () => "delete-op-1",
    measure: () => ({ ...dimensions })
  });
  return {
    app,
    posted,
    frames,
    dimensions,
    emitMessage: (message: unknown) => messageListener?.(message),
    emitGlobals: (value: unknown) => globalsListener?.(value),
    emitResize: () => resizeListener?.(),
    flushFrame: () => frames.shift()?.()
  };
}

describe("bookshelf static interactive resource", () => {
  beforeEach(mountShell);

  it("keeps the pre-rendered 390/768 shell intrinsically sized and scroll-free", () => {
    const html = readFileSync(resolve(process.cwd(), "bookshelf.html"), "utf8");
    expect(html).toContain("width: min(100%, 620px)");
    expect(html).toContain("min-height: 320px !important");
    expect(html).toContain("data-bookshelf-static-v4");
    expect(html).toContain("bookroom-background-static-v3.webp");
    expect(html).not.toMatch(/100(?:d?vh|svh|lvh)/u);
    expect(html).not.toMatch(/overflow\s*:\s*(?:auto|scroll)/u);
    expect(Math.min(390 - 8, 620)).toBe(382);
    expect(Math.min(768 - 8, 620)).toBe(620);
  });

  it("validates the complete bookshelf result contract", () => {
    expect(parseBookshelfOutput(bookshelfOutput)).toEqual(bookshelfOutput);
    expect(
      parseBookshelfOutput({
        ...bookshelfOutput,
        bookshelf: [{ ...bookshelfOutput.bookshelf[0], title: "" }]
      })
    ).toBeUndefined();
    expect(
      parseBookshelfOutput({
        ...bookshelfOutput,
        bookshelf: [{ ...bookshelfOutput.bookshelf[0], openQuestionCount: -1 }]
      })
    ).toBeUndefined();
  });

  it("validates the complete book-detail result contract", () => {
    expect(parseBookDetailsOutput(bookDetailsOutput)).toEqual(bookDetailsOutput);
    expect(
      parseBookDetailsOutput({
        ...bookDetailsOutput,
        session: { ...bookDetailsOutput.session, title: "" }
      })
    ).toBeUndefined();
    expect(
      parseBookDetailsOutput({ ...bookDetailsOutput, openQuestions: [{}] })
    ).toBeUndefined();
  });

  it("reports a non-zero raw size before the initialize handshake completes", () => {
    const harness = createHarness();

    expect(harness.posted[0]).toEqual({
      jsonrpc: "2.0",
      method: "ui/notifications/size-changed",
      params: { width: 390, height: 320 }
    });
    expect(harness.posted[1]).toEqual(
      expect.objectContaining({
        jsonrpc: "2.0",
        method: "ui/initialize",
        id: "bookshelf-static-v4-initialize"
      })
    );
  });

  it("resends the same non-zero size after initialization is acknowledged", () => {
    const harness = createHarness();
    harness.flushFrame();
    harness.emitMessage({
      jsonrpc: "2.0",
      id: "bookshelf-static-v4-initialize",
      result: { protocolVersion: "2026-01-26" }
    });
    harness.flushFrame();

    const sizes = harness.posted.filter(
      (value) =>
        typeof value === "object" &&
        value !== null &&
        "method" in value &&
        value.method === "ui/notifications/size-changed"
    );
    expect(sizes).toHaveLength(2);
    expect(harness.posted).toContainEqual({
      jsonrpc: "2.0",
      method: "ui/notifications/initialized",
      params: {}
    });
  });

  it("renders every book after a standard tool-result notification", () => {
    const harness = createHarness();
    harness.flushFrame();
    harness.emitMessage({
      jsonrpc: "2.0",
      method: "ui/notifications/tool-result",
      params: { structuredContent: bookshelfOutput }
    });

    expect(document.getElementById("bookshelf-static-v4")?.dataset.state).toBe("bookshelf");
    expect(document.getElementById("bookshelf-title")?.textContent).toBe("我们的书架");
    expect(document.body.textContent).toContain("《侦破我的命案》");
    expect(document.body.textContent).toContain("塔芙：第 91 页 · 共同进度：第 88 页");
    expect(document.body.textContent).toContain("案件簿 4 项");
    expect(document.body.textContent).toContain("《打怪》");
    expect(document.body.textContent).toContain("2 本作品 · 点击书名查看完整共读记录");
    expect(document.querySelectorAll("button.book")).toHaveLength(2);
  });

  it("bounds a growing shelf to three books per page without nested scrolling", () => {
    const harness = createHarness();
    harness.emitMessage({
      jsonrpc: "2.0",
      method: "ui/notifications/tool-result",
      params: { structuredContent: pagedBookshelfOutput }
    });

    expect(document.querySelectorAll("button.book")).toHaveLength(3);
    expect(document.body.textContent).toContain("《分页书 1》");
    expect(document.body.textContent).not.toContain("《分页书 4》");
    expect(document.getElementById("bookshelf-page")?.textContent).toBe("第 1 / 2 页");
    expect(document.getElementById("bookshelf-pagination")?.hasAttribute("hidden")).toBe(false);

    document.querySelector<HTMLButtonElement>("#bookshelf-next")?.click();
    expect(document.querySelectorAll("button.book")).toHaveLength(2);
    expect(document.body.textContent).toContain("《分页书 4》");
    expect(document.body.textContent).not.toContain("《分页书 1》");
    expect(document.getElementById("bookshelf-page")?.textContent).toBe("第 2 / 2 页");
    expect(document.querySelector<HTMLButtonElement>("#bookshelf-next")?.disabled).toBe(true);
  });

  it("reads already-available compatibility output and reports the same intrinsic height", () => {
    const notifyIntrinsicHeight = vi.fn<(input: { height: number }) => void>();
    const harness = createHarness({
      compatibility: { toolOutput: bookshelfOutput, notifyIntrinsicHeight }
    });
    harness.flushFrame();

    expect(document.getElementById("bookshelf-static-v4")?.dataset.state).toBe("bookshelf");
    expect(notifyIntrinsicHeight).toHaveBeenCalledWith({ height: 320 });
  });

  it("reports changed content height and suppresses an unchanged duplicate", () => {
    const harness = createHarness();
    harness.flushFrame();
    harness.dimensions.height = 744;
    harness.emitResize();
    harness.flushFrame();
    harness.emitResize();
    harness.flushFrame();

    const sizes = harness.posted.filter(
      (value) =>
        typeof value === "object" &&
        value !== null &&
        "method" in value &&
        value.method === "ui/notifications/size-changed"
    );
    expect(sizes).toHaveLength(2);
    expect(sizes.at(-1)).toEqual({
      jsonrpc: "2.0",
      method: "ui/notifications/size-changed",
      params: { width: 390, height: 744 }
    });
  });

  it("opens one book through the standard tools/call bridge and returns to the shelf", async () => {
    const callTool = vi.fn();
    const harness = createHarness({ compatibility: { callTool } });
    harness.emitMessage({
      jsonrpc: "2.0",
      method: "ui/notifications/tool-result",
      params: { structuredContent: bookshelfOutput }
    });

    const firstBook = document.querySelector<HTMLButtonElement>("button.book");
    expect(firstBook).not.toBeNull();
    firstBook?.click();

    const request = harness.posted.find(
      (value) =>
        typeof value === "object" &&
        value !== null &&
        "method" in value &&
        value.method === "tools/call"
    ) as { id: string; params: unknown };
    expect(request).toMatchObject({
      jsonrpc: "2.0",
      method: "tools/call",
      params: { name: "get_book_details", arguments: { bookId: "book-debris" } }
    });

    harness.emitMessage({
      jsonrpc: "2.0",
      id: request.id,
      result: { structuredContent: bookDetailsOutput }
    });
    await vi.waitFor(() => {
      expect(document.getElementById("bookshelf-static-v4")?.dataset.state).toBe("detail");
    });

    expect(document.body.textContent).toContain("我们把书读厚的地方");
    expect(document.body.textContent).toContain("为什么会留下两条进度？");
    expect(callTool).not.toHaveBeenCalled();

    document.querySelector<HTMLButtonElement>("button.back")?.click();
    expect(document.getElementById("bookshelf-static-v4")?.dataset.state).toBe("bookshelf");
    expect(document.querySelectorAll("button.book")).toHaveLength(2);
  });

  it("requires inline confirmation and deletes only the selected structured record", async () => {
    const harness = createHarness();
    harness.emitMessage({
      jsonrpc: "2.0",
      method: "ui/notifications/tool-result",
      params: { structuredContent: bookshelfOutput }
    });
    document.querySelector<HTMLButtonElement>("button.book")?.click();

    const detailRequest = harness.posted.find(
      (value) =>
        typeof value === "object" &&
        value !== null &&
        "method" in value &&
        value.method === "tools/call" &&
        "params" in value &&
        (value.params as { name?: string }).name === "get_book_details"
    ) as { id: string };
    harness.emitMessage({
      jsonrpc: "2.0",
      id: detailRequest.id,
      result: { structuredContent: bookDetailsOutput }
    });
    await vi.waitFor(() => {
      expect(document.querySelector("button.delete-trigger")).not.toBeNull();
    });

    document.querySelector<HTMLButtonElement>("button.delete-trigger")?.click();
    expect(document.body.textContent).toContain("正文副本不会删除");
    expect(
      harness.posted.some(
        (value) =>
          typeof value === "object" &&
          value !== null &&
          "params" in value &&
          (value.params as { name?: string }).name === "delete_reading_session"
      )
    ).toBe(false);

    document.querySelector<HTMLButtonElement>("button.delete-confirm")?.click();
    const deleteRequest = harness.posted.find(
      (value) =>
        typeof value === "object" &&
        value !== null &&
        "method" in value &&
        value.method === "tools/call" &&
        "params" in value &&
        (value.params as { name?: string }).name === "delete_reading_session"
    ) as { id: string; params: unknown };
    expect(deleteRequest).toMatchObject({
      method: "tools/call",
      params: {
        name: "delete_reading_session",
        arguments: { sessionId: "book-debris", operationId: "delete-op-1" }
      }
    });

    harness.emitMessage({
      jsonrpc: "2.0",
      id: deleteRequest.id,
      result: { structuredContent: { deleted: true, sessionId: "book-debris" } }
    });
    await vi.waitFor(() => {
      expect(document.getElementById("bookshelf-static-v4")?.dataset.state).toBe("bookshelf");
      expect(document.querySelectorAll("button.book")).toHaveLength(1);
    });
    expect(document.querySelector("button.book")?.textContent).not.toContain("《侦破我的命案》");
    expect(document.getElementById("bookshelf-status")?.textContent).toContain("正文副本仍保留");

    harness.emitGlobals(bookshelfOutput);
    expect(document.querySelectorAll("button.book")).toHaveLength(1);
    expect(document.querySelector("button.book")?.textContent).not.toContain("《侦破我的命案》");
  });

  it("falls back to the compatibility bridge when the standard request is rejected", async () => {
    const callTool = vi.fn().mockResolvedValue({ structuredContent: bookDetailsOutput });
    const harness = createHarness({ compatibility: { callTool } });
    harness.emitMessage({
      jsonrpc: "2.0",
      method: "ui/notifications/tool-result",
      params: { structuredContent: bookshelfOutput }
    });
    document.querySelector<HTMLButtonElement>("button.book")?.click();

    const request = harness.posted.find(
      (value) =>
        typeof value === "object" &&
        value !== null &&
        "method" in value &&
        value.method === "tools/call"
    ) as { id: string };
    harness.emitMessage({
      jsonrpc: "2.0",
      id: request.id,
      error: { code: -32601, message: "Method not found" }
    });

    await vi.waitFor(() => {
      expect(document.getElementById("bookshelf-static-v4")?.dataset.state).toBe("detail");
    });
    expect(callTool).toHaveBeenCalledWith("get_book_details", { bookId: "book-debris" });
  });

  it("keeps the visible shell and shows a diagnostic for invalid output", () => {
    const harness = createHarness();
    harness.emitGlobals({ view: "bookshelf", bookshelf: [{}] });

    expect(document.getElementById("bookshelf-static-v4")?.dataset.state).toBe("error");
    expect(document.getElementById("bookshelf-title")?.textContent).toBe("我们的书架");
    expect(document.getElementById("bookshelf-status")?.textContent).toContain("结果不完整");
  });
});
