import { beforeEach, describe, expect, it, vi } from "vitest";

const bridge = {
  connect: vi.fn().mockResolvedValue(undefined),
  callServerTool: vi.fn(),
  sendMessage: vi.fn().mockResolvedValue({}),
  updateModelContext: vi.fn().mockResolvedValue({}),
  requestDisplayMode: vi.fn().mockResolvedValue({ mode: "fullscreen" })
};

vi.mock("@modelcontextprotocol/ext-apps", () => ({
  App: class {
    connect = bridge.connect;
    callServerTool = bridge.callServerTool;
    sendMessage = bridge.sendMessage;
    updateModelContext = bridge.updateModelContext;
    requestDisplayMode = bridge.requestDisplayMode;
  }
}));

describe("host bridge", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    Object.defineProperty(window, "parent", {
      configurable: true,
      value: {}
    });
    Object.defineProperty(window, "openai", {
      configurable: true,
      value: {
        setWidgetState: vi.fn(),
        widgetState: {
          screen: "novel",
          sessionId: "session-1",
          positionIndex: 2,
          scrollTop: 120
        }
      }
    });
  });

  it("updates model-visible context through the MCP Apps bridge", async () => {
    const { updateModelContext } = await import("./host.js");

    await expect(updateModelContext({ title: "Book", currentText: "paragraph" })).resolves.toBe(true);
    expect(bridge.updateModelContext).toHaveBeenCalledWith({
      content: [
        {
          type: "text",
          text: expect.stringContaining('"currentText":"paragraph"')
        }
      ]
    });
  });

  it("sends a message without changing the reader display mode", async () => {
    const { askChatGpt, requestReaderFullscreen } = await import("./host.js");

    await expect(requestReaderFullscreen()).resolves.toBe(true);
    bridge.requestDisplayMode.mockClear();
    await askChatGpt("陪我看看这里", { scrollToBottom: false });

    expect(bridge.requestDisplayMode).not.toHaveBeenCalled();
    expect(bridge.sendMessage).toHaveBeenCalledWith({
      role: "user",
      content: [{ type: "text", text: "陪我看看这里" }]
    });
  });

  it("falls back to the compatible ChatGPT message API when the host rejects bridge delivery", async () => {
    const sendFollowUpMessage = vi.fn().mockResolvedValue(undefined);
    if (window.openai) window.openai.sendFollowUpMessage = sendFollowUpMessage;
    bridge.sendMessage.mockResolvedValueOnce({ isError: true });
    const { askChatGpt } = await import("./host.js");

    await askChatGpt("手机端选句", { scrollToBottom: false });

    expect(sendFollowUpMessage).toHaveBeenCalledWith({
      prompt: "手机端选句",
      scrollToBottom: false
    });
  });

  it("primes the hidden selected-text context before sending its natural chat prompt", async () => {
    const { askChatGpt, updateModelContext } = await import("./host.js");
    await updateModelContext({
      mode: "selected_text",
      selectedText: "爱是一次旅行",
      userNote: "我想听完整一点。"
    });
    bridge.updateModelContext.mockClear();

    await askChatGpt(
      "盖尔，我在书页上划了一句给你，也可能写了批注。请告诉我你怎么看。",
      { scrollToBottom: false }
    );

    expect(bridge.updateModelContext).toHaveBeenCalledWith({
      content: [
        {
          type: "text",
          text: expect.stringContaining('"selectedText":"爱是一次旅行"')
        }
      ]
    });
    expect(bridge.updateModelContext.mock.invocationCallOrder[0]!).toBeLessThan(
      bridge.sendMessage.mock.invocationCallOrder[0]!
    );
  });

  it("starts the direct ChatGPT fullscreen request in the user gesture call stack", async () => {
    const requestDisplayMode = vi.fn().mockResolvedValue(undefined);
    if (window.openai) window.openai.requestDisplayMode = requestDisplayMode;
    const { requestReaderFullscreen } = await import("./host.js");

    const result = requestReaderFullscreen();

    expect(requestDisplayMode).toHaveBeenCalledWith({ mode: "fullscreen" });
    expect(bridge.requestDisplayMode).not.toHaveBeenCalled();
    await expect(result).resolves.toBe(true);
  });

  it("stores and restores only lightweight reader widget state", async () => {
    const { initialWidgetState, saveReaderWidgetState } = await import("./host.js");
    const state = {
      screen: "novel" as const,
      sessionId: "session-1",
      positionIndex: 3,
      scrollTop: 240
    };

    saveReaderWidgetState(state);

    expect(window.openai?.setWidgetState).toHaveBeenCalledWith(state);
    expect(initialWidgetState()).toEqual({
      screen: "novel",
      sessionId: "session-1",
      positionIndex: 2,
      scrollTop: 120
    });
  });
});
