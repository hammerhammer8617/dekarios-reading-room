import {
  splitNovelText as splitPlainNovelText,
  splitNovelTextForVersion
} from "@ss/shared";
import { getActiveImportedBook } from "../book-import/active-imported-book.js";
import { importedBookReadingUnits } from "../book-import/reading-units.js";

export function splitNovelText(sourceText: string): string[] {
  const activeBook = getActiveImportedBook();
  if (activeBook && activeBook.sourceText === sourceText) {
    return importedBookReadingUnits(activeBook);
  }
  return splitPlainNovelText(sourceText);
}

export { splitNovelTextForVersion };
