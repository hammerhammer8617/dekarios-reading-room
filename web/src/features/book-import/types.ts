import type { ImportBookFormat } from "./detect-format.js";

export type ParsedBookFormat = Exclude<ImportBookFormat, "unsupported">;

export interface ParsedBookFootnoteReference {
  id: string;
  noteId: string;
  label: string;
  offset: number;
}

export interface ParsedBookFootnote {
  id: string;
  label: string;
  text: string;
  targetHref: string;
  backHref?: string;
}

export type ParsedBookBlock =
  | {
      id: string;
      type: "heading";
      level: number;
      text: string;
      footnoteRefs?: ParsedBookFootnoteReference[];
    }
  | {
      id: string;
      type: "paragraph" | "blockquote" | "list_item" | "preformatted";
      text: string;
      footnoteRefs?: ParsedBookFootnoteReference[];
    }
  | {
      id: string;
      type: "image";
      resourcePath: string;
      alt?: string;
      title?: string;
    }
  | {
      id: string;
      type: "separator";
    };

export interface ParsedBookChapter {
  id: string;
  href?: string;
  title: string;
  text: string;
  blocks?: ParsedBookBlock[];
  footnotes?: ParsedBookFootnote[];
}

export interface ParsedBookResource {
  path: string;
  mediaType: string;
  blob: Blob;
}

export interface ParsedBook {
  format: ParsedBookFormat;
  fileName: string;
  title: string;
  authors: string[];
  language?: string;
  sourceText: string;
  chapters: ParsedBookChapter[];
  resources?: ParsedBookResource[];
}

export class BookImportError extends Error {
  constructor(
    message: string,
    readonly code:
      | "unsupported_format"
      | "format_not_ready"
      | "file_too_large"
      | "invalid_epub"
      | "empty_book",
    readonly format?: ImportBookFormat
  ) {
    super(message);
    this.name = "BookImportError";
  }
}
