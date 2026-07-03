import { createElement } from "react";
import type {
  ParsedBookChapter,
  ParsedBookFootnoteReference,
  ParsedBookResource
} from "../book-import/types.js";
import { FootnoteText, type TextHighlightRange } from "./FootnoteText.js";
import { useBookResourceUrls } from "./use-book-resource-urls.js";
import "./structured-chapter.css";

export interface BookBlockHighlight extends TextHighlightRange {
  blockId: string;
}

export interface FootnotedChapterProps {
  chapter: ParsedBookChapter;
  resources?: ParsedBookResource[];
  className?: string;
  highlights?: BookBlockHighlight[];
}

export function FootnotedChapter({
  chapter,
  resources,
  className,
  highlights = []
}: FootnotedChapterProps) {
  const resourceUrls = useBookResourceUrls(resources);
  const blocks = chapter.blocks ?? [];
  const textWithNotes = (
    text: string,
    references: ParsedBookFootnoteReference[] | undefined,
    blockId: string
  ) => (
    <FootnoteText
      text={text}
      references={references}
      notes={chapter.footnotes}
      highlights={highlights
        .filter((highlight) => highlight.blockId === blockId)
        .map(({ blockId: _blockId, ...highlight }) => highlight)}
    />
  );

  return (
    <article
      className={["structured-chapter", className].filter(Boolean).join(" ")}
      aria-label={chapter.title}
    >
      {blocks.map((block) => {
        if (block.type === "heading") {
          const level = Math.min(6, Math.max(1, block.level));
          return createElement(
            `h${level}`,
            {
              key: block.id,
              className: `book-heading book-heading-${level}`,
              "data-book-block-id": block.id
            },
            textWithNotes(block.text, block.footnoteRefs, block.id)
          );
        }
        if (block.type === "paragraph") {
          return (
            <p
              key={block.id}
              className="book-paragraph"
              data-book-block-id={block.id}
            >
              {textWithNotes(block.text, block.footnoteRefs, block.id)}
            </p>
          );
        }
        if (block.type === "blockquote") {
          return (
            <blockquote
              key={block.id}
              className="book-blockquote"
              data-book-block-id={block.id}
            >
              {textWithNotes(block.text, block.footnoteRefs, block.id)}
            </blockquote>
          );
        }
        if (block.type === "list_item") {
          return (
            <ul key={block.id} className="book-list">
              <li data-book-block-id={block.id}>
                {textWithNotes(block.text, block.footnoteRefs, block.id)}
              </li>
            </ul>
          );
        }
        if (block.type === "preformatted") {
          return (
            <pre
              key={block.id}
              className="book-preformatted"
              data-book-block-id={block.id}
            >
              {textWithNotes(block.text, block.footnoteRefs, block.id)}
            </pre>
          );
        }
        if (block.type === "separator") {
          return <hr key={block.id} className="book-separator" />;
        }

        if (block.type !== "image") return null;

        const src = resourceUrls.get(block.resourcePath);
        return (
          <figure key={block.id} className="book-figure">
            {src ? (
              <img
                src={src}
                alt={block.alt ?? ""}
                title={block.title}
                loading="lazy"
                decoding="async"
                className="book-image"
              />
            ) : (
              <div className="book-image-missing" role="note">
                {block.alt || "图片资源暂时无法显示"}
              </div>
            )}
            {block.title ? <figcaption>{block.title}</figcaption> : null}
          </figure>
        );
      })}
    </article>
  );
}
