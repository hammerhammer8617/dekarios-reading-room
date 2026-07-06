import { App as McpApp } from "@modelcontextprotocol/ext-apps";
import type { ToolCallResult } from "../types/openai.js";

let app: McpApp | undefined;
let appReady: Promise<void> | undefined;
let lastModelContext: Record<string, unknown> | undefined;
let lastRangeTextContext:
  | {
      sessionId: string;
      base: Record<string, unknown>;
      chunks: Array<{ start: number; end: number; text: string }>;
    }
  | undefined;

export interface ReadingHostContext {
  displayMode?: "inline" | "pip" | "fullscreen";
  availableDisplayModes?: Array<"inline" | "pip" | "fullscreen">;
  containerDimensions?: {
    width?: number;
    maxWidth?: number;
    height?: number;
    maxHeight?: number;
  };
  safeAreaInsets?: {
    top: number;
    right: number;
    bottom: number;
    left: number;
  };
}

function connectApp() {
  if (typeof window === "undefined" || window.parent === window) return undefined;
  if (!app) {
    app = new McpApp({ name: "德卡里奥斯家的书房", version: "0.2.1" });
    appReady = app.connect().catch(() => undefined);
  }
  return app;
}

export async function callTool(
  name: string,
  args: Record<string, unknown>
): Promise<ToolCallResult> {
  const bridge = connectApp();
  if (bridge) {
    await appReady;
    const result = (await bridge.callServerTool({ name, arguments: args })) as ToolCallResult;
    return withCurrentContextFallback(name, args, result);
  }
  if (window.openai?.callTool) {
    const result = await window.openai.callTool(name, args);
    return withCurrentContextFallback(name, args, result);
  }
  return withCurrentContextFallback(name, args, { structuredContent: {} });
}

function withCurrentContextFallback(
  name: string,
  args: Record<string, unknown>,
  result: ToolCallResult
): ToolCallResult {
  if (name !== "send_current_context") return result;
  const structuredContent = result.structuredContent ?? {};
  if (structuredContent.context) return result;

  const hasReadableContext = [
    args.includedText,
    args.currentText,
    args.selectedText,
    args.pageDescription,
    args.userNote,
    args.currentPageImage
  ].some((value) => typeof value === "string" && value.trim().length > 0);
  if (!hasReadableContext) return result;

  return {
    ...result,
    structuredContent: {
      ...structuredContent,
      context: {
        type: "current_reading_context",
        sessionId: args.sessionId,
        previousSyncedPosition: args.previousSyncedPosition,
        currentPosition: args.currentPosition,
        contextRange: args.contextRange,
        mode: args.mode,
        includedText: args.includedText,
        currentText: args.currentText,
        selectedText: args.selectedText,
        pageDescription: args.pageDescription,
        userNote: args.userNote,
        sourceContext: args.sourceContext,
        readingCommentMode: args.readingCommentMode,
        commentLength: args.commentLength,
        batch: args.batch
      },
      contextFallback: true
    }
  };
}

export async function askChatGpt(
  prompt: string,
  options: { scrollToBottom?: boolean } = {}
) {
  await requestReaderPip();
  const bridge = connectApp();
  if (bridge) {
    await appReady;
    await primeModelContextForPrompt(bridge, prompt);
    await bridge.sendMessage({ role: "user", content: [{ type: "text", text: prompt }] });
    return;
  }
  await window.openai?.sendFollowUpMessage?.({
    prompt,
    scrollToBottom: options.scrollToBottom ?? false
  });
}

async function primeModelContextForPrompt(bridge: McpApp, prompt: string) {
  if (!lastModelContext || !shouldPrimeModelContext(prompt)) return;
  try {
    await bridge.updateModelContext({
      content: [{ type: "text", text: JSON.stringify(lastModelContext) }]
    });
  } catch {
    // If hidden context refresh fails, the visible prompt/fallback path still proceeds.
  }
}

function shouldPrimeModelContext(prompt: string) {
  return prompt.includes("补课已确认完成");
}

export async function requestReaderPip(): Promise<boolean> {
  const bridge = connectApp();
  try {
    if (bridge) {
      await appReady;
      const result = await bridge.requestDisplayMode({ mode: "pip" });
      return result.mode === "pip";
    }
    if (window.openai?.requestDisplayMode) {
      await window.openai.requestDisplayMode({ mode: "pip" });
      return true;
    }
  } catch {
    return false;
  }
  return false;
}

export async function updateModelContext(context: Record<string, unknown>): Promise<boolean> {
  const bridge = connectApp();
  if (!bridge) return false;
  try {
    await appReady;
    await bridge.updateModelContext({
      content: [{ type: "text", text: JSON.stringify(context) }]
    });
    rememberModelContext(context);
    return true;
  } catch {
    return false;
  }
}

