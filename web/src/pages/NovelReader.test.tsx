import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_SESSION_PREFERENCES } from "@ss/shared";
import { NovelReader } from "./NovelReader.js";
import { readerLocationStorageKey } from "../features/book-reader/reader-location.js";
import type {
  ParsedBookChapter,
  ParsedBookResource
} from "../features/book-import/types.js";

describe("NovelReader display layout", () => {
  beforeEach(() => {
    localStorage.clear();
  });

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

  it("opens a chapter directory and marks the current reading unit", () => {
    const props = createProps();
    props.chunks = ["序章\n从这里开始。", "智能的起源\n第二单元正文。", "机器时代\n第三单元正文。"];
    props.session = {
      ...props.session,
      userCurrentPosition: {
        kind: "paragraph",
        index: 2,
        total: 3,
        label: "第 2 段"
      }
    };

    render(<NovelReader {...props} companionLayoutRevision={0} />);
    fireEvent.click(screen.getByRole("button", { name: "打开目录" }));

    const dialog = screen.getByRole("dialog", { name: "目录" });
    expect(dialog).toHaveTextContent("序章");
    expect(dialog).toHaveTextContent("智能的起源");
    expect(dialog).toHaveTextContent("机器时代");
    expect(screen.getByRole("button", { name: /智能的起源.*正在读/ })).toHaveAttribute(
      "aria-current",
      "location"
    );
  });

  it("restores a newer device reading location when server progress arrived out of order", async () => {
    const props = createProps();
    props.chunks = ["第一单元", "第二单元", "第三单元"];
    localStorage.setItem(
      readerLocationStorageKey(props.session.id),
      JSON.stringify({
        currentIndex: 3,
        scrollByIndex: { "3": 84 },
        updatedAt: "2026-06-23T00:00:00.000Z"
      })
    );

    render(<NovelReader {...props} companionLayoutRevision={0} />);

    await waitFor(() => expect(props.onPosition).toHaveBeenCalledWith(3));
  });

  it("keeps the visible bookmark action and its exact local scroll position", async () => {
    const props = createProps();
    const { container } = render(
      <NovelReader {...props} companionLayoutRevision={0} />
    );
    const scroll = container.querySelector<HTMLElement>(".reader-scroll")!;
    scroll.scrollTop = 137;
    fireEvent.scroll(scroll);

    fireEvent.click(screen.getByRole("button", { name: "在这里夹书签" }));

    await waitFor(() => expect(props.onBookmark).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent("书签已夹在第 1 单元这里")
    );
    expect(
      JSON.parse(localStorage.getItem(readerLocationStorageKey(props.session.id)) ?? "{}")
    ).toMatchObject({
      currentIndex: 1,
      bookmarkIndex: 1,
      bookmarkScrollTop: 137,
      scrollByIndex: { "1": 137 }
    });
  });

  it("renders EPUB image blobs as mobile-safe inline data URLs", async () => {
    const props = createProps();
    const structuredChapter: ParsedBookChapter = {
      id: "chapter-with-image",
      title: "插图章",
      text: "插图章",
      blocks: [
        { id: "heading", type: "heading", level: 1, text: "插图章" },
        { id: "image", type: "image", resourcePath: "OPS/images/chart.png", alt: "进化图" }
      ]
    };
    const structuredResources: ParsedBookResource[] = [
      {
        path: "OPS/images/chart.png",
        mediaType: "image/png",
        blob: new Blob([new Uint8Array([137, 80, 78, 71])], { type: "image/png" })
      }
    ];

    render(
      <NovelReader
        {...props}
        structuredChapter={structuredChapter}
        structuredResources={structuredResources}
        companionLayoutRevision={0}
      />
    );

    await waitFor(() =>
      expect(screen.getByRole("img", { name: "进化图" })).toHaveAttribute(
        "src",
        expect.stringMatching(/^data:image\/png;base64,/)
      )
    );
  });

  it("keeps selected-sentence comments, progress sync, and quote saving as separate actions", async () => {
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

    fireEvent.click(screen.getByRole("button", { name: "连同批注递给盖尔" }));
    expect(props.onComment).toHaveBeenCalledWith(
      "第一段。",
      "第一段。",
      "这句话的动作感很有意思。"
    );
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent("这句和批注已经递给盖尔。")
    );
    expect(props.onSync).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "划线并收藏" }));
    expect(props.onSaveQuote).toHaveBeenCalledWith(
      "第一段。",
      "这句话的动作感很有意思。"
    );
    selection.mockRestore();
  });

  it("only reports delivery after the host accepts the selected sentence", async () => {
    let finishDelivery: ((delivered: boolean) => void) | undefined;
    const props = createProps();
    props.onComment = vi.fn(
      () => new Promise<boolean>((resolve) => {
        finishDelivery = resolve;
      })
    );
    const selection = vi.spyOn(window, "getSelection").mockReturnValue({
      rangeCount: 0,
      removeAllRanges: vi.fn(),
      toString: () => "第一段。"
    } as unknown as Selection);

    render(<NovelReader {...props} companionLayoutRevision={0} />);
    fireEvent.mouseUp(screen.getByText("第一段。"));
    fireEvent.change(screen.getByLabelText("批注给盖尔"), {
      target: { value: "请看看这里。" }
    });
    fireEvent.click(screen.getByRole("button", { name: "连同批注递给盖尔" }));

    expect(screen.getByRole("button", { name: "正在递给盖尔…" })).toBeDisabled();
    expect(screen.getByRole("status")).toHaveTextContent("正在递给盖尔…");
    finishDelivery?.(false);

    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(
        "这句还没有递送成功；原句和批注都保留着，请再试一次。"
      )
    );
    expect(screen.getByLabelText("批注给盖尔")).toHaveValue("请看看这里。");
    expect(screen.getByRole("button", { name: "连同批注递给盖尔" })).toBeEnabled();
    selection.mockRestore();
  });

  it("gives Gale's returned highlight and progress sync their own stable buttons", () => {
    const props = createProps();
    render(<NovelReader {...props} companionLayoutRevision={0} />);

    fireEvent.click(screen.getByRole("button", { name: "盖尔会划哪一句？" }));
    expect(props.onRequestGaleHighlight).toHaveBeenCalledWith("第一段。");
    expect(props.onComment).not.toHaveBeenCalled();
    expect(props.onSync).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "同步到这里" }));
    expect(props.onSync).toHaveBeenCalledTimes(1);
  });

  it("renders and restores a visible highlight for plain-text books", () => {
    const props = createProps();
    const firstRender = render(
      <NovelReader {...props} companionLayoutRevision={0} />
    );
    const text = screen.getByText("第一段。");
    const textNode = text.firstChild;
    if (!textNode) throw new Error("Missing plain-text node");
    const range = document.createRange();
    range.setStart(textNode, 0);
    range.setEnd(textNode, 4);
    const selection = vi.spyOn(window, "getSelection").mockReturnValue({
      rangeCount: 1,
      getRangeAt: () => range,
      removeAllRanges: vi.fn(),
      toString: () => "第一段。"
    } as unknown as Selection);

    fireEvent.mouseUp(text);
    fireEvent.click(screen.getByRole("button", { name: "划线并收藏" }));

    const highlight = firstRender.container.querySelector("mark.book-highlight");
    expect(highlight).toHaveTextContent("第一段。");
    expect(screen.getByRole("status")).toHaveTextContent("已经在书页上划线并收藏");

    firstRender.unmount();
    const reopened = render(
      <NovelReader {...props} companionLayoutRevision={0} />
    );
    expect(reopened.container.querySelector("mark.book-highlight")).toHaveTextContent(
      "第一段。"
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
    onComment: vi.fn().mockResolvedValue(true),
    onRequestGaleHighlight: vi.fn(),
    onSync: vi.fn(),
    onSaveQuote: vi.fn(),
    onBookmark: vi.fn().mockResolvedValue(undefined),
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
