import {
  BookImportError,
  type ParsedBook,
  type ParsedBookChapter,
  type ParsedBookResource
} from "./types.js";
import {
  epubDirectoryName,
  openEpubArchive,
  readEpubBytes,
  readEpubText,
  resolveEpubPath
} from "./epub-path.js";
import { readEpubCreators } from "./epub-metadata.js";
import { readEpub2TocTitles } from "./epub-toc.js";
import { cleanBlockText, epubBlocksToText, extractEpubBlocks } from "./epub-blocks.js";

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
  const mediaTypeByPath = new Map<string, string>();
  for (const item of epubElements(packageDocument, "item")) {
    const id = item.getAttribute("id")?.trim();
    const href = item.getAttribute("href")?.trim();
    const mediaType = item.getAttribute("media-type")?.trim();
    if (!id || !href || !mediaType) continue;
    manifest.set(id, { href, mediaType });
    mediaTypeByPath.set(resolveEpubPath(baseDirectory, href), mediaType);
  }

  const tocTitles = readTocTitles(archive, packageDocument, manifest, baseDirectory);
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
    const chapter = parseEpubChapter(markup, id, path, index + 1, tocTitles.get(path));
    if (chapter.text || chapter.blocks?.some((block) => block.type === "image")) {
      chapters.push(chapter);
    }
  }

  const sourceText = chapters.map((chapter) => chapter.text).filter(Boolean).join("\n\n").trim();
  if (!sourceText) {
    throw new BookImportError("EPUB 中没有找到可阅读的正文。", "empty_book", "epub");
  }

  const resources = collectReferencedResources(archive, chapters, mediaTypeByPath);
  return {
    format: "epub",
    fileName: file.name,
    title: firstEpubText(packageDocument, "title") || file.name.replace(/\.[^.]+$/, ""),
    authors: readEpubCreators(packageDocument),
    language: firstEpubText(packageDocument, "language") || undefined,
    sourceText,
    chapters,
    resources
  };
}

function collectReferencedResources(
  archive: Awaited<ReturnType<typeof openEpubArchive>>,
  chapters: ParsedBookChapter[],
  mediaTypeByPath: Map<string, string>
): ParsedBookResource[] {
  const paths = new Set<string>();
  for (const chapter of chapters) {
    for (const block of chapter.blocks ?? []) {
      if (block.type === "image") paths.add(block.resourcePath);
    }
  }

  const resources: ParsedBookResource[] = [];
  for (const path of paths) {
    const bytes = readEpubBytes(archive, path, false);
    if (!bytes) continue;
    const mediaType = mediaTypeByPath.get(path) ?? inferImageMediaType(path);
    resources.push({ path, mediaType, blob: new Blob([bytes], { type: mediaType }) });
  }
  return resources;
}

function inferImageMediaType(path: string): string {
  const extension = path.split(".").pop()?.toLowerCase();
  if (extension === "png") return "image/png";
  if (extension === "jpg" || extension === "jpeg") return "image/jpeg";
  if (extension === "gif") return "image/gif";
  if (extension === "svg") return "image/svg+xml";
  if (extension === "webp") return "image/webp";
  return "application/octet-stream";
}

function readTocTitles(
  archive: Awaited<ReturnType<typeof openEpubArchive>>,
  packageDocument: Document,
  manifest: Map<string, { href: string; mediaType: string }>,
  baseDirectory: string
): Map<string, string> {
  const tocId = firstEpubElement(packageDocument, "spine")?.getAttribute("toc")?.trim();
  const tocItem = tocId ? manifest.get(tocId) : undefined;
  if (!tocItem || tocItem.mediaType !== "application/x-dtbncx+xml") return new Map();

  const tocPath = resolveEpubPath(baseDirectory, tocItem.href);
  const tocMarkup = readEpubText(archive, tocPath, false);
  if (!tocMarkup) return new Map();
  return readEpub2TocTitles(parseEpubXml(tocMarkup), tocPath);
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
  return cleanBlockText(firstEpubElement(document, localName)?.textContent ?? "");
}

export function parseEpubChapter(
  markup: string,
  id: string,
  href: string,
  ordinal: number,
  preferredTitle?: string
): ParsedBookChapter {
  const parser = new DOMParser();
  let document = parser.parseFromString(markup, "application/xhtml+xml");
  if (document.querySelector("parsererror")) {
    document = parser.parseFromString(markup, "text/html") as unknown as XMLDocument;
  }

  const body = firstEpubElement(document, "body") ?? document.documentElement;
  const blocks = extractEpubBlocks(body, id, href);
  if (blocks.length === 0) {
    const fallbackText = cleanBlockText(body.textContent ?? "");
    if (fallbackText) {
      blocks.push({ id: `${id}-block-1`, type: "paragraph", text: fallbackText });
    }
  }
  const firstHeading = blocks.find((block) => block.type === "heading");

  return {
    id,
    href,
    title:
      cleanBlockText(preferredTitle ?? "") ||
      (firstHeading?.type === "heading" ? firstHeading.text : "") ||
      `第 ${ordinal} 章`,
    text: epubBlocksToText(blocks),
    blocks
  };
}
