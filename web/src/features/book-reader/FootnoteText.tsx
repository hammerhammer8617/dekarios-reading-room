import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import type {
  ParsedBookFootnote,
  ParsedBookFootnoteReference
} from "../book-import/types.js";

export interface FootnoteTextProps {
  text: string;
  references?: ParsedBookFootnoteReference[];
  notes?: ParsedBookFootnote[];
}

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
            <span className="book-footnote-anchor">
              <button
                type="button"
                className="book-footnote-trigger"
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
                >
                  <span className="book-footnote-popover-label">{reference.label}</span>
                  <span className="book-footnote-popover-text">
                    {note?.text ?? "这条脚注暂时无法读取。"}
                  </span>
                  <button
                    type="button"
                    className="book-footnote-close"
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
