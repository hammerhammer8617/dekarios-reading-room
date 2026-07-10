import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DEFAULT_SESSION_PREFERENCES } from "@ss/shared";
import { NovelReader } from "./NovelReader.js";

describe("NovelReader display layout", () => {
  it("restores the reading scroll position after fullscreen or orientation changes", () => {
    const props = createProps();
    const { container, rerender } = render(
      <NovelReader {...props} companionLayoutRevision={0} />
    );
    const scroll = container.querySelector<HTMLElement>(".reader-scroll")!;
    expect(scroll.scrollTop).toBe(96);
    scroll.scrollTop = 0;

    rerender(<NovelReader {...props} companionLayout="compact" companionLayoutRevision={1} />);
    expect(scroll.scrollTop).toBe(96);
  });

  it("keeps the reading jump toolbar in the page flow instead of overlaying actions", () => {
    const { container } = render(
      <NovelReader {...createProps()} companionLayoutRevision={0} />
    );
    const toolbar = screen.getByLabelText("阅读跳转工具栏");

    expect(toolbar).toHaveClass("reader-jump-toolbar");
    expect(toolbar.nextElementSibling).toHaveClass("reader-workspace");
    expect(container.querySelector('[aria-label="悬浮阅读跳转"]')).not.toBeInTheDocument();
  });

  it("sends a selected-sentence note to Gale and stores it with the quote", () => {
    const props = createProps();
    const selection = vi.spyOn(window, "getSelection").mockReturnValue({
      rangeCount: 0,
      removeAllRanges: vi.fn(),
      toString: () => "第一段。"
    } as unknown as Selection);

    render(<NovelReader {...props} companionLayoutRevision={0} />);
    fireEvent.mouseUp(screen.getByText("第一段。"));
    fireEvent.change(screen.getByLabelText("批注给盖尔"), {
      target: { value: "这句话的动作感很有意思。" }
    });

    fireEvent.click(screen.getByRole("button", { name: "给盖尔看这句" }));
    expect(props.onLook).toHaveBeenCalledWith(
      "第一段。",
      "第一段。",
      "这句话的动作感很有意思。"
    );

    fireEvent.click(screen.getByRole("button", { name: "保存这句" }));
    expect(props.onSaveQuote).toHaveBeenCalledWith(
      "第一段。",
      "这句话的动作感很有意思。"
    );
    selection.mockRestore();
  });
});

function createProps() {
  return {
    session: {
      id: "novel-scroll",
      title: "小说",
      type: "novel" as const,
      status: "active" as const,
      userCurrentPosition: { kind: "paragraph" as const, index: 1, total: 1, label: "第 1 段" },
      assistantSyncedPosition: null,
      liveReadingEnabled: false,
      sessionPreferences: DEFAULT_SESSION_PREFERENCES,
      sourceManifest: null,
      createdAt: "2026-06-22T00:00:00.000Z",
      updatedAt: "2026-06-22T00:00:00.000Z",
      lastReadAt: "2026-06-22T00:00:00.000Z"
    },
    chunks: ["第一段。"],
    onPosition: vi.fn(),
    onLook: vi.fn(),
    onSaveQuote: vi.fn(),
    onFinish: vi.fn(),
    onBack: vi.fn(),
    onFullscreen: vi.fn(),
    onSettings: vi.fn(),
    onMore: vi.fn(),
    companionComments: [],
    companionLoading: false,
    companionLayout: "wide" as const,
    syncRequestInFlight: false,
    canRequestPip: false,
    onRequestPip: vi.fn(),
    onClearCompanionComments: vi.fn(),
    initialScrollTop: 96,
    onScrollPosition: vi.fn()
  };
}
