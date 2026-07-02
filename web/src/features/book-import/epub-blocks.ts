import type {
  ParsedBookBlock,
  ParsedBookFootnote
} from "./types.js";
import { epubDirectoryName, resolveEpubPath } from "./epub-path.js";
import { extractTextAndFootnoteRefs } from "./epub-footnotes.js";

export interface EpubBlockExtractionOptions {
  notesByTarget?: ReadonlyMap<string, ParsedBookFootnote>;
  footnoteContainers?: ReadonlySet<Element>;
}

export function extractEpubBlocks(
  body: Element,
  chapterId: string,
  chapterPath: string,
  options: EpubBlockExtractionOptions = {}
): ParsedBookBlock[] {
  const blocks: ParsedBookBlock[] = [];
  const notesByTarget = options.notesByTarget ?? new Map<string, ParsedBookFootnote>();
  let sequence = 0;
  const nextId = () => `${chapterId}-block-${++sequence}`;

  const readText = (element: Element) =>
    extractTextAndFootnoteRefs(element, chapterPath, notesByTarget);

  const visit = (element: Element): void => {
    if (options.footnoteContainers?.has(element)) return;
    const tag = element.localName.toLowerCase();
    if (["script", "style", "nav"].includes(tag)) return;

    if (/^h[1-6]$/.test(tag)) {
      const { text, footnoteRefs } = readText(element);
      if (text) {
        blocks.push({
          id: nextId(),
          type: "heading",
          level: Number(tag.slice(1)),
          text,
          ...(footnoteRefs.length ? { footnoteRefs } : {})
        });
      }
      return;
    }

    if (tag === "img") {
      const src = element.getAttribute("src")?.trim();
      if (!src) return;
      blocks.push({
        id: nextId(),
        type: "image",
        resourcePath: resolveEpubPath(epubDirectoryName(chapterPath), src),
        alt: cleanBlockText(element.getAttribute("alt") ?? "") || undefined,
        title: cleanBlockText(element.getAttribute("title") ?? "") || undefined
      });
      return;
    }

    if (tag === "hr") {
      blocks.push({ id: nextId(), type: "separator" });
      return;
    }

    if (["p", "blockquote", "li", "pre"].includes(tag)) {
      const { text, footnoteRefs } = readText(element);
      if (text) {
        const type =
          tag === "blockquote"
            ? "blockquote"
            : tag === "li"
              ? "list_item"
              : tag === "pre"
                ? "preformatted"
                : "paragraph";
        blocks.push({
          id: nextId(),
          type,
          text,
          ...(footnoteRefs.length ? { footnoteRefs } : {})
        });
      }
      for (const image of Array.from(element.querySelectorAll("img"))) visit(image);
      return;
    }

    const children = Array.from(element.children);
    if (children.length === 0) {
      const { text, footnoteRefs } = readText(element);
      if (text) {
        blocks.push({
          id: nextId(),
          type: "paragraph",
          text,
          ...(footnoteRefs.length ? { footnoteRefs } : {})
        });
      }
      return;
    }
    for (const child of children) visit(child);
  };

  for (const child of Array.from(body.children)) visit(child);
  return blocks;
}

export function epubBlocksToText(blocks: ParsedBookBlock[]): string {
  return blocks
    .filter(
      (block): block is Exclude<ParsedBookBlock, { type: "image" | "separator" }> =>
        block.type !== "image" && block.type !== "separator"
    )
    .map((block) => block.text)
    .filter(Boolean)
    .join("\n\n")
    .trim();
}

export function cleanBlockText(value: string): string {
  return value
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\s*\n\s*/g, " ")
    .trim();
}
