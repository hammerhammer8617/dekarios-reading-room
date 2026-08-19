import { App as McpApp } from "@modelcontextprotocol/ext-apps";
import {
  READING_NEST_APP_VERSION,
  renderReadingEndCardOutputSchema,
  type RenderReadingEndCardOutput
} from "@ss/shared";

type ToolResult = { structuredContent?: unknown };

export type ReadingEndHostMode =
  | "connecting"
  | "standard"
  | "compatibility"
  | "unavailable";

export type ReadingEndHostStatus = {
  mode: ReadingEndHostMode;
  error?: string;
};

export type StandardReadingEndBridge = {
  connect(): Promise<void>;
  addEventListener(type: "toolresult", listener: (result: ToolResult) => void): void;
  removeEventListener(type: "toolresult", listener: (result: ToolResult) => void): void;
  sendSizeChanged(size: { width: number; height: number }): void | Promise<void>;
  close?(): void | Promise<void>;
};

export type CompatibilityReadingEndHost = {
  toolOutput?: unknown;
  notifyIntrinsicHeight?: (input: { height: number }) => void | Promise<void>;
};

type ResizeObserverLike = {
  observe(target: Element): void;
  disconnect(): void;
};

export type ReadingEndHostDependencies = {
  isEmbedded: () => boolean;
  createStandardBridge: () => StandardReadingEndBridge;
  getCompatibilityHost: () => CompatibilityReadingEndHost | undefined;
  createResizeObserver: (callback: () => void) => ResizeObserverLike;
  requestFrame: (callback: () => void) => number;
  cancelFrame: (id: number) => void;
  measure: (element: HTMLElement) => { width: number; height: number };
  addGlobalsListener: (listener: (output: unknown) => void) => () => void;
};

const defaultDependencies: ReadingEndHostDependencies = {
  isEmbedded: () => typeof window !== "undefined" && window.parent !== window,
  createStandardBridge: () =>
    new McpApp(
      { name: "德卡里奥斯家的书房｜今天读到这里", version: READING_NEST_APP_VERSION },
      {},
      { autoResize: false, strict: true }
    ) as StandardReadingEndBridge,
  getCompatibilityHost: () => window.openai,
  createResizeObserver: (callback) => new ResizeObserver(callback),
  requestFrame: (callback) => window.requestAnimationFrame(callback),
  cancelFrame: (id) => window.cancelAnimationFrame(id),
  measure: (element) => {
    const bounds = element.getBoundingClientRect();
    return {
      width: Math.ceil(Math.max(bounds.width, element.scrollWidth, window.innerWidth)),
      height: Math.ceil(
        Math.max(
          bounds.height,
          element.scrollHeight,
          document.body.scrollHeight,
          document.documentElement.scrollHeight
        )
      )
    };
  },
  addGlobalsListener: (listener) => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{ globals?: { toolOutput?: unknown } }>).detail;
      const output = detail?.globals?.toolOutput ?? window.openai?.toolOutput;
      if (output !== undefined) listener(output);
    };
    window.addEventListener("openai:set_globals", handler);
    return () => window.removeEventListener("openai:set_globals", handler);
  }
};

