import type { ParsedBook, ParsedBookBlock, ParsedBookChapter } from "./types.js";

export function importedBookReadingUnits(book: ParsedBook): string[] {
  return book.chapters.map(chapterReadingUnitText);
}

export function chapterReadingUnitText(chapter: ParsedBookChapter): string {
  if (!chapter.blocks?.length) return chapter.text;

  const text = chapter.blocks
    .map(blockReadingText)
    .filter(Boolean)
    .join("\n\n")
    .trim();

  return text || chapter.text || `【图片单元：${chapter.title || "未命名插图"}】`;
}

function blockReadingText(block: ParsedBookBlock): string {
  if (block.type === "separator") return "";
  if (block.type !== "image") return block.text;

  const description = block.alt?.trim() || block.title?.trim() || "插图";
  return `【图片：${description}】`;
}
