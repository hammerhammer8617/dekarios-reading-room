import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import type {
  ParsedBookFootnote,
  ParsedBookFootnoteReference
} from "../book-import/types.js";

export interface FootnoteTextProps {
  text: string;
  references?: ParsedBookFootnoteReference[];
  notes?: ParsedBookFootnote[];
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

export function FootnoteText({ text, references = [], notes = [] }: FootnoteTextProps) {
  const [openNoteId, setOpenNoteId] = useState<string | null>(null);
  const rootRef = useRef<HTMLSpanElement>(null);
  const notesById = useMemo(
    () => new Map(notes.map((note) => [note.id, note])),
    [notes]
  );
  const sortedReferences = [...references]
    .filter((reference) => reference.offset >= 0 && reference.offset <= text.length)
    .sort((left, right) => left.offset - right.offset);

  useEffect(() => {
    if (!openNoteId) return;
    const closeOnPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpenNoteId(null);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpenNoteId(null);
    };
    document.addEventListener("pointerdown", closeOnPointerDown);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnPointerDown);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [openNoteId]);

  let cursor = 0;
  return (
    <span ref={rootRef} className="book-text-with-footnotes">
      {sortedReferences.map((reference) => {
        const note = notesById.get(reference.noteId);
        const before = text.slice(cursor, reference.offset);
        cursor = reference.offset;
        const popoverId = `footnote-popover-${reference.id}`;
        const isOpen = openNoteId === reference.noteId;
        return (
          <Fragment key={reference.id}>
            {before}
            <span className="book-footnote-anchor" style={anchorStyle}>
              <button
                type="button"
                className="book-footnote-trigger"
                style={triggerStyle}
                aria-expanded={isOpen}
                aria-controls={popoverId}
                onClick={() => setOpenNoteId(isOpen ? null : reference.noteId)}
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
                    onClick={() => setOpenNoteId(null)}
                  >
                    ×
                  </button>
                </span>
              ) : null}
            </span>
          </Fragment>
        );
      })}
      {text.slice(cursor)}
    </span>
  );
}
