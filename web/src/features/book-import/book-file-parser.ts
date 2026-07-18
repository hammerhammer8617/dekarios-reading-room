import {
  detectImportBookFormat,
  isPlainTextBookFormat,
  stripBookFileExtension
} from "./detect-format.js";
import { parseEpubFile } from "./epub-dom.js";
import { BookImportError, type ParsedBook } from "./types.js";

const MAX_TEXT_FILE_SIZE = 5 * 1024 * 1024;

export async function parseBookFile(file: File): Promise<ParsedBook> {
  const format = detectImportBookFormat(file);
  if (isPlainTextBookFormat(format)) {
    if (file.size > MAX_TEXT_FILE_SIZE) {
      throw new BookImportError(
        "文档超过 5 MB，请拆分后再导入。",
        "file_too_large",
        format
      );
    }
    const sourceText = (await file.text()).trim();
    if (!sourceText) {
      throw new BookImportError("文档内容为空。", "empty_book", format);
    }
    return {
      format,
      fileName: file.name,
      title: stripBookFileExtension(file.name),
      authors: [],
      sourceText,
      chapters: [
        {
          id: "document",
          title: "正文",
          text: sourceText,
          blocks: sourceText
            .split(/\n\s*\n/u)
            .map((text, index) => ({
              id: `document-block-${index + 1}`,
              type: "paragraph" as const,
              text: text.trim()
            }))
            .filter((block) => block.text)
        }
      ]
    };
  }

  if (format === "epub") return parseEpubFile(file);
  if (format === "unsupported") {
    throw new BookImportError("不支持这种文件格式。", "unsupported_format", format);
  }

  throw new BookImportError(
    `${format.toUpperCase()} 解析器正在接入。`,
    "format_not_ready",
    format
  );
}
