import { createElement } from "react";
import type {
  ParsedBookChapter,
  ParsedBookFootnoteReference,
  ParsedBookResource
} from "../book-import/types.js";
import { FootnoteText } from "./FootnoteText.js";
import { useBookResourceUrls } from "./use-book-resource-urls.js";
import "./structured-chapter.css";

export interface FootnotedChapterProps {
  chapter: ParsedBookChapter;
  resources?: ParsedBookResource[];
  className?: string;
}

export function FootnotedChapter({
  chapter,
  resources,
  className
}: FootnotedChapterProps) {
  const resourceUrls = useBookResourceUrls(resources);
  const blocks = chapter.blocks ?? [];
  const textWithNotes = (text: string, references?: ParsedBookFootnoteReference[]) => (
    <FootnoteText text={text} references={references} notes={chapter.footnotes} />
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
            { key: block.id, className: `book-heading book-heading-${level}` },
            textWithNotes(block.text, block.footnoteRefs)
          );
        }
        if (block.type === "paragraph") {
          return <p key={block.id} className="book-paragraph">{textWithNotes(block.text, block.footnoteRefs)}</p>;
        }
        if (block.type === "blockquote") {
          return <blockquote key={block.id} className="book-blockquote">{textWithNotes(block.text, block.footnoteRefs)}</blockquote>;
        }
        if (block.type === "list_item") {
          return <ul key={block.id} className="book-list"><li>{textWithNotes(block.text, block.footnoteRefs)}</li></ul>;
        }
        if (block.type === "preformatted") {
          return <pre key={block.id} className="book-preformatted">{textWithNotes(block.text, block.footnoteRefs)}</pre>;
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
