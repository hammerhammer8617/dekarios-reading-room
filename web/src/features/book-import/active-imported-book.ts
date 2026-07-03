import type { ParsedBook } from "./types.js";

let activeImportedBook: ParsedBook | null = null;

export function setActiveImportedBook(book: ParsedBook): void {
  activeImportedBook = book;
}

export function getActiveImportedBook(): ParsedBook | null {
  return activeImportedBook;
}

export function clearActiveImportedBook(): void {
  activeImportedBook = null;
}

export function activeImportedBookMatchesChunks(chunks: string[]): boolean {
  const book = activeImportedBook;
  if (!book || book.format !== "epub" || book.chapters.length !== chunks.length || chunks.length === 0) return false;
  const first = book.chapters[0]?.text ?? "";
  const last = book.chapters.at(-1)?.text ?? "";
  return chunks[0] === first && chunks.at(-1) === last;
}
