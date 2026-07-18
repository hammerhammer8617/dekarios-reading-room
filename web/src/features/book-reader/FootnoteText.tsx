import { Fragment, useEffect, useId, useMemo, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import type {
  ParsedBookFootnote,
  ParsedBookFootnoteReference
} from "../book-import/types.js";

export interface TextHighlightRange {
  id: string;
  startOffset: number;
  endOffset: number;
}

export interface FootnoteTextProps {
  text: string;
  references?: ParsedBookFootnoteReference[];
  notes?: ParsedBookFootnote[];
  highlights?: TextHighlightRange[];
}

const anchorStyle: CSSProperties = { position: "relative", display: "inline" };
const triggerStyle: CSSProperties = {
  border: 0,
  background: "transparent",
  font: "inherit",
  fontSize: "0.72em",
  verticalAlign: "super",
  cursor: "pointer",
  padding: 0
};
const popoverStyle: CSSProperties = {
  position: "absolute",
  zIndex: 30,
  left: "50%",
  bottom: "1.4em",
  width: "min(22rem, calc(100vw - 2rem))",
  maxHeight: "18rem",
  overflow: "auto",
  transform: "translateX(-50%)",
  padding: "1rem 2.2rem 1rem 1rem",
  border: "1px solid rgba(80,70,95,.18)",
  borderRadius: "1rem",
  background: "white",
  color: "#2b2630",
  boxShadow: "0 12px 36px rgba(0,0,0,.18)",
  fontSize: "0.9rem",
  lineHeight: 1.65,
  textAlign: "left",
  whiteSpace: "normal"
};
const closeStyle: CSSProperties = {
  position: "absolute",
  top: "0.35rem",
  right: "0.55rem",
  border: 0,
  background: "transparent",
  cursor: "pointer"
};

export function FootnoteText({
  text,
  references = [],
  notes = [],
  highlights = []
}: FootnoteTextProps) {
  const ownerId = useId();
  const [openReferenceId, setOpenReferenceId] = useState<string | null>(null);
  const notesById = useMemo(
    () => new Map(notes.map((note) => [note.id, note])),
    [notes]
  );
  const sortedReferences = [...references]
    .filter((reference) => reference.offset >= 0 && reference.offset <= text.length)
    .sort((left, right) => left.offset - right.offset);
  const normalizedHighlights = useMemo(
    () => normalizeHighlights(highlights, text.length),
    [highlights, text.length]
  );

  useEffect(() => {
    if (!openReferenceId) return;
    const closeOnPointerDown = (event: PointerEvent) => {
      const target = event.target;
      const element =
        target instanceof Element
          ? target
          : target instanceof Node
            ? target.parentElement
            : null;
      const clickedOwner = element
        ?.closest<HTMLElement>("[data-footnote-owner]")
        ?.dataset.footnoteOwner;
      if (clickedOwner !== ownerId) setOpenReferenceId(null);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpenReferenceId(null);
    };
    document.addEventListener("pointerdown", closeOnPointerDown);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnPointerDown);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [openReferenceId, ownerId]);

  let cursor = 0;
  return (
    <span className="book-text-with-footnotes">
      {sortedReferences.map((reference) => {
        const note = notesById.get(reference.noteId);
        const before = renderHighlightedSlice(
          text,
          cursor,
          reference.offset,
          normalizedHighlights,
          `${reference.id}-before`
        );
        cursor = reference.offset;
        const popoverId = `${ownerId}-${reference.id}`;
        const isOpen = openReferenceId === reference.id;
        return (
          <Fragment key={reference.id}>
            {before}
            <span
              className="book-footnote-anchor"
              style={anchorStyle}
              data-footnote-owner={ownerId}
            >
              <button
                type="button"
                className="book-footnote-trigger"
                style={triggerStyle}
                aria-expanded={isOpen}
                aria-controls={popoverId}
                onClick={() => setOpenReferenceId(isOpen ? null : reference.id)}
              >
                {reference.label}
              </button>
              {isOpen ? (
                <span
                  id={popoverId}
                  role="dialog"
                  aria-label={`脚注 ${reference.label}`}
                  className="book-footnote-popover"
                  style={popoverStyle}
                >
                  <strong>{reference.label}</strong>
                  <span style={{ display: "block", marginTop: "0.3rem" }}>
                    {note?.text ?? "这条脚注暂时无法读取。"}
                  </span>
                  <button
                    type="button"
                    className="book-footnote-close"
                    style={closeStyle}
                    aria-label="关闭脚注"
                    onClick={() => setOpenReferenceId(null)}
                  >
                    ×
                  </button>
                </span>
              ) : null}
            </span>
          </Fragment>
        );
      })}
      {renderHighlightedSlice(
        text,
        cursor,
        text.length,
        normalizedHighlights,
        "tail"
      )}
    </span>
  );
}

function normalizeHighlights(
  highlights: TextHighlightRange[],
  textLength: number
): TextHighlightRange[] {
  const sorted = highlights
    .map((highlight) => ({
      ...highlight,
      startOffset: Math.max(0, Math.min(textLength, highlight.startOffset)),
      endOffset: Math.max(0, Math.min(textLength, highlight.endOffset))
    }))
    .filter((highlight) => highlight.endOffset > highlight.startOffset)
    .sort((left, right) => left.startOffset - right.startOffset || left.endOffset - right.endOffset);

  const merged: TextHighlightRange[] = [];
  for (const highlight of sorted) {
    const previous = merged.at(-1);
    if (!previous || highlight.startOffset > previous.endOffset) {
      merged.push({ ...highlight });
      continue;
    }
    previous.endOffset = Math.max(previous.endOffset, highlight.endOffset);
    previous.id = `${previous.id}+${highlight.id}`;
  }
  return merged;
}

function renderHighlightedSlice(
  text: string,
  start: number,
  end: number,
  highlights: TextHighlightRange[],
  keyPrefix: string
): ReactNode[] {
  if (end <= start) return [];
  const nodes: ReactNode[] = [];
  let cursor = start;
  const relevant = highlights.filter(
    (highlight) => highlight.endOffset > start && highlight.startOffset < end
  );

  for (const highlight of relevant) {
    const highlightStart = Math.max(start, highlight.startOffset);
    const highlightEnd = Math.min(end, highlight.endOffset);
    if (highlightStart > cursor) {
      nodes.push(text.slice(cursor, highlightStart));
    }
    if (highlightEnd > highlightStart) {
      nodes.push(
        <mark
          key={`${keyPrefix}-${highlight.id}-${highlightStart}`}
          className="book-highlight"
          data-highlight-id={highlight.id}
        >
          {text.slice(highlightStart, highlightEnd)}
        </mark>
      );
    }
    cursor = Math.max(cursor, highlightEnd);
  }

  if (cursor < end) nodes.push(text.slice(cursor, end));
  return nodes;
}
