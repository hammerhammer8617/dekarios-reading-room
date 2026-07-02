import { BookImportError, type ParsedBook, type ParsedBookChapter } from "./types.js";
import {
  epubDirectoryName,
  openEpubArchive,
  readEpubText,
  resolveEpubPath
} from "./epub-path.js";
import { readEpubCreators } from "./epub-metadata.js";

const XHTML_MEDIA_TYPES = new Set(["application/xhtml+xml", "text/html"]);

export async function parseEpubFile(file: File): Promise<ParsedBook> {
  const archive = await openEpubArchive(file);
  const container = parseEpubXml(readEpubText(archive, "META-INF/container.xml"));
  const packagePath = firstEpubElement(container, "rootfile")
    ?.getAttribute("full-path")
    ?.trim();
  if (!packagePath) {
    throw new BookImportError("EPUB 缺少 OPF 入口。", "invalid_epub", "epub");
  }

  const packageDocument = parseEpubXml(readEpubText(archive, packagePath));
  const baseDirectory = epubDirectoryName(packagePath);
  const manifest = new Map<string, { href: string; mediaType: string }>();
  for (const item of epubElements(packageDocument, "item")) {
    const id = item.getAttribute("id")?.trim();
    const href = item.getAttribute("href")?.trim();
    const mediaType = item.getAttribute("media-type")?.trim();
    if (id && href && mediaType) manifest.set(id, { href, mediaType });
  }

  const spine = epubElements(packageDocument, "itemref")
    .map((item) => item.getAttribute("idref")?.trim())
    .filter((value): value is string => Boolean(value));
  const chapters: ParsedBookChapter[] = [];
  for (const [index, id] of spine.entries()) {
    const item = manifest.get(id);
    if (!item || !XHTML_MEDIA_TYPES.has(item.mediaType)) continue;
    const href = item.href.split("#", 1)[0] ?? item.href;
    const path = resolveEpubPath(baseDirectory, href);
    const markup = readEpubText(archive, path, false);
    if (!markup) continue;
    const chapter = parseEpubChapter(markup, id, path, index + 1);
    if (chapter.text) chapters.push(chapter);
  }

  const sourceText = chapters.map((chapter) => chapter.text).join("\n\n").trim();
  if (!sourceText) {
    throw new BookImportError("EPUB 中没有找到可阅读的正文。", "empty_book", "epub");
  }

  return {
    format: "epub",
    fileName: file.name,
    title: firstEpubText(packageDocument, "title") || file.name.replace(/\.[^.]+$/, ""),
    authors: readEpubCreators(packageDocument),
    language: firstEpubText(packageDocument, "language") || undefined,
    sourceText,
    chapters
  };
}

export function parseEpubXml(source: string): XMLDocument {
  if (!source) {
    throw new BookImportError("EPUB 内部文件缺失。", "invalid_epub", "epub");
  }
  const document = new DOMParser().parseFromString(source, "application/xml");
  if (document.querySelector("parsererror")) {
    throw new BookImportError("EPUB 内部 XML 无法解析。", "invalid_epub", "epub");
  }
  return document;
}

export function epubElements(document: Document, localName: string): Element[] {
  return Array.from(document.getElementsByTagNameNS("*", localName));
}

export function firstEpubElement(document: Document, localName: string): Element | null {
  return epubElements(document, localName)[0] ?? null;
}

export function firstEpubText(document: Document, localName: string): string {
  return cleanEpubText(firstEpubElement(document, localName)?.textContent ?? "");
}

export function parseEpubChapter(
  markup: string,
  id: string,
  href: string,
  ordinal: number
): ParsedBookChapter {
  const parser = new DOMParser();
  let document = parser.parseFromString(markup, "application/xhtml+xml");
  if (document.querySelector("parsererror")) {
    document = parser.parseFromString(markup, "text/html") as unknown as XMLDocument;
  }
  const body = firstEpubElement(document, "body") ?? document.documentElement;
  const nodes = Array.from(
    body.querySelectorAll("h1,h2,h3,h4,h5,h6,p,li,blockquote,pre")
  );
  const blocks = nodes.map((node) => cleanEpubText(node.textContent ?? "")).filter(Boolean);
  const text = (blocks.length ? blocks.join("\n\n") : cleanEpubText(body.textContent ?? "")).trim();
  const heading = nodes.find((node) => /^H[1-6]$/i.test(node.tagName));
  return {
    id,
    href,
    title: cleanEpubText(heading?.textContent ?? "") || `第 ${ordinal} 章`,
    text
  };
}

export function cleanEpubText(value: string): string {
  return value
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\s*\n\s*/g, " ")
    .trim();
}
