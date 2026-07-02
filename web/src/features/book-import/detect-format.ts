export type ImportBookFormat =
  | "txt"
  | "markdown"
  | "epub"
  | "pdf"
  | "mobi"
  | "azw3"
  | "unsupported";

const FORMAT_BY_EXTENSION: Record<string, ImportBookFormat> = {
  txt: "txt",
  md: "markdown",
  markdown: "markdown",
  epub: "epub",
  pdf: "pdf",
  mobi: "mobi",
  azw3: "azw3"
};

const FORMAT_BY_MIME_TYPE: Record<string, ImportBookFormat> = {
  "text/plain": "txt",
  "text/markdown": "markdown",
  "application/epub+zip": "epub",
  "application/pdf": "pdf",
  "application/x-mobipocket-ebook": "mobi",
  "application/vnd.amazon.ebook": "azw3"
};

export function detectImportBookFormat(
  file: Pick<File, "name" | "type">
): ImportBookFormat {
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  return FORMAT_BY_EXTENSION[extension] ?? FORMAT_BY_MIME_TYPE[file.type] ?? "unsupported";
}
