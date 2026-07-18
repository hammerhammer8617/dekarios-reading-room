import { strToU8, zipSync, type Zippable } from "fflate";
import { safeEpubFileName } from "./format.js";
import { compressAsset } from "./images.js";
import { escapeHtml } from "./html.js";
import {
  BinderyError,
  type BinderyAsset,
  type BinderyBook,
  type BuiltEpub,
  type CompressionPass
} from "./types.js";

export const MAX_EPUB_OUTPUT_BYTES = 40 * 1024 * 1024;
export const SAFE_EPUB_OUTPUT_BYTES = MAX_EPUB_OUTPUT_BYTES - 128 * 1024;

export const COMPRESSION_PASSES: CompressionPass[] = [
  { label: "高清", maxDimension: 2400, quality: 0.84 },
  { label: "平衡", maxDimension: 1900, quality: 0.74 },
  { label: "紧凑", maxDimension: 1500, quality: 0.64 },
  { label: "节省空间", maxDimension: 1100, quality: 0.54 },
  { label: "最低可读", maxDimension: 760, quality: 0.44 }
];

export async function buildEpubWithinBudget(
  book: BinderyBook,
  onPass?: (label: string) => void
): Promise<BuiltEpub> {
  if (book.chapters.length === 0) {
    throw new BinderyError("没有可以装订的章节。", "empty_book");
  }

  let smallestSize = Number.POSITIVE_INFINITY;
  for (const pass of COMPRESSION_PASSES) {
    onPass?.(pass.label);
    const assets = await Promise.all(book.assets.map((asset) => compressAsset(asset, pass)));
    const bytes = packageEpub(book, assets);
    smallestSize = Math.min(smallestSize, bytes.byteLength);
    if (bytes.byteLength <= SAFE_EPUB_OUTPUT_BYTES) {
      assertEpubFits(bytes);
      return {
        blob: new Blob([toArrayBuffer(bytes)], { type: "application/epub+zip" }),
        bytes,
        fileName: safeEpubFileName(book.title),
        sizeBytes: bytes.byteLength,
        passLabel: pass.label,
        warnings: book.warnings
      };
    }
  }

  throw new BinderyError(
    `已经压缩到最低可读档，成品仍有 ${(smallestSize / 1024 / 1024).toFixed(2)} MB，无法保证小于 40 MB。`,
    "output_too_large"
  );
}

export function packageEpub(book: BinderyBook, assets: BinderyAsset[]): Uint8Array {
  const identifier = `urn:uuid:${createIdentifier()}`;
  const files: Zippable = {};
  files.mimetype = [strToU8("application/epub+zip"), { level: 0 }];
  files["META-INF/container.xml"] = strToU8(CONTAINER_XML);
  files["OEBPS/styles/book.css"] = strToU8(BOOK_CSS);

  const chapterItems = book.chapters.map((chapter, index) => {
    const id = `chapter-${index + 1}`;
    const href = `text/${id}.xhtml`;
    files[`OEBPS/${href}`] = strToU8(chapterXhtml(book.language, chapter.title, chapter.html));
    return { id, href, title: chapter.title };
  });
  for (const asset of assets) files[`OEBPS/assets/${asset.fileName}`] = asset.bytes;

  files["OEBPS/nav.xhtml"] = strToU8(navXhtml(book.language, book.title, chapterItems));
  files["OEBPS/content.opf"] = strToU8(
    contentOpf(book, identifier, chapterItems, assets)
  );
  return zipSync(files, { level: 9 });
}

export function assertEpubFits(bytes: Pick<Uint8Array, "byteLength">): void {
  if (bytes.byteLength >= MAX_EPUB_OUTPUT_BYTES) {
    throw new BinderyError("EPUB 成品没有通过 40 MB 硬限制校验。", "output_too_large");
  }
}

function chapterXhtml(language: string, title: string, body: string): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="${escapeXml(language)}" lang="${escapeXml(language)}">
<head><meta charset="utf-8"/><title>${escapeXml(title)}</title><link rel="stylesheet" type="text/css" href="../styles/book.css"/></head>
<body><main><h1>${escapeXml(title)}</h1>${body}</main></body>
</html>`;
}

function navXhtml(
  language: string,
  title: string,
  chapters: Array<{ href: string; title: string }>
): string {
  const items = chapters
    .map((chapter) => `<li><a href="${escapeXml(chapter.href)}">${escapeXml(chapter.title)}</a></li>`)
    .join("");
  return `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="${escapeXml(language)}">
<head><title>${escapeXml(title)}</title></head>
<body><nav epub:type="toc" id="toc"><h1>${escapeXml(title)}</h1><ol>${items}</ol></nav></body>
</html>`;
}

function contentOpf(
  book: BinderyBook,
  identifier: string,
  chapters: Array<{ id: string; href: string }>,
  assets: BinderyAsset[]
): string {
  const creators = book.authors
    .map((author) => `<dc:creator>${escapeXml(author)}</dc:creator>`)
    .join("");
  const chapterManifest = chapters
    .map((chapter) => `<item id="${chapter.id}" href="${chapter.href}" media-type="application/xhtml+xml"/>`)
    .join("");
  const assetManifest = assets
    .map(
      (asset) =>
        `<item id="${escapeXml(asset.id)}" href="assets/${escapeXml(asset.fileName)}" media-type="${escapeXml(asset.mediaType)}"/>`
    )
    .join("");
  const spine = chapters.map((chapter) => `<itemref idref="${chapter.id}"/>`).join("");
  return `<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="book-id" xml:lang="${escapeXml(book.language)}">
<metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
<dc:identifier id="book-id">${escapeXml(identifier)}</dc:identifier>
<dc:title>${escapeXml(book.title)}</dc:title>${creators}
<dc:language>${escapeXml(book.language)}</dc:language>
<meta property="dcterms:modified">${new Date().toISOString().replace(/\.\d{3}Z$/u, "Z")}</meta>
</metadata>
<manifest><item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/><item id="css" href="styles/book.css" media-type="text/css"/>${chapterManifest}${assetManifest}</manifest>
<spine>${spine}</spine>
</package>`;
}

function createIdentifier(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function escapeXml(value: string): string {
  return escapeHtml(value);
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

const CONTAINER_XML = `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
<rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles>
</container>`;

const BOOK_CSS = `html { color-scheme: light; }
body { margin: 0 auto; max-width: 42em; padding: 5%; color: #251f28; background: #fffdf8; font-family: serif; line-height: 1.75; }
h1, h2, h3 { line-height: 1.35; margin: 1.6em 0 .8em; }
p { margin: 0 0 1em; text-align: justify; }
img { display: block; max-width: 100%; height: auto; margin: 1em auto; }
blockquote { margin: 1em 0; padding-left: 1em; border-left: .2em solid #8a6f8f; }
pre { white-space: pre-wrap; overflow-wrap: anywhere; }
a { color: #62486c; }`;
