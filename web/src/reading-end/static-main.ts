import endBooksTea from "../assets/reading-room/static-v5/end-books-tea.webp";
import endCinemaPopcorn from "../assets/reading-room/static-v5/end-cinema-popcorn.webp";
import endGameNight from "../assets/reading-room/static-v5/end-game-night.webp";
import endOrangeTree from "../assets/reading-room/static-v5/end-orange-tree.webp";
import endSharedTableClose from "../assets/reading-room/static-v5/end-shared-table-close.webp";
import endSharedTableWide from "../assets/reading-room/static-v5/end-shared-table-wide.webp";

type ReadingEndSnapshot = {
  id: string;
  bookId: string;
  operationId: string;
  createdAt: string;
  title: string;
  positionLabel: string;
  progressSummary: string;
  readingSummary: string;
  tavThought?: string;
  galeThought?: string;
  openQuestion?: string;
  notionSyncStatus: "synced" | "pending" | "not_requested";
  thoughtCount: number;
};

type ReadingEndOutput = {
  view: "reading_end";
  snapshot: ReadingEndSnapshot;
};

type CompatibilityHost = {
  toolOutput?: unknown;
  notifyIntrinsicHeight?: (input: { height: number }) => void | Promise<void>;
};

type MessageListener = (message: unknown) => void;

export type StaticReadingEndDependencies = {
  document: Document;
  getCompatibilityHost: () => CompatibilityHost | undefined;
  postToParent: (message: unknown) => void;
  addMessageListener: (listener: MessageListener) => () => void;
  addGlobalsListener: (listener: (output: unknown) => void) => () => void;
  observeSize: (listener: () => void) => () => void;
  requestFrame: (listener: () => void) => number;
  cancelFrame: (id: number) => void;
  measure: () => { width: number; height: number };
};

const PROTOCOL_VERSION = "2026-01-26";
const INITIALIZE_ID = "reading-end-static-v6-initialize";
const readingEndBackgrounds = [
  endBooksTea,
  endCinemaPopcorn,
  endGameNight,
  endOrangeTree,
  endSharedTableClose,
  endSharedTableWide
] as const;
const syncLabels: Record<ReadingEndSnapshot["notionSyncStatus"], string> = {
  synced: "已同步到《书页边缘》",
  pending: "《书页边缘》待同步",
  not_requested: "本次没有待同步内容"
};

const defaultDependencies: StaticReadingEndDependencies = {
  document,
  getCompatibilityHost: () => window.openai,
  postToParent: (message) => window.parent.postMessage(message, "*"),
  addMessageListener: (listener) => {
    const handler = (event: MessageEvent) => {
      if (event.source === window.parent) listener(event.data);
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  },
  addGlobalsListener: (listener) => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{ globals?: { toolOutput?: unknown } }>).detail;
      const output = detail?.globals?.toolOutput ?? window.openai?.toolOutput;
      if (output !== undefined) listener(output);
    };
    window.addEventListener("openai:set_globals", handler);
    return () => window.removeEventListener("openai:set_globals", handler);
  },
  observeSize: (listener) => {
    if (typeof ResizeObserver === "undefined") return () => undefined;
    const observer = new ResizeObserver(listener);
    observer.observe(document.documentElement);
    observer.observe(document.body);
    return () => observer.disconnect();
  },
  requestFrame: (listener) => window.requestAnimationFrame(listener),
  cancelFrame: (id) => window.cancelAnimationFrame(id),
  measure: () => ({
    width: Math.ceil(Math.max(window.innerWidth, document.documentElement.scrollWidth)),
    height: Math.ceil(
      Math.max(
        320,
        document.documentElement.scrollHeight,
        document.body.scrollHeight,
        document.getElementById("reading-end-static-v6")?.scrollHeight ?? 0
      )
    )
  })
};

