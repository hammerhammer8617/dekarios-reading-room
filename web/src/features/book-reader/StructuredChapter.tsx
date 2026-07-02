import { createElement } from "react";
import type {
  ParsedBookChapter,
  ParsedBookResource
} from "../book-import/types.js";
import { useBookResourceUrls } from "./use-book-resource-urls.js";

export interface StructuredChapterProps {
  chapter: ParsedBookChapter;
  resources?: ParsedBookResource[];
  className?: string;
}

export function StructuredChapter({
  chapter,
  resources,
  className
}: StructuredChapterProps) {
  const resourceUrls = useBookResourceUrls(resources);
  const blocks = chapter.blocks?.length
    ? chapter.blocks
    : chapter.text
        .split(/\n\s*\n/u)
        .map((text, index) => ({
          id: `${chapter.id}-fallback-${index + 1}`,
          type: "paragraph" as const,
          text: text.trim()
        }))
        .filter((block) => block.text);

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
            block.text
          );
        }

        if (block.type === "paragraph") {
          return (
            <p key={block.id} className="book-paragraph">
              {block.text}
            </p>
          );
        }

        if (block.type === "blockquote") {
          return (
            <blockquote key={block.id} className="book-blockquote">
              {block.text}
            </blockquote>
          );
        }

        if (block.type === "list_item") {
          return (
            <ul key={block.id} className="book-list">
              <li>{block.text}</li>
            </ul>
          );
        }

        if (block.type === "preformatted") {
          return (
            <pre key={block.id} className="book-preformatted">
              {block.text}
            </pre>
          );
        }

        if (block.type === "separator") {
          return <hr key={block.id} className="book-separator" />;
        }

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
