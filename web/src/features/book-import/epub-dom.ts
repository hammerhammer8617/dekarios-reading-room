import { BookImportError, type ParsedBookChapter } from "./types.js";

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
