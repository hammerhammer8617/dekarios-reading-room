import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createStaticReadingEndApp, parseReadingEndOutput } from "./static-main.js";

const output = {
  view: "reading_end" as const,
  snapshot: {
    id: "snapshot-monsters-19",
    bookId: "book-monsters",
    operationId: "turn-19",
    createdAt: "2026-08-19T12:00:00.000Z",
    title: "打怪",
    positionLabel: "第 19 页",
    progressSummary: "读完“崇高的怪物性”，进入“受遏制的怪物性”",
    readingSummary:
      "怪物从令人敬畏的边界经验，推进为被制度命名、约束与利用的对象。",
    tavThought: "分类让观看者安心，却未必让怪物真正变弱。",
    galeThought: "分类同时建立秩序，也规定了什么可以被驱逐。",
    openQuestion: "遏制会不会制造出另一种更隐蔽的怪物？",
    notionSyncStatus: "pending" as const,
    thoughtCount: 3
  }
};

function mountShell() {
  document.body.innerHTML = `
    <main id="reading-end-static-v4" data-state="shell">
      <h1 id="reading-end-title">静态收尾卡已加载</h1>
      <p id="reading-end-position"></p>
      <section id="reading-end-probe"></section>
      <div id="reading-end-content" hidden>
        <p id="reading-end-progress"></p>
        <p id="reading-end-summary"></p>
        <section data-optional="tavThought" hidden><p data-value="tavThought"></p></section>
        <section data-optional="galeThought" hidden><p data-value="galeThought"></p></section>
        <section data-optional="openQuestion" hidden><p data-value="openQuestion"></p></section>
      </div>
      <p id="reading-end-status"></p>
    </main>`;
}

function createHarness({ compatibility }: { compatibility?: { toolOutput?: unknown; notifyIntrinsicHeight?: (input: { height: number }) => void | Promise<void> } } = {}) {
  const posted: unknown[] = [];
  const frames: Array<() => void> = [];
  let messageListener: ((message: unknown) => void) | undefined;
  let globalsListener: ((value: unknown) => void) | undefined;
  let resizeListener: (() => void) | undefined;
  const dimensions = { width: 390, height: 320 };
  const app = createStaticReadingEndApp({
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

describe("reading-end static stop-loss resource", () => {
  beforeEach(mountShell);

  it("keeps the pre-rendered 390/768 shell intrinsically sized and scroll-free", () => {
    const html = readFileSync(resolve(process.cwd(), "reading-end.html"), "utf8");
    expect(html).toContain("width: min(100%, 620px)");
    expect(html).toContain("min-height: 320px !important");
    expect(html).toContain("data-reading-end-static-v4");
    expect(html).not.toMatch(/100(?:d?vh|svh|lvh)/u);
    expect(html).not.toMatch(/overflow\s*:\s*(?:auto|scroll)/u);
    expect(Math.min(390 - 8, 620)).toBe(382);
    expect(Math.min(768 - 8, 620)).toBe(620);
  });

  it("validates the exact authoritative snapshot contract", () => {
    expect(parseReadingEndOutput(output)).toEqual(output);
    expect(parseReadingEndOutput({ ...output, snapshot: { ...output.snapshot, title: "" } })).toBeUndefined();
    expect(
      parseReadingEndOutput({ ...output, snapshot: { ...output.snapshot, thoughtCount: -1 } })
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
        id: "reading-end-static-v4-initialize"
      })
    );
  });

  it("resends the same non-zero size after initialization is acknowledged", () => {
    const harness = createHarness();
    harness.flushFrame();
    harness.emitMessage({
      jsonrpc: "2.0",
      id: "reading-end-static-v4-initialize",
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

  it("renders every supplied snapshot field after a standard tool-result notification", () => {
    const harness = createHarness();
    harness.flushFrame();
    harness.emitMessage({
      jsonrpc: "2.0",
      method: "ui/notifications/tool-result",
      params: { structuredContent: output }
    });

    expect(document.getElementById("reading-end-static-v4")?.dataset.state).toBe("snapshot");
    expect(document.getElementById("reading-end-title")?.textContent).toBe("《打怪》");
    expect(document.body.textContent).toContain(output.snapshot.progressSummary);
    expect(document.body.textContent).toContain(output.snapshot.readingSummary);
    expect(document.body.textContent).toContain(output.snapshot.tavThought);
    expect(document.body.textContent).toContain(output.snapshot.galeThought);
    expect(document.body.textContent).toContain(output.snapshot.openQuestion);
    expect(document.body.textContent).toContain("《书页边缘》待同步");
  });

  it("reads already-available compatibility output and reports the same intrinsic height", () => {
    const notifyIntrinsicHeight = vi.fn<(input: { height: number }) => void>();
    const harness = createHarness({
      compatibility: { toolOutput: output, notifyIntrinsicHeight }
    });
    harness.flushFrame();

    expect(document.getElementById("reading-end-static-v4")?.dataset.state).toBe("snapshot");
    expect(notifyIntrinsicHeight).toHaveBeenCalledWith({ height: 320 });
  });

  it("reports changed content height and suppresses an unchanged duplicate", () => {
    const harness = createHarness();
    harness.flushFrame();
    harness.dimensions.height = 612;
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
      params: { width: 390, height: 612 }
    });
  });

  it("keeps the visible shell and shows a diagnostic for invalid output", () => {
    const harness = createHarness();
    harness.emitGlobals({ view: "reading_end", snapshot: {} });

    expect(document.getElementById("reading-end-static-v4")?.dataset.state).toBe("error");
    expect(document.getElementById("reading-end-title")?.textContent).toBe("静态收尾卡已加载");
    expect(document.getElementById("reading-end-status")?.textContent).toContain("快照不完整");
  });
});
