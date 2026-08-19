import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createStaticBookshelfApp, parseBookshelfOutput } from "./static-main.js";

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

function mountShell() {
  document.body.innerHTML = `
    <main id="bookshelf-static-v2" data-state="shell">
      <h1 id="bookshelf-title">静态书架已加载</h1>
      <section id="bookshelf-probe"></section>
      <section id="bookshelf-content" hidden><div id="bookshelf-list"></div></section>
      <p id="bookshelf-status"></p>
    </main>`;
}

function createHarness({ compatibility }: { compatibility?: { toolOutput?: unknown; notifyIntrinsicHeight?: (input: { height: number }) => void | Promise<void> } } = {}) {
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

describe("bookshelf static stop-loss resource", () => {
  beforeEach(mountShell);

  it("keeps the pre-rendered 390/768 shell intrinsically sized and scroll-free", () => {
    const html = readFileSync(resolve(process.cwd(), "bookshelf.html"), "utf8");
    expect(html).toContain("width: min(100%, 620px)");
    expect(html).toContain("min-height: 320px !important");
    expect(html).toContain("data-bookshelf-static-v2");
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
        id: "bookshelf-static-v2-initialize"
      })
    );
  });

  it("resends the same non-zero size after initialization is acknowledged", () => {
    const harness = createHarness();
    harness.flushFrame();
    harness.emitMessage({
      jsonrpc: "2.0",
      id: "bookshelf-static-v2-initialize",
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

    expect(document.getElementById("bookshelf-static-v2")?.dataset.state).toBe("bookshelf");
    expect(document.getElementById("bookshelf-title")?.textContent).toBe("我们的书架");
    expect(document.body.textContent).toContain("《侦破我的命案》");
    expect(document.body.textContent).toContain("塔芙：第 91 页 · 共同进度：第 88 页");
    expect(document.body.textContent).toContain("案件簿 4 项");
    expect(document.body.textContent).toContain("《打怪》");
    expect(document.body.textContent).toContain("2 本作品 · open_bookshelf_v2 工具结果已抵达");
  });

  it("reads already-available compatibility output and reports the same intrinsic height", () => {
    const notifyIntrinsicHeight = vi.fn<(input: { height: number }) => void>();
    const harness = createHarness({
      compatibility: { toolOutput: bookshelfOutput, notifyIntrinsicHeight }
    });
    harness.flushFrame();

    expect(document.getElementById("bookshelf-static-v2")?.dataset.state).toBe("bookshelf");
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

  it("keeps the visible shell and shows a diagnostic for invalid output", () => {
    const harness = createHarness();
    harness.emitGlobals({ view: "bookshelf", bookshelf: [{}] });

    expect(document.getElementById("bookshelf-static-v2")?.dataset.state).toBe("error");
    expect(document.getElementById("bookshelf-title")?.textContent).toBe("静态书架已加载");
    expect(document.getElementById("bookshelf-status")?.textContent).toContain("结果不完整");
  });
});
