import { BinderyError, type BinderyFormat } from "./types.js";

const FORMAT_BY_EXTENSION: Record<string, BinderyFormat> = {
  txt: "txt",
  md: "markdown",
  markdown: "markdown",
  html: "html",
  htm: "html",
  docx: "docx",
  pdf: "pdf",
  mobi: "mobi",
  azw3: "azw3",
  epub: "epub"
};

export const ACCEPTED_BOOK_FILES = Object.keys(FORMAT_BY_EXTENSION)
  .map((extension) => `.${extension}`)
  .join(",");

export function detectBinderyFormat(fileName: string): BinderyFormat {
  const extension = fileName.split(".").pop()?.toLowerCase() ?? "";
  const format = FORMAT_BY_EXTENSION[extension];
  if (!format) {
    throw new BinderyError(
      "暂不支持这种格式。请选择 TXT、Markdown、HTML、DOCX、PDF、MOBI、AZW3 或 EPUB。",
      "unsupported_format"
    );
  }
  return format;
}

export function stripBookExtension(fileName: string): string {
  return fileName.replace(/\.(txt|md|markdown|html?|docx|pdf|mobi|azw3|epub)$/iu, "");
}

export function safeEpubFileName(title: string): string {
  const safe = title
    .normalize("NFC")
    .replace(/[\\/:*?"<>|\u0000-\u001f]/gu, "-")
    .replace(/\s+/gu, " ")
    .trim()
    .slice(0, 120);
  return `${safe || "converted-book"}.epub`;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}
