import type { BinderyAsset } from "./types.js";

const REMOVED_ELEMENTS = [
  "script",
  "style",
  "iframe",
  "object",
  "embed",
  "form",
  "input",
  "button",
  "textarea",
  "select",
  "canvas",
  "video",
  "audio",
  "source"
];

const SAFE_ATTRIBUTES = new Set([
  "alt",
  "colspan",
  "epub:type",
  "height",
  "href",
  "id",
  "lang",
  "rowspan",
  "src",
  "title",
  "width",
  "xml:lang"
]);

export class AssetCollector {
  private readonly assets: BinderyAsset[] = [];
  private readonly sourceToAsset = new Map<string, BinderyAsset>();

  async collect(source: string): Promise<BinderyAsset | null> {
    const existing = this.sourceToAsset.get(source);
    if (existing) return existing;

    const loaded = await loadImageSource(source).catch(() => null);
    if (!loaded || !loaded.mediaType.startsWith("image/")) return null;

    const id = `image-${this.assets.length + 1}`;
    const extension = extensionForMediaType(loaded.mediaType);
    const asset: BinderyAsset = {
      id,
      fileName: `${id}.${extension}`,
      mediaType: normalizeImageMediaType(loaded.mediaType),
      bytes: loaded.bytes
    };
    this.assets.push(asset);
    this.sourceToAsset.set(source, asset);
    return asset;
  }

  list(): BinderyAsset[] {
    return this.assets.map((asset) => ({ ...asset, bytes: asset.bytes.slice() }));
  }
}

export async function cleanChapterHtml(
  rawHtml: string,
  collector: AssetCollector,
  warnings: string[]
): Promise<string> {
  const document = new DOMParser().parseFromString(rawHtml, "text/html");
  document.querySelectorAll(REMOVED_ELEMENTS.join(",")).forEach((element) => element.remove());

  for (const element of Array.from(document.body.querySelectorAll("*"))) {
    for (const attribute of Array.from(element.attributes)) {
      if (attribute.name.toLowerCase().startsWith("on") || !SAFE_ATTRIBUTES.has(attribute.name)) {
        element.removeAttribute(attribute.name);
      }
    }
  }

  for (const image of Array.from(document.body.querySelectorAll("img"))) {
    const source = image.getAttribute("src")?.trim() ?? "";
    if (!source) {
      image.remove();
      continue;
    }
    if (!/^(data:|blob:)/iu.test(source)) {
      warnings.push("HTML 中有无法随单文件一起读取的外部图片，已从成品中移除。");
      image.remove();
      continue;
    }
    const asset = await collector.collect(source);
    if (!asset) {
      warnings.push("有一张图片无法读取，已从成品中移除。");
      image.remove();
      continue;
    }
    image.setAttribute("src", `../assets/${asset.fileName}`);
    image.removeAttribute("width");
    image.removeAttribute("height");
  }

  for (const anchor of Array.from(document.body.querySelectorAll("a"))) {
    const href = anchor.getAttribute("href")?.trim() ?? "";
    if (/^javascript:/iu.test(href)) anchor.removeAttribute("href");
  }

  const serializer = new XMLSerializer();
  const html = Array.from(document.body.childNodes)
    .map((node) => serializer.serializeToString(node))
    .join("")
    .trim();
  return html || "<p>（本章没有可显示的正文。）</p>";
}

export function plainTextToHtml(text: string): string {
  return text
    .replace(/\r\n?/gu, "\n")
    .split(/\n{2,}/u)
    .map((paragraph) => `<p>${escapeHtml(paragraph.trim()).replace(/\n/gu, "<br />")}</p>`)
    .filter((paragraph) => paragraph !== "<p></p>")
    .join("\n");
}

