import { strFromU8, strToU8, unzipSync, zipSync, type Zippable } from "fflate";
import { safeEpubFileName, stripBookExtension } from "./format.js";
import { compressImageBytes, inferRasterMediaType } from "./images.js";
import {
  assertEpubFits,
  COMPRESSION_PASSES,
  SAFE_EPUB_OUTPUT_BYTES
} from "./epub.js";
import { BinderyError, type BuiltEpub } from "./types.js";

const MAX_EPUB_INPUT_BYTES = 350 * 1024 * 1024;

export async function optimizeExistingEpub(
  file: File,
  onPass?: (label: string) => void
): Promise<BuiltEpub> {
  if (file.size > MAX_EPUB_INPUT_BYTES) {
    throw new BinderyError("原 EPUB 超过 350 MB，浏览器本地压缩可能耗尽内存。", "file_too_large");
  }

  let archive: Record<string, Uint8Array>;
  try {
    archive = unzipSync(new Uint8Array(await file.arrayBuffer()));
  } catch {
    throw new BinderyError("EPUB 无法解压，文件可能损坏或带有密码保护。", "parse_failed");
  }
  if (!archive["META-INF/container.xml"]) {
    throw new BinderyError("这不是完整有效的 EPUB：缺少 container.xml。", "parse_failed");
  }
  const encryption = archive["META-INF/encryption.xml"];
  if (encryption && /adept|xmlenc#aes|encryptedkey|rights\.xml/iu.test(strFromU8(encryption))) {
    throw new BinderyError("这本 EPUB 可能带有 DRM，装订室不会尝试破解。", "encrypted_book");
  }

  let smallestSize = Number.POSITIVE_INFINITY;
  for (const pass of COMPRESSION_PASSES) {
    onPass?.(pass.label);
    const files: Zippable = {
      mimetype: [strToU8("application/epub+zip"), { level: 0 }]
    };
    for (const [path, originalBytes] of Object.entries(archive)) {
      if (path === "mimetype") continue;
      const mediaType = inferRasterMediaType(path, originalBytes);
      files[path] = mediaType
        ? await compressImageBytes(originalBytes, mediaType, pass).catch(() => originalBytes)
        : originalBytes;
    }
    const bytes = zipSync(files, { level: 9 });
    smallestSize = Math.min(smallestSize, bytes.byteLength);
    if (bytes.byteLength <= SAFE_EPUB_OUTPUT_BYTES) {
      assertEpubFits(bytes);
      return {
        blob: new Blob([toArrayBuffer(bytes)], { type: "application/epub+zip" }),
        bytes,
        fileName: safeEpubFileName(`${stripBookExtension(file.name)}-书房版`),
        sizeBytes: bytes.byteLength,
        passLabel: pass.label,
        warnings: ["已保留原 EPUB 的章节、目录和排版结构，并按成品体积压缩图片。"]
      };
    }
  }
  throw new BinderyError(
    `压缩到最低可读档后仍有 ${(smallestSize / 1024 / 1024).toFixed(2)} MB，无法保证小于 40 MB。`,
    "output_too_large"
  );
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}
