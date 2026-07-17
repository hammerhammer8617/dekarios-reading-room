import type { ParsedBook } from "./types.js";
import { importedBookReadingUnits } from "./reading-units.js";

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
  if (!book || book.format !== "epub" || chunks.length === 0) return false;
  const readingUnits = importedBookReadingUnits(book);
  return (
    readingUnits.length === chunks.length &&
    readingUnits.every((unit, index) => unit === chunks[index])
  );
}
