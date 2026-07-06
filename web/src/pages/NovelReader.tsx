import { useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import type { CompanionComment, ReadingSession } from "@ss/shared";
import type {
  ParsedBook,
  ParsedBookChapter,
  ParsedBookResource
} from "../features/book-import/types.js";
import {
  activeImportedBookMatchesChunks,
  getActiveImportedBook
} from "../features/book-import/active-imported-book.js";
import { restoreStructuredBook } from "../features/book-import/structured-book-cache.js";
import {
  FootnotedChapter,
  type BookBlockHighlight
} from "../features/book-reader/FootnotedChapter.js";
import {
  createTextSelectionAnchor,
  resolveTextSelectionAnchor,
  type SelectionTextBlock,
  type TextSelectionAnchor
} from "../features/reading-selection/selection-anchor.js";
import { useHorizontalPaging } from "../hooks/useHorizontalPaging.js";
import type { CompanionLayout } from "../hooks/useReadingHostLayout.js";
import {
  CompanionDock,
  type PendingCompanionCommentDraft
} from "../components/CompanionDock.js";
import { ReaderHeader } from "../components/ReaderHeader.js";
import { ReaderActions } from "../components/ReaderActions.js";
import { ReadingSyncStatus } from "../components/ReadingSyncStatus.js";

type StoredHighlight = {
  id: string;
  anchor: TextSelectionAnchor;
  createdAt: string;
};

const HIGHLIGHT_STORAGE_PREFIX = "gtd-reading-highlights";

export function NovelReader(props: {
  session: ReadingSession;
  chunks: string[];
  structuredChapter?: ParsedBookChapter;
  structuredResources?: ParsedBookResource[];
  onPosition: (index: number) => void;
  onLook: (currentText: string, selectedText: string) => void;
  onSaveQuote: (content: string) => void;
  onFinish: () => void;
  onBack: () => void;
  onFullscreen: () => void;
  fullscreenLabel?: string;
  immersive?: boolean;
  onSettings: () => void;
  onMore: () => void;
  companionComments: CompanionComment[];
  companionLoading: boolean;
  companionError?: string;
  companionLayout: CompanionLayout;
  companionLayoutRevision: number;
  syncRequestInFlight: boolean;
  canRequestPip: boolean;
  onRequestPip: () => void;
  pendingCommentDraft?: PendingCompanionCommentDraft | null;
  pendingCommentSaving?: boolean;
  onSavePendingComment?: (text: string) => void;
  onClearCompanionComments: () => void;
  initialScrollTop: number;
  onScrollPosition: (scrollTop: number) => void;
}) {
  const sourceTextForRestore = useMemo(() => props.chunks.join("\n\n"), [props.chunks]);
  const [restoredBook, setRestoredBook] = useState<ParsedBook | null>(null);
  const activeBook = activeImportedBookMatchesChunks(props.chunks)
    ? getActiveImportedBook()
    : null;

  useEffect(() => {
    if (activeBook || !sourceTextForRestore) {
      setRestoredBook(null);
      return;
    }
    let cancelled = false;
    void restoreStructuredBook(sourceTextForRestore)
      .then((book) => {
        if (!cancelled) setRestoredBook(book);
      })
      .catch(() => {
        if (!cancelled) setRestoredBook(null);
      });
    return () => {
      cancelled = true;
    };
  }, [activeBook, sourceTextForRestore]);

  const importedBook =
    activeBook ??
    (restoredBook?.sourceText === sourceTextForRestore ? restoredBook : null);
  const total = importedBook?.chapters.length ?? props.chunks.length;
  const index = Math.max(
    0,
    Math.min(Math.max(0, total - 1), props.session.userCurrentPosition.index - 1)
  );
  const structuredChapter = props.structuredChapter ?? importedBook?.chapters[index];
  const structuredResources = props.structuredResources ?? importedBook?.resources;
  const current = structuredChapter?.text ?? props.chunks[index] ?? "";
  const selectionBlocks = useMemo(
    () => getSelectionBlocks(structuredChapter),
    [structuredChapter]
  );

  const [selected, setSelected] = useState("");
  const [pendingAnchor, setPendingAnchor] = useState<TextSelectionAnchor | null>(null);
  const [storedHighlights, setStoredHighlights] = useState<StoredHighlight[]>([]);
  const [selectionMessage, setSelectionMessage] = useState("");
  const [jumpValue, setJumpValue] = useState(String(index + 1));
  const scrollRef = useRef<HTMLElement>(null);

  useEffect(() => {
    setStoredHighlights(
      structuredChapter
        ? loadHighlights(props.session.id, structuredChapter.id)
        : []
    );
    clearSelectionState();
  }, [props.session.id, structuredChapter?.id]);

  useEffect(() => {
    setJumpValue(String(index + 1));
  }, [index]);

  const chapterHighlights = useMemo(
    () => toBlockHighlights(storedHighlights, selectionBlocks),
    [storedHighlights, selectionBlocks]
  );

  const previous = () => {
    clearSelectionState();
    props.onPosition(Math.max(1, index));
  };
  const next = () => {
    clearSelectionState();
    props.onPosition(Math.min(total, index + 2));
  };
  const swipe = useHorizontalPaging(previous, next);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = props.initialScrollTop;
  }, [index, props.companionLayoutRevision, props.initialScrollTop]);

  function clearSelectionState() {
    setSelected("");
    setPendingAnchor(null);
    setSelectionMessage("");
    window.getSelection()?.removeAllRanges?.();
  }

  function jumpToPosition(value: number) {
    if (!Number.isFinite(value)) return;
    const target = Math.max(1, Math.min(total, Math.trunc(value)));
    clearSelectionState();
    setJumpValue(String(target));
    props.onPosition(target);
  }

  function submitJump(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = Number.parseInt(jumpValue, 10);
    if (!Number.isFinite(value)) {
      setJumpValue(String(index + 1));
      return;
    }
    jumpToPosition(value);
  }

  function captureSelection() {
    const selection = window.getSelection();
    const selectedText = selection?.toString().trim() ?? "";
    setSelected(selectedText);
    setPendingAnchor(null);
    setSelectionMessage("");

    if (
      !selection ||
      selection.rangeCount === 0 ||
      !structuredChapter ||
      !selectedText ||
      selectionBlocks.length === 0
    ) {
      return;
    }

    const range = selection.getRangeAt(0);
    const startElement = closestBookBlock(range.startContainer);
    const endElement = closestBookBlock(range.endContainer);
    const startBlockId = startElement?.dataset.bookBlockId;
    const endBlockId = endElement?.dataset.bookBlockId;
    if (!startElement || !endElement || !startBlockId || !endBlockId) return;

    const startOffset = textOffsetWithinBlock(
      startElement,
      range.startContainer,
      range.startOffset
    );
    const endOffset = textOffsetWithinBlock(
      endElement,
      range.endContainer,
      range.endOffset
    );
    if (startOffset === null || endOffset === null) return;

    try {
      setPendingAnchor(
        createTextSelectionAnchor({
          chapterId: structuredChapter.id,
          blocks: selectionBlocks,
          startBlockId,
          startOffset,
          endBlockId,
          endOffset
        })
      );
    } catch {
      setPendingAnchor(null);
    }
  }

  function saveSelectedQuote() {
    if (!selected) return;

    if (structuredChapter && pendingAnchor) {
      const highlight: StoredHighlight = {
        id: createHighlightId(),
        anchor: pendingAnchor,
        createdAt: new Date().toISOString()
      };
      const nextHighlights = [...storedHighlights, highlight];
      setStoredHighlights(nextHighlights);
      saveHighlights(props.session.id, structuredChapter.id, nextHighlights);
      setSelectionMessage("已经划线并收藏，重新打开这本书时仍会保留。");
    } else {
      setSelectionMessage("这句已经收藏。当前文本暂时只保存摘录。");
    }

    props.onSaveQuote(selected);
    window.getSelection()?.removeAllRanges?.();
  }

  const selectionStatus = selectionMessage ||
    (selected ? `已选中：${truncateSelection(selected)}` : "");
  const unitLabel = structuredChapter ? "阅读单元" : "段";

  return (
    <main
      className={`reader-shell reader-with-dock companion-layout-${props.companionLayout}${
        props.immersive ? " reader-immersive" : ""
      }`}
    >
      <ReaderHeader
        title={props.session.title}
        progress={
          structuredChapter
            ? `${index + 1} / ${total} · ${structuredChapter.title}`
            : `第 ${index + 1} 段 / 共 ${total} 段`
        }
        fullscreenLabel={props.fullscreenLabel}
        onBack={props.onBack}
        onFullscreen={props.onFullscreen}
        onSettings={props.onSettings}
        onMore={props.onMore}
      />
      <ReadingSyncStatus session={props.session} />
      <div className="reader-workspace">
        <section
          ref={scrollRef}
          className="reader-scroll novel-scroll"
          {...swipe}
          onScroll={(event) => props.onScrollPosition(event.currentTarget.scrollTop)}
          onMouseUp={captureSelection}
          onTouchEnd={(event) => {
            swipe.onTouchEnd(event);
            window.setTimeout(captureSelection, 0);
          }}
        >
          {structuredChapter ? (
            <FootnotedChapter
              chapter={structuredChapter}
              resources={structuredResources}
              className="novel-paper"
              highlights={chapterHighlights}
            />
          ) : (
            <article className="novel-paper">
              {current.split("\n").map((line, lineIndex) => (
                <p key={lineIndex}>{line}</p>
              ))}
            </article>
          )}
          <div className="page-buttons">
            <button onClick={previous} disabled={index === 0}>
              {structuredChapter ? "上一阅读单元" : "上一段"}
            </button>
            <form
              onSubmit={submitJump}
              aria-label={`跳转${unitLabel}`}
              style={{
                display: "grid",
                gridTemplateColumns: "auto 72px auto",
                gap: 6,
                alignItems: "center"
              }}
            >
              <span>{index + 1} / {total}</span>
              <input
                aria-label={`跳到第几${unitLabel}`}
                type="number"
                min={1}
                max={total}
                inputMode="numeric"
                value={jumpValue}
                onChange={(event) => setJumpValue(event.currentTarget.value)}
                onBlur={() => {
                  if (!jumpValue.trim()) setJumpValue(String(index + 1));
                }}
                style={{ minHeight: 36, padding: "7px 8px", textAlign: "center" }}
              />
              <button type="submit" style={{ minHeight: 36, padding: "7px 9px" }}>
                跳转
              </button>
            </form>
            <button onClick={next} disabled={index >= total - 1}>
              {structuredChapter ? "下一阅读单元" : "下一段"}
            </button>
          </div>
        </section>
        <CompanionDock
          sessionId={props.session.id}
          comments={props.companionComments}
          layout={props.companionLayout}
          layoutRevision={props.companionLayoutRevision}
          loading={props.companionLoading}
          error={props.companionError}
          canRequestPip={props.canRequestPip}
          onRequestPip={props.onRequestPip}
          pendingCommentDraft={props.pendingCommentDraft}
          pendingCommentSaving={props.pendingCommentSaving}
          onSavePendingComment={props.onSavePendingComment}
          onJump={props.onPosition}
          onClear={props.onClearCompanionComments}
        />
      </div>
      {selectionStatus ? (
        <p className="reader-selection-status" role="status">
          {selectionStatus}
        </p>
      ) : null}
      <ReaderActions
        primaryLabel={
          selected
            ? "给盖尔看这句"
            : structuredChapter
              ? "陪我看看这一阅读单元"
              : "陪我看看这里"
        }
        secondaryLabel={structuredChapter ? "划线并收藏" : "保存这句"}
        onPrimary={() => {
          props.onLook(current, selected);
          setSelectionMessage(
            selected ? "已经把这句递给盖尔。" : "已经把当前阅读内容递给盖尔。"
          );
        }}
        primaryDisabled={props.syncRequestInFlight}
        onSecondary={saveSelectedQuote}
        secondaryDisabled={!selected}
        onFinish={props.onFinish}
      />
    </main>
  );
}