export function markdownToHtml(markdown: string): string {
  const lines = markdown.replace(/\r\n?/gu, "\n").split("\n");
  const output: string[] = [];
  let paragraph: string[] = [];
  let listType: "ul" | "ol" | null = null;
  let inCode = false;
  let code: string[] = [];

  const flushParagraph = () => {
    if (paragraph.length === 0) return;
    output.push(`<p>${inlineMarkdown(paragraph.join(" "))}</p>`);
    paragraph = [];
  };
  const closeList = () => {
    if (!listType) return;
    output.push(`</${listType}>`);
    listType = null;
  };

  for (const line of lines) {
    if (/^```/u.test(line)) {
      flushParagraph();
      closeList();
      if (inCode) {
        output.push(`<pre><code>${escapeHtml(code.join("\n"))}</code></pre>`);
        code = [];
      }
      inCode = !inCode;
      continue;
    }
    if (inCode) {
      code.push(line);
      continue;
    }

    const heading = /^(#{1,6})\s+(.+)$/u.exec(line);
    if (heading) {
      flushParagraph();
      closeList();
      const level = heading[1]?.length ?? 1;
      output.push(`<h${level}>${inlineMarkdown(heading[2] ?? "")}</h${level}>`);
      continue;
    }

    const unordered = /^\s*[-*+]\s+(.+)$/u.exec(line);
    const ordered = /^\s*\d+[.)]\s+(.+)$/u.exec(line);
    if (unordered || ordered) {
      flushParagraph();
      const nextType = unordered ? "ul" : "ol";
      if (listType !== nextType) {
        closeList();
        listType = nextType;
        output.push(`<${nextType}>`);
      }
      output.push(`<li>${inlineMarkdown((unordered ?? ordered)?.[1] ?? "")}</li>`);
      continue;
    }

    const quote = /^>\s?(.*)$/u.exec(line);
    if (quote) {
      flushParagraph();
      closeList();
      output.push(`<blockquote><p>${inlineMarkdown(quote[1] ?? "")}</p></blockquote>`);
      continue;
    }

    if (!line.trim()) {
      flushParagraph();
      closeList();
      continue;
    }
    paragraph.push(line.trim());
  }

  if (inCode && code.length > 0) output.push(`<pre><code>${escapeHtml(code.join("\n"))}</code></pre>`);
  flushParagraph();
  closeList();
  return output.join("\n");
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/gu, "&amp;")
    .replace(/</gu, "&lt;")
    .replace(/>/gu, "&gt;")
    .replace(/"/gu, "&quot;")
    .replace(/'/gu, "&#39;");
}

function inlineMarkdown(value: string): string {
  return escapeHtml(value)
    .replace(/`([^`]+)`/gu, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/gu, "<strong>$1</strong>")
    .replace(/__([^_]+)__/gu, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/gu, "<em>$1</em>")
    .replace(/_([^_]+)_/gu, "<em>$1</em>");
}

async function loadImageSource(source: string): Promise<{ bytes: Uint8Array; mediaType: string }> {
  if (source.startsWith("data:")) {
    const match = /^data:([^;,]+)?(;base64)?,(.*)$/isu.exec(source);
    if (!match) throw new Error("Invalid data URL");
    const mediaType = match[1] || "application/octet-stream";
    const encoded = match[3] ?? "";
    if (match[2]) {
      const binary = atob(encoded.replace(/\s/gu, ""));
      return {
        mediaType,
        bytes: Uint8Array.from(binary, (character) => character.charCodeAt(0))
      };
    }
    return {
      mediaType,
      bytes: new TextEncoder().encode(decodeURIComponent(encoded))
    };
  }
  const response = await fetch(source);
  if (!response.ok) throw new Error("Unable to fetch image");
  return {
    mediaType: response.headers.get("content-type") ?? "application/octet-stream",
    bytes: new Uint8Array(await response.arrayBuffer())
  };
}

function normalizeImageMediaType(mediaType: string): string {
  if (mediaType === "image/jpg") return "image/jpeg";
  if (mediaType === "image/svg") return "image/svg+xml";
  return mediaType.split(";", 1)[0]?.toLowerCase() ?? "application/octet-stream";
}

function extensionForMediaType(mediaType: string): string {
  const normalized = normalizeImageMediaType(mediaType);
  if (normalized === "image/jpeg") return "jpg";
  if (normalized === "image/png") return "png";
  if (normalized === "image/gif") return "gif";
  if (normalized === "image/webp") return "webp";
  if (normalized === "image/svg+xml") return "svg";
  if (normalized === "image/avif") return "avif";
  return "bin";
}
