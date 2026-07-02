import { BookImportError } from "./types.js";

export type EpubArchive = Record<string, Uint8Array>;

const textDecoder = new TextDecoder();

export async function openEpubArchive(file: File): Promise<EpubArchive> {
  if (file.size > 40 * 1024 * 1024) {
    throw new BookImportError("EPUB 文件超过 40 MB。", "file_too_large", "epub");
  }

  let archive: EpubArchive;
  try {
    archive = await unzipEpubArchive(new Uint8Array(await file.arrayBuffer()));
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
  return entry ? textDecoder.decode(entry) : "";
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

async function unzipEpubArchive(bytes: Uint8Array): Promise<EpubArchive> {
  const centralDirectoryOffset = findCentralDirectoryOffset(bytes);
  const entries = new Map<string, Uint8Array>();
  let offset = centralDirectoryOffset;

  while (readUint32(bytes, offset) === 0x02014b50) {
    const method = readUint16(bytes, offset + 10);
    const compressedSize = readUint32(bytes, offset + 20);
    const uncompressedSize = readUint32(bytes, offset + 24);
    const fileNameLength = readUint16(bytes, offset + 28);
    const extraLength = readUint16(bytes, offset + 30);
    const commentLength = readUint16(bytes, offset + 32);
    const localHeaderOffset = readUint32(bytes, offset + 42);
    const fileName = textDecoder.decode(bytes.subarray(offset + 46, offset + 46 + fileNameLength));
    offset += 46 + fileNameLength + extraLength + commentLength;

    if (!fileName || fileName.endsWith("/")) continue;
    if (method !== 0 && method !== 8) {
      throw new Error("Unsupported ZIP compression method");
    }

    const localNameLength = readUint16(bytes, localHeaderOffset + 26);
    const localExtraLength = readUint16(bytes, localHeaderOffset + 28);
    const dataOffset = localHeaderOffset + 30 + localNameLength + localExtraLength;
    const data = bytes.subarray(dataOffset, dataOffset + compressedSize);
    const inflated = method === 0 ? data : await inflateRaw(data);
    if (inflated.byteLength !== uncompressedSize) {
      throw new Error("Unexpected ZIP entry size");
    }
    entries.set(normalizeEpubPath(fileName), inflated);
  }

  return Object.fromEntries(entries);
}

function findCentralDirectoryOffset(bytes: Uint8Array): number {
  for (
    let offset = bytes.byteLength - 22;
    offset >= Math.max(0, bytes.byteLength - 66_000);
    offset -= 1
  ) {
    if (readUint32(bytes, offset) === 0x06054b50) return readUint32(bytes, offset + 16);
  }
  throw new Error("Missing ZIP central directory");
}

async function inflateRaw(bytes: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([bytesToArrayBuffer(bytes)])
    .stream()
    .pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

function bytesToArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

function readUint16(bytes: Uint8Array, offset: number): number {
  return (bytes[offset] ?? 0) | ((bytes[offset + 1] ?? 0) << 8);
}

function readUint32(bytes: Uint8Array, offset: number): number {
  return (readUint16(bytes, offset) | (readUint16(bytes, offset + 2) << 16)) >>> 0;
}
