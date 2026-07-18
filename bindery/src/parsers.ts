import { detectBinderyFormat, stripBookExtension } from "./format.js";
import {
  AssetCollector,
  cleanChapterHtml,
  markdownToHtml,
  plainTextToHtml
} from "./html.js";
import { BinderyError, type BinderyBook, type BinderyChapter } from "./types.js";

const MAX_INPUT_BYTES = 350 * 1024 * 1024;
const TARGET_TEXT_CHAPTER_CHARS = 60_000;
const PDF_PAGES_PER_CHAPTER = 12;

export async function parseSourceBook(file: File): Promise<BinderyBook> {
  if (file.size > MAX_INPUT_BYTES) {
    throw new BinderyError("原文件超过 350 MB，浏览器本地转换可能耗尽内存。", "file_too_large");
  }
  const format = detectBinderyFormat(file.name);
  if (format === "epub") {
    throw new BinderyError("EPUB 会走保留原排版的重新压缩通道。", "parse_failed");
  }

  try {
    if (format === "txt" || format === "markdown") return parseTextBook(file, format);
    if (format === "html") return parseHtmlBook(file);
    if (format === "docx") return parseDocxBook(file);
    if (format === "pdf") return parsePdfBook(file);
    if (format === "mobi" || format === "azw3") return parseMobiBook(file, format);
  } catch (error) {
    if (error instanceof BinderyError) throw error;
    const message = error instanceof Error ? error.message : String(error);
    if (/drm|encrypt|password|protected/iu.test(message)) {
      throw new BinderyError("这本书可能带有 DRM 或密码保护，装订室不会尝试破解。", "encrypted_book");
    }
    throw new BinderyError(`没有成功读取这本书：${message.slice(0, 160)}`, "parse_failed");
  }

  throw new BinderyError("暂不支持这种格式。", "unsupported_format");
}

async function parseTextBook(file: File, format: "txt" | "markdown"): Promise<BinderyBook> {
  const text = (await decodeBookText(file)).trim();
  if (!text) throw new BinderyError("文档里没有可转换的正文。", "empty_book");
  const title = stripBookExtension(file.name);
  const chunks = splitLongText(text, format === "markdown");
  return {
    title,
    authors: [],
    language: "zh-CN",
    chapters: chunks.map((chunk, index) => ({
      title: chunk.title || (chunks.length === 1 ? "正文" : `第 ${index + 1} 部分`),
      html: format === "markdown" ? markdownToHtml(chunk.text) : plainTextToHtml(chunk.text)
    })),
    assets: [],
    warnings: []
  };
}

async function parseHtmlBook(file: File): Promise<BinderyBook> {
  const text = await decodeBookText(file);
  const document = new DOMParser().parseFromString(text, "text/html");
  const title = document.querySelector("title")?.textContent?.trim() || stripBookExtension(file.name);
  const collector = new AssetCollector();
  const warnings: string[] = [];
  const html = await cleanChapterHtml(document.body.innerHTML, collector, warnings);
  if (!new DOMParser().parseFromString(html, "text/html").body.textContent?.trim()) {
    throw new BinderyError("HTML 中没有可转换的正文。", "empty_book");
  }
  return {
    title,
    authors: readHtmlAuthors(document),
    language: document.documentElement.lang || "zh-CN",
    chapters: [{ title: "正文", html }],
    assets: collector.list(),
    warnings: uniqueWarnings(warnings)
  };
}

async function parseDocxBook(file: File): Promise<BinderyBook> {
  const { default: mammoth } = await import("mammoth");
  const result = await mammoth.convertToHtml(
    { arrayBuffer: await file.arrayBuffer() },
    {
      convertImage: mammoth.images.imgElement(async (image) => ({
        src: `data:${image.contentType};base64,${await image.readAsBase64String()}`
      }))
    }
  );
  const collector = new AssetCollector();
  const warnings = result.messages.map((message) => message.message);
  const html = await cleanChapterHtml(result.value, collector, warnings);
  const text = new DOMParser().parseFromString(html, "text/html").body.textContent?.trim() ?? "";
  if (!text) throw new BinderyError("DOCX 中没有可转换的正文。", "empty_book");
  return {
    title: stripBookExtension(file.name),
    authors: [],
    language: "zh-CN",
    chapters: splitHtmlAtHeadings(html),
    assets: collector.list(),
    warnings: uniqueWarnings(warnings)
  };
}

async function parsePdfBook(file: File): Promise<BinderyBook> {
  const pdfjs = await import("pdfjs-dist");
  const pdfWorkerUrl = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
  pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
  const loadingTask = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
  const document = await loadingTask.promise;
  const pages: string[] = [];
  let metadataTitle = "";
  let metadataAuthor = "";

  try {
    const metadata = await document.getMetadata();
    const info = metadata.info as { Title?: string; Author?: string };
    metadataTitle = info.Title?.trim() ?? "";
    metadataAuthor = info.Author?.trim() ?? "";
  } catch {
    // Metadata is optional and many valid PDFs do not contain it.
  }

  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    const page = await document.getPage(pageNumber);
    const content = await page.getTextContent();
    const text = content.items
      .map((item) => {
        if (!("str" in item)) return "";
        return `${item.str}${"hasEOL" in item && item.hasEOL ? "\n" : " "}`;
      })
      .join("")
      .replace(/[ \t]+\n/gu, "\n")
      .replace(/[ \t]{2,}/gu, " ")
      .trim();
    pages.push(text);
    page.cleanup();
  }
  await document.destroy();

  const nonEmptyPages = pages.filter(Boolean);
  if (nonEmptyPages.length === 0 || nonEmptyPages.join("").length < Math.max(80, pages.length * 8)) {
    throw new BinderyError(
      "这份 PDF 几乎没有可提取文字，应该是扫描版；第一版装订室暂不包含 OCR。",
      "scan_requires_ocr"
    );
  }

  const chapters: BinderyChapter[] = [];
  for (let start = 0; start < pages.length; start += PDF_PAGES_PER_CHAPTER) {
    const end = Math.min(pages.length, start + PDF_PAGES_PER_CHAPTER);
    const pageHtml = pages
      .slice(start, end)
      .map((text, offset) =>
        `<section><h2>第 ${start + offset + 1} 页</h2>${plainTextToHtml(text || "（本页没有可提取文字。）")}</section>`
      )
      .join("\n");
    chapters.push({
      title: pages.length <= PDF_PAGES_PER_CHAPTER ? "正文" : `第 ${start + 1}–${end} 页`,
      html: pageHtml
    });
  }
  return {
    title: metadataTitle || stripBookExtension(file.name),
    authors: metadataAuthor ? [metadataAuthor] : [],
    language: "zh-CN",
    chapters,
    assets: [],
    warnings: ["PDF 转换会保留可提取文字与页码，但不会复刻原始版式。"]
  };
}

