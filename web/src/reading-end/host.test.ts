import { describe, expect, it, vi } from "vitest";
import type { RenderReadingEndCardOutput } from "@ss/shared";
import {
  createReadingEndHost,
  type ReadingEndHostDependencies,
  type StandardReadingEndBridge
} from "./host.js";

const output: RenderReadingEndCardOutput = {
  view: "reading_end",
  snapshot: {
    id: "snapshot-1",
    bookId: "book-1",
    operationId: "turn-1",
    createdAt: "2026-08-19T12:00:00.000Z",
    title: "打怪",
    positionLabel: "第 19 页",
    progressSummary: "读完“崇高的怪物性”，进入“受遏制的怪物性”",
    readingSummary: "怪物从崇高的边界经验转向被社会秩序约束与命名的对象。",
    notionSyncStatus: "pending",
    thoughtCount: 0
  }
};

function createHarness({
  connect = vi.fn().mockResolvedValue(undefined),
  compatibility
}: {
  connect?: ReturnType<typeof vi.fn>;
  compatibility?: ReadingEndHostDependencies["getCompatibilityHost"] extends () => infer T
    ? T
    : never;
} = {}) {
  let toolResultListener: ((result: { structuredContent?: unknown }) => void) | undefined;
  const sendSizeChanged = vi.fn();
  const removeEventListener = vi.fn();
  const close = vi.fn();
  const bridge: StandardReadingEndBridge = {
    connect,
    addEventListener: vi.fn((_type, listener) => {
      toolResultListener = listener;
    }),
    removeEventListener,
    sendSizeChanged,
    close
  };
  const observers: Array<{
    callback: () => void;
    observe: ReturnType<typeof vi.fn>;
    disconnect: ReturnType<typeof vi.fn>;
  }> = [];
  const frames: Array<() => void> = [];
  const dimensions = { width: 390, height: 220 };
  const statuses: Array<{ mode: string; error?: string }> = [];
  const received: RenderReadingEndCardOutput[] = [];
  const host = createReadingEndHost({
    isEmbedded: () => true,
    createStandardBridge: () => bridge,
    getCompatibilityHost: () => compatibility,
    createResizeObserver: (callback) => {
      const observer = { callback, observe: vi.fn(), disconnect: vi.fn() };
      observers.push(observer);
      return observer;
    },
    requestFrame: (callback) => {
      frames.push(callback);
      return frames.length;
    },
    cancelFrame: vi.fn(),
    measure: () => ({ ...dimensions }),
    addGlobalsListener: () => vi.fn()
  });
  host.subscribeStatus((status) => statuses.push(status));
  host.subscribeOutput((value) => received.push(value));

  return {
    host,
    bridge,
    sendSizeChanged,
    removeEventListener,
    close,
    observers,
    frames,
    dimensions,
    statuses,
    received,
    emitOutput: () => toolResultListener?.({ structuredContent: output }),
    emitRawOutput: (structuredContent: unknown) => toolResultListener?.({ structuredContent }),
    flushFrame: () => frames.shift()?.()
  };
}

async function settle() {
  await Promise.resolve();
  await Promise.resolve();
}

describe("isolated reading-end host", () => {
  it("uses the standard bridge and sends an intrinsic size notification", async () => {
    const harness = createHarness();
    const root = document.createElement("main");
    harness.host.setRoot(root);
    await settle();
    harness.flushFrame();

    expect(harness.statuses.at(-1)).toEqual({ mode: "standard" });
    expect(harness.sendSizeChanged).toHaveBeenCalledWith({ width: 390, height: 220 });
    expect(harness.observers[0]?.observe).toHaveBeenCalledWith(root);
  });

  it("falls back after standard initialization fails and reports ChatGPT intrinsic height", async () => {
    const notifyIntrinsicHeight = vi.fn();
    const harness = createHarness({
      connect: vi.fn().mockRejectedValue(new Error("initialize rejected")),
      compatibility: { toolOutput: output, notifyIntrinsicHeight }
    });
    harness.host.setRoot(document.createElement("main"));
    await settle();
    harness.flushFrame();

    expect(harness.statuses.at(-1)).toEqual({ mode: "compatibility" });
    expect(harness.received).toEqual([output]);
    expect(notifyIntrinsicHeight).toHaveBeenCalledWith({ height: 220 });
    expect(harness.removeEventListener).toHaveBeenCalled();
  });

  it("reports a new height after the dynamic snapshot changes content", async () => {
    const harness = createHarness();
    harness.host.setRoot(document.createElement("main"));
    await settle();
    harness.flushFrame();
    harness.emitOutput();
    harness.dimensions.height = 612;
    harness.observers[0]?.callback();
    harness.flushFrame();

    expect(harness.received).toEqual([output]);
    expect(harness.sendSizeChanged).toHaveBeenNthCalledWith(1, { width: 390, height: 220 });
    expect(harness.sendSizeChanged).toHaveBeenNthCalledWith(2, { width: 390, height: 612 });
  });

  it("keeps an invalid one-shot snapshot diagnosable after connect completes", async () => {
    const harness = createHarness();
    harness.host.setRoot(document.createElement("main"));
    harness.emitRawOutput({ view: "reading_end", snapshot: {} });
    await settle();

    expect(harness.statuses.at(-1)?.mode).toBe("standard");
    expect(harness.statuses.at(-1)?.error).toContain("收尾快照不完整");
    expect(harness.received).toEqual([]);
  });

  it("shows a diagnosable unavailable state when neither path can report height", async () => {
    const harness = createHarness({
      connect: vi.fn().mockRejectedValue(new Error("initialize rejected")),
      compatibility: { toolOutput: output }
    });
    await settle();

    expect(harness.statuses.at(-1)?.mode).toBe("unavailable");
    expect(harness.statuses.at(-1)?.error).toContain("没有提供高度上报能力");
    expect(harness.received).toEqual([]);
  });

  it("does not resend an unchanged height", async () => {
    const harness = createHarness();
    harness.host.setRoot(document.createElement("main"));
    await settle();
    harness.flushFrame();
    harness.observers[0]?.callback();
    harness.flushFrame();

    expect(harness.sendSizeChanged).toHaveBeenCalledTimes(1);
  });

  it("disconnects the StrictMode observer before attaching the replacement", async () => {
    const harness = createHarness();
    const firstRoot = document.createElement("main");
    const secondRoot = document.createElement("main");
    harness.host.setRoot(firstRoot);
    await settle();
    harness.host.setRoot(null);
    harness.host.setRoot(secondRoot);

    expect(harness.observers[0]?.disconnect).toHaveBeenCalledTimes(1);
    expect(harness.observers[1]?.observe).toHaveBeenCalledWith(secondRoot);
  });
});