function getSelectionBlocks(
  chapter: ParsedBookChapter | undefined
): SelectionTextBlock[] {
  if (!chapter) return [];
  const blocks = (chapter.blocks ?? []).flatMap((block) =>
    "text" in block && typeof block.text === "string"
      ? [{ id: block.id, text: block.text }]
      : []
  );
  return blocks.length > 0
    ? blocks
    : chapter.text
      ? [{ id: `${chapter.id}-fallback`, text: chapter.text }]
      : [];
}

function toBlockHighlights(
  highlights: StoredHighlight[],
  blocks: SelectionTextBlock[]
): BookBlockHighlight[] {
  const ranges: BookBlockHighlight[] = [];
  for (const highlight of highlights) {
    const resolved = resolveTextSelectionAnchor(highlight.anchor, blocks);
    if (!resolved) continue;
    const startIndex = blocks.findIndex((block) => block.id === resolved.startBlockId);
    const endIndex = blocks.findIndex((block) => block.id === resolved.endBlockId);
    if (startIndex < 0 || endIndex < startIndex) continue;

    for (let index = startIndex; index <= endIndex; index += 1) {
      const block = blocks[index];
      if (!block) continue;
      const startOffset = index === startIndex ? resolved.startOffset : 0;
      const endOffset = index === endIndex ? resolved.endOffset : block.text.length;
      if (endOffset <= startOffset) continue;
      ranges.push({
        id: highlight.id,
        blockId: block.id,
        startOffset,
        endOffset
      });
    }
  }
  return ranges;
}