function rememberModelContext(context: Record<string, unknown>) {
  const rangeText = parseRangeTextContext(context);
  if (!rangeText) {
    lastModelContext = context;
    return;
  }

  const previousRangeTextContext = lastRangeTextContext;
  const batchOrdinal = readNumber((context.batch as Record<string, unknown> | undefined)?.ordinal);
  const shouldReset =
    !previousRangeTextContext ||
    previousRangeTextContext.sessionId !== rangeText.sessionId ||
    batchOrdinal === 1;
  const chunks = shouldReset ? [] : [...previousRangeTextContext.chunks];
  const nextChunks = [
    ...chunks.filter(
      (chunk) => !(chunk.start === rangeText.start && chunk.end === rangeText.end)
    ),
    {
      start: rangeText.start,
      end: rangeText.end,
      text: rangeText.text
    }
  ].sort((left, right) => left.start - right.start);

  lastRangeTextContext = {
    sessionId: rangeText.sessionId,
    base: context,
    chunks: nextChunks
  };

  const start = Math.min(...nextChunks.map((chunk) => chunk.start));
  const end = Math.max(...nextChunks.map((chunk) => chunk.end));
  lastModelContext = {
    ...context,
    contextRange: { start, end },
    includedText: nextChunks.map((chunk) => chunk.text).join("\n\n"),
    batch: {
      ...((context.batch as Record<string, unknown> | undefined) ?? {}),
      rangeStart: start,
      rangeEnd: end
    }
  };
}

function parseRangeTextContext(context: Record<string, unknown>) {
  const includedText = typeof context.includedText === "string" ? context.includedText.trim() : "";
  const sessionId = typeof context.sessionId === "string" ? context.sessionId : "";
  if (!includedText || !sessionId) return null;

  const range = context.contextRange as Record<string, unknown> | undefined;
  const batch = context.batch as Record<string, unknown> | undefined;
  const start = readNumber(range?.start) ?? readNumber(batch?.rangeStart);
  const end = readNumber(range?.end) ?? readNumber(batch?.rangeEnd);
  if (!start || !end) return null;

  return { sessionId, start, end, text: includedText };
}

function readNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

export async function requestReaderFullscreen(): Promise<boolean> {
  try {
    if (window.openai?.requestDisplayMode) {
      await window.openai.requestDisplayMode({ mode: "fullscreen" });
      return true;
    }
    const bridge = connectApp();
    if (bridge) {
      await appReady;
      const result = await bridge.requestDisplayMode({ mode: "fullscreen" });
      return result.mode === "fullscreen";
    }
  } catch {
    return false;
  }
  return false;
}

export async function requestReaderInline(): Promise<boolean> {
  try {
    if (window.openai?.requestDisplayMode) {
      await window.openai.requestDisplayMode({ mode: "inline" });
      return true;
    }
    const bridge = connectApp();
    if (bridge) {
      await appReady;
      const result = await bridge.requestDisplayMode({ mode: "inline" });
      return result.mode === "inline";
    }
  } catch {
    return false;
  }
  return false;
}

export function saveReaderWidgetState(state: ReaderWidgetState) {
  window.openai?.setWidgetState?.(state);
}

export function initialWidgetState(): ReaderWidgetState | undefined {
  return window.openai?.widgetState;
}

export function initialToolOutput<T>(): T | undefined {
  return window.openai?.toolOutput as T | undefined;
}

export function subscribeHostContext(
  listener: (context: ReadingHostContext) => void
): () => void {
  const legacyListener = (event: Event) => {
    listener((event as CustomEvent<ReadingHostContext>).detail ?? {});
  };
  window.addEventListener("openai:host-context-changed", legacyListener);

  const bridge = connectApp();
  const bridgeListener = (context: ReadingHostContext) => listener(context);
  if (bridge) {
    bridge.addEventListener("hostcontextchanged", bridgeListener);
    void appReady?.then(() => listener((bridge.getHostContext() ?? {}) as ReadingHostContext));
  } else if (window.openai?.hostContext) {
    listener(window.openai.hostContext);
  }

  return () => {
    window.removeEventListener("openai:host-context-changed", legacyListener);
    bridge?.removeEventListener("hostcontextchanged", bridgeListener);
  };
}

export const fileCapabilities = {
  uploadFile: () => window.openai?.uploadFile,
  selectFiles: () => window.openai?.selectFiles,
  getFileDownloadUrl: () => window.openai?.getFileDownloadUrl
};
