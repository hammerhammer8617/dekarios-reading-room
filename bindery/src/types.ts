export type BinderyFormat =
  | "txt"
  | "markdown"
  | "html"
  | "docx"
  | "pdf"
  | "mobi"
  | "azw3"
  | "epub";

export type BinderyChapter = {
  title: string;
  html: string;
};

export type BinderyAsset = {
  id: string;
  fileName: string;
  mediaType: string;
  bytes: Uint8Array;
};

export type BinderyBook = {
  title: string;
  authors: string[];
  language: string;
  chapters: BinderyChapter[];
  assets: BinderyAsset[];
  warnings: string[];
};

export type CompressionPass = {
  label: string;
  maxDimension: number;
  quality: number;
};

export type BuiltEpub = {
  blob: Blob;
  bytes: Uint8Array;
  fileName: string;
  sizeBytes: number;
  passLabel: string;
  warnings: string[];
};

export class BinderyError extends Error {
  constructor(
    message: string,
    readonly code:
      | "unsupported_format"
      | "empty_book"
      | "encrypted_book"
      | "scan_requires_ocr"
      | "file_too_large"
      | "output_too_large"
      | "parse_failed"
  ) {
    super(message);
    this.name = "BinderyError";
  }
}