async function parseMobiBook(file: File, format: "mobi" | "azw3"): Promise<BinderyBook> {
  const { initKf8File, initMobiFile } = await import("@lingo-reader/mobi-parser");
  const parser = format === "azw3" ? await initKf8File(file) : await initMobiFile(file);
  const metadata = parser.getMetadata();
  const collector = new AssetCollector();
  const warnings: string[] = [];
  const tocTitles = new Map<string, string>();

  const walkToc = (items: Array<{ label: string; href: string; children?: unknown[] }>) => {
    for (const item of items) {
      const resolved = parser.resolveHref(item.href);
      if (resolved?.id && item.label.trim()) tocTitles.set(resolved.id, item.label.trim());
      if (Array.isArray(item.children)) {
        walkToc(item.children as Array<{ label: string; href: string; children?: unknown[] }>);
      }
    }
  };
  walkToc(parser.getToc());

  const chapters: BinderyChapter[] = [];
  try {
    for (const [index, spineItem] of parser.getSpine().entries()) {
      const chapter = await parser.loadChapter(spineItem.id);
      if (!chapter?.html) continue;
      const html = await cleanChapterHtml(chapter.html, collector, warnings);
      const text = new DOMParser().parseFromString(html, "text/html").body.textContent?.trim() ?? "";
      if (!text && !/<img\b/iu.test(html)) continue;
      chapters.push({
        title: tocTitles.get(spineItem.id) || `第 ${index + 1} 章`,
        html
      });
    }
  } finally {
    parser.destroy();
  }

  if (chapters.length === 0) {
    throw new BinderyError("没有从这本 Kindle 电子书中读到正文；它可能带有 DRM。", "encrypted_book");
  }
  return {
    title: metadata.title?.trim() || stripBookExtension(file.name),
    authors: Array.isArray(metadata.author) ? metadata.author.filter(Boolean) : [],
    language: metadata.language?.trim() || "zh-CN",
    chapters,
    assets: collector.list(),
    warnings: uniqueWarnings(warnings)
  };
}

async function decodeBookText(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    try {
      return new TextDecoder("gb18030").decode(bytes);
    } catch {
      return new TextDecoder().decode(bytes);
    }
  }
}

function splitLongText(text: string, markdown: boolean): Array<{ title: string; text: string }> {
  const headingPattern = markdown
    ? /^#{1,3}\s+(.+)$/u
    : /^\s*(第[零〇一二三四五六七八九十百千万两\d]+[章节卷部篇回].{0,40})\s*$/u;
  const lines = text.replace(/\r\n?/gu, "\n").split("\n");
  const chunks: Array<{ title: string; text: string }> = [];
  let title = "";
  let current: string[] = [];

  const flush = () => {
    const body = current.join("\n").trim();
    if (body) chunks.push({ title, text: body });
    current = [];
  };

  for (const line of lines) {
    const heading = headingPattern.exec(line);
    if (heading && current.join("\n").length > 600) {
      flush();
      title = (heading[1] ?? line).replace(/^#+\s*/u, "").trim();
    }
    current.push(line);
    if (current.join("\n").length >= TARGET_TEXT_CHAPTER_CHARS) {
      flush();
      title = "";
    }
  }
  flush();
  return chunks.length > 0 ? chunks : [{ title: "正文", text }];
}

function splitHtmlAtHeadings(html: string): BinderyChapter[] {
  const document = new DOMParser().parseFromString(html, "text/html");
  const chapters: BinderyChapter[] = [];
  let title = "正文";
  let nodes: Node[] = [];
  const flush = () => {
    if (nodes.length === 0) return;
    const content = nodes.map((node) => new XMLSerializer().serializeToString(node)).join("");
    chapters.push({ title, html: content });
    nodes = [];
  };
  for (const node of Array.from(document.body.childNodes)) {
    if (node instanceof Element && /^(H1|H2)$/u.test(node.tagName) && nodes.length > 0) {
      flush();
      title = node.textContent?.trim() || `第 ${chapters.length + 1} 部分`;
    }
    nodes.push(node);
  }
  flush();
  return chapters.length > 0 ? chapters : [{ title: "正文", html }];
}

function readHtmlAuthors(document: Document): string[] {
  return Array.from(document.querySelectorAll('meta[name="author"],meta[property="author"]'))
    .map((element) => element.getAttribute("content")?.trim() ?? "")
    .filter(Boolean);
}

function uniqueWarnings(warnings: string[]): string[] {
  return Array.from(new Set(warnings.map((warning) => warning.trim()).filter(Boolean))).slice(0, 12);
}