export function createStaticReadingEndApp(
  overrides: Partial<StaticReadingEndDependencies> = {}
) {
  const deps = { ...defaultDependencies, ...overrides };
  let frameId: number | undefined;
  let lastSize = "";
  let disposed = false;

  const sendSize = (size: { width: number; height: number }) => {
    if (disposed || size.width <= 0 || size.height <= 0) return;
    const key = `${size.width}:${size.height}`;
    if (key === lastSize) return;
    lastSize = key;
    deps.postToParent({
      jsonrpc: "2.0",
      method: "ui/notifications/size-changed",
      params: size
    });
    try {
      void Promise.resolve(
        deps.getCompatibilityHost()?.notifyIntrinsicHeight?.({ height: size.height })
      ).catch(() => undefined);
    } catch {
      // The standards-first raw notification above remains the primary path.
    }
  };

  const reportSize = () => {
    if (disposed || frameId !== undefined) return;
    frameId = deps.requestFrame(() => {
      frameId = undefined;
      if (disposed) return;
      sendSize(deps.measure());
    });
  };

  const publishOutput = (value: unknown) => {
    const output = parseReadingEndOutput(value);
    if (!output) {
      showError(deps.document, "收尾快照不完整；静态外壳仍保持可见。");
      reportSize();
      return;
    }
    renderReadingEndSnapshot(deps.document, output.snapshot);
    reportSize();
  };

  const removeMessageListener = deps.addMessageListener((value) => {
    if (!isRecord(value) || value.jsonrpc !== "2.0") return;
    if (value.id === INITIALIZE_ID && "result" in value) {
      deps.postToParent({
        jsonrpc: "2.0",
        method: "ui/notifications/initialized",
        params: {}
      });
      // The host may ignore the eager notification until initialization is
      // acknowledged, so resend even when the measured size is unchanged.
      lastSize = "";
      reportSize();
      return;
    }
    if (value.method === "ui/notifications/tool-result" && isRecord(value.params)) {
      publishOutput(value.params.structuredContent);
    }
  });
  const removeGlobalsListener = deps.addGlobalsListener(publishOutput);
  const removeSizeObserver = deps.observeSize(reportSize);

  const compatibilityOutput = deps.getCompatibilityHost()?.toolOutput;
  if (compatibilityOutput !== undefined) publishOutput(compatibilityOutput);

  // Send intrinsic size synchronously before ui/initialize. This is
  // intentionally redundant: neither a throttled animation frame nor a
  // permanently pending handshake may collapse the pre-rendered plain HTML.
  sendSize(deps.measure());
  deps.postToParent({
    jsonrpc: "2.0",
    id: INITIALIZE_ID,
    method: "ui/initialize",
    params: {
      appInfo: { name: "德卡里奥斯家的书房｜静态收尾卡", version: "0.3.0" },
      appCapabilities: {},
      protocolVersion: PROTOCOL_VERSION
    }
  });

  return {
    publishOutput,
    reportSize,
    dispose() {
      disposed = true;
      if (frameId !== undefined) deps.cancelFrame(frameId);
      removeMessageListener();
      removeGlobalsListener();
      removeSizeObserver();
    }
  };
}

export function parseReadingEndOutput(value: unknown): ReadingEndOutput | undefined {
  if (!isRecord(value) || value.view !== "reading_end" || !isRecord(value.snapshot)) {
    return undefined;
  }
  const snapshot = value.snapshot;
  const requiredStrings = [
    "id",
    "bookId",
    "operationId",
    "createdAt",
    "title",
    "positionLabel",
    "progressSummary",
    "readingSummary"
  ] as const;
  if (requiredStrings.some((key) => typeof snapshot[key] !== "string" || !snapshot[key].trim())) {
    return undefined;
  }
  if (
    !["synced", "pending", "not_requested"].includes(String(snapshot.notionSyncStatus)) ||
    typeof snapshot.thoughtCount !== "number" ||
    !Number.isInteger(snapshot.thoughtCount) ||
    snapshot.thoughtCount < 0
  ) {
    return undefined;
  }
  for (const key of ["tavThought", "galeThought", "openQuestion"] as const) {
    if (snapshot[key] !== undefined && typeof snapshot[key] !== "string") return undefined;
  }
  return value as ReadingEndOutput;
}

export function renderReadingEndSnapshot(doc: Document, snapshot: ReadingEndSnapshot) {
  const root = doc.getElementById("reading-end-static-v6");
  const backgroundIndex = selectReadingEndBackground(snapshot.id);
  if (root) {
    root.dataset.backgroundIndex = String(backgroundIndex + 1);
  }
  doc
    .getElementById("reading-end-art")
    ?.setAttribute("src", readingEndBackgrounds[backgroundIndex]!);
  setText(doc, "reading-end-title", `《${snapshot.title}》`);
  setText(doc, "reading-end-position", snapshot.positionLabel);
  setText(doc, "reading-end-progress", snapshot.progressSummary);
  setText(doc, "reading-end-summary", snapshot.readingSummary);
  doc.getElementById("reading-end-probe")?.setAttribute("hidden", "");
  doc.getElementById("reading-end-content")?.removeAttribute("hidden");
  for (const key of ["tavThought", "galeThought", "openQuestion"] as const) {
    const section = doc.querySelector<HTMLElement>(`[data-optional="${key}"]`);
    const value = snapshot[key]?.trim();
    if (value) {
      section?.removeAttribute("hidden");
      const target = section?.querySelector<HTMLElement>(`[data-value="${key}"]`);
      if (target) target.textContent = value;
    } else {
      section?.setAttribute("hidden", "");
    }
  }
  setText(
    doc,
    "reading-end-status",
    `${snapshot.thoughtCount} 个本次想法 · ${syncLabels[snapshot.notionSyncStatus]}`
  );
  if (root) root.dataset.state = "snapshot";
}

export function selectReadingEndBackground(snapshotId: string) {
  let result = 0;
  for (let index = 0; index < snapshotId.length; index += 1) {
    result = (result * 31 + snapshotId.charCodeAt(index)) >>> 0;
  }
  return result % readingEndBackgrounds.length;
}

function showError(doc: Document, message: string) {
  setText(doc, "reading-end-status", message);
  const root = doc.getElementById("reading-end-static-v6");
  if (root) root.dataset.state = "error";
}

function setText(doc: Document, id: string, value: string) {
  const element = doc.getElementById(id);
  if (element) element.textContent = value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

if (
  typeof window !== "undefined" &&
  typeof document !== "undefined" &&
  document.getElementById("reading-end-static-v6")
) {
  createStaticReadingEndApp();
}
