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
import { FootnoteText } from "../features/book-reader/FootnoteText.js";
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
  onComment: (currentText: string, selectedText: string, note?: string) => void;
  onRequestGaleHighlight: (currentText: string) => void;
  onSync: () => void;
  onSaveQuote: (content: string, note?: string) => void;
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
  const plainSelectionBlocks = useMemo(
    () => getPlainSelectionBlocks(current, index),
    [current, index]
  );
  const selectionBlocks = useMemo(
    () => structuredChapter ? getSelectionBlocks(structuredChapter) : plainSelectionBlocks,
    [plainSelectionBlocks, structuredChapter]
  );
  const highlightScopeId = structuredChapter?.id ?? `plain-unit-${index + 1}`;

  const [selected, setSelected] = useState("");
  const [selectionNote, setSelectionNote] = useState("");
  const [pendingAnchor, setPendingAnchor] = useState<TextSelectionAnchor | null>(null);
  const [storedHighlights, setStoredHighlights] = useState<StoredHighlight[]>([]);
  const [selectionMessage, setSelectionMessage] = useState("");
  const [jumpValue, setJumpValue] = useState(String(index + 1));
  const scrollRef = useRef<HTMLElement>(null);

  useEffect(() => {
    setStoredHighlights(loadHighlights(props.session.id, highlightScopeId));
    clearSelectionState();
  }, [highlightScopeId, props.session.id]);

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
    setSelectionNote("");
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
    setSelectionNote("");
    setPendingAnchor(null);
    setSelectionMessage("");

    if (
      !selection ||
      !selection.rangeCount ||
      typeof selection.getRangeAt !== "function" ||
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
          chapterId: highlightScopeId,
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

    if (pendingAnchor) {
      const highlight: StoredHighlight = {
        id: createHighlightId(),
        anchor: pendingAnchor,
        createdAt: new Date().toISOString()
      };
      const nextHighlights = [...storedHighlights, highlight];
      setStoredHighlights(nextHighlights);
      saveHighlights(props.session.id, highlightScopeId, nextHighlights);
      setSelectionMessage("已经在书页上划线并收藏，重新打开时仍会保留。");
    } else {
      setSelectionMessage("这句已经收藏。当前文本暂时只保存摘录。");
    }

    props.onSaveQuote(selected, selectionNote.trim() || undefined);
    window.getSelection()?.removeAllRanges?.();
  }

  function renderJumpControl(scope: "page" | "toolbar") {
    const prefix = scope === "toolbar" ? "工具栏" : "";
    return (
      <form
        onSubmit={submitJump}
        aria-label={`${prefix}跳转${unitLabel}`}
        style={{
          display: "grid",
          gridTemplateColumns: "auto 72px auto",
          gap: 6,
          alignItems: "center"
        }}
      >
        <span>{index + 1} / {total}</span>
        <input
          aria-label={`${prefix}跳到第几${unitLabel}`}
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
        <button
          type="submit"
          aria-label={`${prefix}跳转`}
          style={{ minHeight: 36, padding: "7px 9px" }}
        >
          跳转
        </button>
      </form>
    );
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
      <div className="reader-jump-toolbar" aria-label="阅读跳转工具栏">
        <button
          onClick={previous}
          disabled={index === 0}
          aria-label={`工具栏上一${structuredChapter ? "阅读单元" : "段"}`}
        >
          上一{structuredChapter ? "单元" : "段"}
        </button>
        {renderJumpControl("toolbar")}
        <button
          onClick={next}
          disabled={index >= total - 1}
          aria-label={`工具栏下一${structuredChapter ? "阅读单元" : "段"}`}
        >
          下一{structuredChapter ? "单元" : "段"}
        </button>
      </div>
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
              {plainSelectionBlocks.map((block) => (
                <p key={block.id} data-book-block-id={block.id}>
                  <FootnoteText
                    text={block.text}
                    highlights={chapterHighlights
                      .filter((highlight) => highlight.blockId === block.id)
                      .map(({ blockId: _blockId, ...highlight }) => highlight)}
                  />
                </p>
              ))}
            </article>
          )}
          <div className="page-buttons">
            <button onClick={previous} disabled={index === 0}>
              {structuredChapter ? "上一阅读单元" : "上一段"}
            </button>
            {renderJumpControl("page")}
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
      {!selected && selectionStatus ? (
        <p className="reader-selection-status" role="status">
          {selectionStatus}
        </p>
      ) : null}
      {selected ? (
        <section className="reader-selection-card" aria-label="选句操作">
          <div className="reader-selection-card-header">
            <strong>你选中的句子</strong>
            <button
              type="button"
              className="reader-selection-close"
              aria-label="取消选句"
              onClick={clearSelectionState}
            >
              ×
            </button>
          </div>
          <p className="reader-selected-quote">{truncateSelection(selected)}</p>
          <label className="reader-selection-note">
            <span>批注给盖尔（可选）</span>
            <textarea
              aria-label="批注给盖尔"
              maxLength={4_000}
              rows={2}
              value={selectionNote}
              placeholder="写下你想和盖尔一起看的地方"
              onChange={(event) => setSelectionNote(event.currentTarget.value)}
            />
          </label>
          <div className="reader-selection-actions">
            <button
              type="button"
              className="action-primary"
              disabled={props.syncRequestInFlight}
              onClick={() => {
                const note = selectionNote.trim();
                props.onComment(current, selected, note || undefined);
                setSelectionMessage(
                  note ? "这句和批注已经递给盖尔。" : "这句已经递给盖尔。"
                );
                window.getSelection()?.removeAllRanges?.();
              }}
            >
              {selectionNote.trim() ? "连同批注递给盖尔" : "把这句递给盖尔"}
            </button>
            <button type="button" onClick={saveSelectedQuote}>
              划线并收藏
            </button>
          </div>
          {selectionMessage ? (
            <p className="reader-selection-card-status" role="status">
              {selectionMessage}
            </p>
          ) : null}
        </section>
      ) : null}
      <ReaderActions
        primaryLabel="盖尔会划哪一句？"
        secondaryLabel="同步到这里"
        onPrimary={() => {
          props.onRequestGaleHighlight(current);
          setSelectionMessage("已经把本段静默递给盖尔，请看他的回赠划线。");
        }}
        primaryDisabled={props.syncRequestInFlight}
        onSecondary={props.onSync}
        secondaryDisabled={props.syncRequestInFlight}
        onFinish={props.onFinish}
        helperText="“盖尔会划哪一句”会从本段挑一句并完整批注；“同步到这里”只静默补齐阅读位置。"
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

function getPlainSelectionBlocks(
  text: string,
  index: number
): SelectionTextBlock[] {
  return text.split("\n").map((line, lineIndex) => ({
    id: `plain-unit-${index + 1}-line-${lineIndex + 1}`,
    text: line
  }));
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