export function createReadingEndHost(
  overrides: Partial<ReadingEndHostDependencies> = {}
) {
  const deps = { ...defaultDependencies, ...overrides };
  const outputListeners = new Set<(output: RenderReadingEndCardOutput) => void>();
  const statusListeners = new Set<(status: ReadingEndHostStatus) => void>();
  let status: ReadingEndHostStatus = { mode: "connecting" };
  let startPromise: Promise<void> | undefined;
  let bridge: StandardReadingEndBridge | undefined;
  let compatibilityHost: CompatibilityReadingEndHost | undefined;
  let root: HTMLElement | null = null;
  let observer: ResizeObserverLike | undefined;
  let frameId: number | undefined;
  let lastSize = "";
  let outputError: string | undefined;
  let latestOutput: RenderReadingEndCardOutput | undefined;
  let removeGlobalsListener: (() => void) | undefined;

  const attachCompatibilityOutput = () => {
    compatibilityHost = deps.getCompatibilityHost();
    removeGlobalsListener ??= deps.addGlobalsListener((output) => {
      compatibilityHost = deps.getCompatibilityHost();
      publishOutput(output);
      if (status.mode !== "standard" && compatibilityHost?.notifyIntrinsicHeight) {
        publishStatus({ mode: "compatibility", ...(outputError ? { error: outputError } : {}) });
        attachHeightObserver();
      }
    });
    if (compatibilityHost?.toolOutput !== undefined) publishOutput(compatibilityHost.toolOutput);
  };

  const publishStatus = (next: ReadingEndHostStatus) => {
    status = next;
    for (const listener of statusListeners) listener(next);
  };

  const publishOutput = (value: unknown) => {
    const parsed = renderReadingEndCardOutputSchema.safeParse(value);
    if (!parsed.success) {
      outputError = "宿主返回的收尾快照不完整；卡片已停止渲染。";
      publishStatus({
        mode: status.mode,
        error: outputError
      });
      return;
    }
    outputError = undefined;
    latestOutput = parsed.data;
    if (status.error) publishStatus({ mode: status.mode });
    for (const listener of outputListeners) listener(latestOutput);
  };

  const toolResultListener = (result: ToolResult) => publishOutput(result.structuredContent);

  const reportSize = () => {
    if (!root || (status.mode !== "standard" && status.mode !== "compatibility")) return;
    if (frameId !== undefined) return;
    frameId = deps.requestFrame(() => {
      frameId = undefined;
      if (!root) return;
      const size = deps.measure(root);
      if (size.width <= 0 || size.height <= 0) {
        publishStatus({
          mode: status.mode,
          error: "收尾卡内容存在，但无法测得有效高度。"
        });
        return;
      }
      const key = `${size.width}:${size.height}`;
      if (key === lastSize) return;
      lastSize = key;
      try {
        const request =
          status.mode === "standard"
            ? bridge?.sendSizeChanged(size)
            : compatibilityHost?.notifyIntrinsicHeight?.({ height: size.height });
        void Promise.resolve(request).catch(() => {
          publishStatus({
            mode: status.mode,
            error: "宿主拒绝了收尾卡的高度上报。"
          });
        });
      } catch {
        publishStatus({
          mode: status.mode,
          error: "宿主拒绝了收尾卡的高度上报。"
        });
      }
    });
  };

  const attachHeightObserver = () => {
    observer?.disconnect();
    observer = undefined;
    if (!root || (status.mode !== "standard" && status.mode !== "compatibility")) return;
    observer = deps.createResizeObserver(reportSize);
    observer.observe(root);
    reportSize();
  };

  const startCompatibility = () => {
    if (!compatibilityHost?.notifyIntrinsicHeight) {
      publishStatus({
        mode: "unavailable",
        error: "标准 MCP Apps bridge 初始化失败，兼容宿主也没有提供高度上报能力。"
      });
      return;
    }
    publishStatus({ mode: "compatibility", ...(outputError ? { error: outputError } : {}) });
    attachHeightObserver();
  };

  const start = () => {
    if (startPromise) return startPromise;
    publishStatus({ mode: "connecting" });
    startPromise = (async () => {
      attachCompatibilityOutput();
      // ChatGPT may expose its compatibility bridge immediately while the
      // standard MCP Apps initialize handshake is still pending. Start
      // intrinsic sizing now so rendered content cannot remain trapped in the
      // host's collapsed placeholder for the handshake timeout.
      if (compatibilityHost?.notifyIntrinsicHeight) startCompatibility();
      if (!deps.isEmbedded()) {
        if (!compatibilityHost?.notifyIntrinsicHeight) startCompatibility();
        return;
      }
      try {
        bridge = deps.createStandardBridge();
        bridge.addEventListener("toolresult", toolResultListener);
        await bridge.connect();
        publishStatus({ mode: "standard", ...(outputError ? { error: outputError } : {}) });
        attachHeightObserver();
      } catch {
        bridge?.removeEventListener("toolresult", toolResultListener);
        try {
          await bridge?.close?.();
        } catch {
          // A failed close must not prevent the capability-detected fallback.
        }
        bridge = undefined;
        startCompatibility();
      }
    })();
    return startPromise;
  };

  return {
    subscribeOutput(listener: (output: RenderReadingEndCardOutput) => void) {
      outputListeners.add(listener);
      if (latestOutput) listener(latestOutput);
      void start();
      return () => {
        outputListeners.delete(listener);
      };
    },
    subscribeStatus(listener: (next: ReadingEndHostStatus) => void) {
      statusListeners.add(listener);
      listener(status);
      void start();
      return () => {
        statusListeners.delete(listener);
      };
    },
    setRoot(element: HTMLElement | null) {
      if (frameId !== undefined) {
        deps.cancelFrame(frameId);
        frameId = undefined;
      }
      observer?.disconnect();
      observer = undefined;
      root = element;
      lastSize = "";
      attachHeightObserver();
    },
    reportSize,
    dispose() {
      if (frameId !== undefined) deps.cancelFrame(frameId);
      observer?.disconnect();
      removeGlobalsListener?.();
      bridge?.removeEventListener("toolresult", toolResultListener);
      void Promise.resolve(bridge?.close?.()).catch(() => undefined);
      outputListeners.clear();
      statusListeners.clear();
    }
  };
}

export type ReadingEndHost = ReturnType<typeof createReadingEndHost>;