function closestBookBlock(node: Node): HTMLElement | null {
  const element = node instanceof Element ? node : node.parentElement;
  return element?.closest<HTMLElement>("[data-book-block-id]") ?? null;
}

function textOffsetWithinBlock(
  block: HTMLElement,
  container: Node,
  offset: number
): number | null {
  const element = container instanceof Element ? container : container.parentElement;
  if (element?.closest(".book-footnote-anchor")) return null;

  try {
    const range = document.createRange();
    range.selectNodeContents(block);
    range.setEnd(container, offset);
    const fragment = range.cloneContents();
    fragment.querySelectorAll(".book-footnote-anchor").forEach((anchor) => anchor.remove());
    return fragment.textContent?.length ?? 0;
  } catch {
    return null;
  }
}

function highlightStorageKey(sessionId: string, chapterId: string): string {
  return `${HIGHLIGHT_STORAGE_PREFIX}:${sessionId}:${chapterId}`;
}

function loadHighlights(sessionId: string, chapterId: string): StoredHighlight[] {
  try {
    const raw = localStorage.getItem(highlightStorageKey(sessionId, chapterId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as StoredHighlight[];
    return Array.isArray(parsed)
      ? parsed.filter(
          (highlight) =>
            highlight &&
            typeof highlight.id === "string" &&
            highlight.anchor?.version === 1
        )
      : [];
  } catch {
    return [];
  }
}

function saveHighlights(
  sessionId: string,
  chapterId: string,
  highlights: StoredHighlight[]
): void {
  try {
    localStorage.setItem(
      highlightStorageKey(sessionId, chapterId),
      JSON.stringify(highlights)
    );
  } catch {
    // The normal quote path still works if local highlight storage is unavailable.
  }
}

function createHighlightId(): string {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  return `highlight-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function truncateSelection(text: string): string {
  const normalized = text.replace(/\s+/gu, " ").trim();
  return normalized.length > 72 ? `${normalized.slice(0, 72)}…` : normalized;
}
