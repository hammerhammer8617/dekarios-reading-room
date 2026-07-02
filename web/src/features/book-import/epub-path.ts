import { BookImportError } from "./types.js";

export type EpubArchive = Record<string, Uint8Array>;

const MAX_EPUB_FILE_BYTES = 40 * 1024 * 1024;
const MAX_EPUB_UNPACKED_BYTES = 160 * 1024 * 1024;
const MAX_ZIP_ENTRIES = 20_000;
const textDecoder = new TextDecoder();
const crc32Table = createCrc32Table();

export async function openEpubArchive(file: File): Promise<EpubArchive> {
  if (file.size > MAX_EPUB_FILE_BYTES) {
    throw new BookImportError("EPUB 文件超过 40 MB。", "file_too_large", "epub");
  }

  try {
    return await unzipEpubArchive(new Uint8Array(await file.arrayBuffer()));
  } catch (error) {
    if (error instanceof BookImportError) throw error;
    throw new BookImportError("无法解压 EPUB 文件。", "invalid_epub", "epub");
  }
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
  let declaredUnpackedBytes = 0;
  let offset = centralDirectoryOffset;
  let entryCount = 0;

  while (offset + 4 <= bytes.byteLength && readUint32(bytes, offset) === 0x02014b50) {
    assertRange(bytes, offset, 46);
    entryCount += 1;
    if (entryCount > MAX_ZIP_ENTRIES) throw new Error("Too many ZIP entries");

    const flags = readUint16(bytes, offset + 8);
    const method = readUint16(bytes, offset + 10);
    const expectedCrc32 = readUint32(bytes, offset + 16);
    const compressedSize = readUint32(bytes, offset + 20);
    const uncompressedSize = readUint32(bytes, offset + 24);
    const fileNameLength = readUint16(bytes, offset + 28);
    const extraLength = readUint16(bytes, offset + 30);
    const commentLength = readUint16(bytes, offset + 32);
    const localHeaderOffset = readUint32(bytes, offset + 42);
    const centralRecordLength = 46 + fileNameLength + extraLength + commentLength;
    assertRange(bytes, offset, centralRecordLength);

    const fileName = textDecoder.decode(bytes.subarray(offset + 46, offset + 46 + fileNameLength));
    offset += centralRecordLength;

    if (!fileName || fileName.endsWith("/")) continue;
    if ((flags & 0x0001) !== 0) throw new Error("Encrypted ZIP entries are unsupported");
    if (method !== 0 && method !== 8) throw new Error("Unsupported ZIP compression method");
    if (
      compressedSize === 0xffffffff ||
      uncompressedSize === 0xffffffff ||
      localHeaderOffset === 0xffffffff
    ) {
      throw new Error("ZIP64 entries are unsupported");
    }

    declaredUnpackedBytes += uncompressedSize;
    if (declaredUnpackedBytes > MAX_EPUB_UNPACKED_BYTES) {
      throw new BookImportError("EPUB 解压后的内容过大。", "file_too_large", "epub");
    }

    assertRange(bytes, localHeaderOffset, 30);
    if (readUint32(bytes, localHeaderOffset) !== 0x04034b50) {
      throw new Error("Missing ZIP local header");
    }
    const localNameLength = readUint16(bytes, localHeaderOffset + 26);
    const localExtraLength = readUint16(bytes, localHeaderOffset + 28);
    const dataOffset = localHeaderOffset + 30 + localNameLength + localExtraLength;
    assertRange(bytes, dataOffset, compressedSize);

    const data = bytes.subarray(dataOffset, dataOffset + compressedSize);
    if (method === 0 && compressedSize !== uncompressedSize) {
      throw new Error("Invalid stored ZIP entry size");
    }
    const inflated = method === 0 ? data.slice() : await inflateRaw(data);
    if (inflated.byteLength !== uncompressedSize) {
      throw new Error("Unexpected ZIP entry size");
    }
    if (crc32(inflated) !== expectedCrc32) {
      throw new Error("ZIP entry checksum mismatch");
    }

    const normalizedPath = normalizeEpubPath(fileName);
    if (!normalizedPath || entries.has(normalizedPath)) {
      throw new Error("Invalid or duplicate ZIP entry path");
    }
    entries.set(normalizedPath, inflated);
  }

  if (entries.size === 0) throw new Error("Empty ZIP archive");
  return Object.fromEntries(entries);
}

function findCentralDirectoryOffset(bytes: Uint8Array): number {
  if (bytes.byteLength < 22) throw new Error("Missing ZIP central directory");
  for (
    let offset = bytes.byteLength - 22;
    offset >= Math.max(0, bytes.byteLength - 66_000);
    offset -= 1
  ) {
    if (readUint32(bytes, offset) !== 0x06054b50) continue;
    const centralDirectoryOffset = readUint32(bytes, offset + 16);
    if (centralDirectoryOffset >= bytes.byteLength) {
      throw new Error("Invalid ZIP central directory offset");
    }
    return centralDirectoryOffset;
  }
  throw new Error("Missing ZIP central directory");
}

async function inflateRaw(bytes: Uint8Array): Promise<Uint8Array> {
  if (typeof DecompressionStream === "undefined") {
    throw new BookImportError("当前浏览器不支持 EPUB 解压。", "format_not_ready", "epub");
  }
  const stream = new Blob([bytesToArrayBuffer(bytes)])
    .stream()
    .pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

function bytesToArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

function assertRange(bytes: Uint8Array, offset: number, length: number): void {
  if (offset < 0 || length < 0 || offset > bytes.byteLength - length) {
    throw new Error("ZIP entry exceeds archive bounds");
  }
}

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc = (crc32Table[(crc ^ byte) & 0xff] ?? 0) ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function createCrc32Table(): Uint32Array {
  const table = new Uint32Array(256);
  for (let index = 0; index < table.length; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = (value & 1) !== 0 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[index] = value >>> 0;
  }
  return table;
}

function readUint16(bytes: Uint8Array, offset: number): number {
  return (bytes[offset] ?? 0) | ((bytes[offset + 1] ?? 0) << 8);
}

function readUint32(bytes: Uint8Array, offset: number): number {
  return (readUint16(bytes, offset) | (readUint16(bytes, offset + 2) << 16)) >>> 0;
}
