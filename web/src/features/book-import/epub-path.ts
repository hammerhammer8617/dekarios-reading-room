import { strFromU8, unzipSync } from "fflate";
import { BookImportError } from "./types.js";

export type EpubArchive = Record<string, Uint8Array>;

export async function openEpubArchive(file: File): Promise<EpubArchive> {
  if (file.size > 40 * 1024 * 1024) {
    throw new BookImportError("EPUB 文件超过 40 MB。", "file_too_large", "epub");
  }
  let archive: EpubArchive;
  try {
    archive = unzipSync(new Uint8Array(await file.arrayBuffer()));
  } catch {
    throw new BookImportError("无法解压 EPUB 文件。", "invalid_epub", "epub");
  }
  const unpackedBytes = Object.values(archive).reduce((sum, item) => sum + item.byteLength, 0);
  if (unpackedBytes > 160 * 1024 * 1024) {
    throw new BookImportError("EPUB 解压后的内容过大。", "file_too_large", "epub");
  }
  return archive;
}

export function readEpubBytes(
  archive: EpubArchive,
  requestedPath: string,
  required = true
): Uint8Array | null {
  const normalized = normalizeEpubPath(requestedPath);
  const entry = archive[normalized] ?? archive[safeDecodeEpubPath(normalized)];
  if (!entry && required) {
    throw new BookImportError("EPUB 内部文件缺失。", "invalid_epub", "epub");
  }
  return entry ?? null;
}

export function readEpubText(
  archive: EpubArchive,
  requestedPath: string,
  required = true
): string {
  const entry = readEpubBytes(archive, requestedPath, required);
  return entry ? strFromU8(entry) : "";
}

export function normalizeEpubPath(value: string): string {
  const parts: string[] = [];
  const clean = value.replace(/\\/g, "/").split(/[?#]/, 1)[0] ?? "";
  for (const part of clean.split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") parts.pop();
    else parts.push(part);
  }
  return parts.join("/");
}

export function resolveEpubPath(base: string, href: string): string {
  return normalizeEpubPath([base, href].filter(Boolean).join("/"));
}

export function epubDirectoryName(value: string): string {
  const normalized = normalizeEpubPath(value);
  const index = normalized.lastIndexOf("/");
  return index < 0 ? "" : normalized.slice(0, index);
}

export function safeDecodeEpubPath(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
