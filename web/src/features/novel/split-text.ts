import {
  splitNovelText as splitPlainNovelText,
  splitNovelTextForVersion
} from "@ss/shared";
import { getActiveImportedBook } from "../book-import/active-imported-book.js";

export function splitNovelText(sourceText: string): string[] {
  const activeBook = getActiveImportedBook();
  if (activeBook && activeBook.sourceText === sourceText) {
    return activeBook.chapters.map((chapter) => chapter.text).filter(Boolean);
  }
  return splitPlainNovelText(sourceText);
}

export { splitNovelTextForVersion };
