import type { BinderyAsset, CompressionPass } from "./types.js";

const RECOMPRESSIBLE_MEDIA = new Set(["image/jpeg", "image/png", "image/webp"]);

export async function compressAsset(
  asset: BinderyAsset,
  pass: CompressionPass
): Promise<BinderyAsset> {
  if (!RECOMPRESSIBLE_MEDIA.has(asset.mediaType) || asset.bytes.byteLength < 48 * 1024) {
    return { ...asset, bytes: asset.bytes.slice() };
  }
  const compressed = await compressImageBytes(asset.bytes, asset.mediaType, pass);
  return { ...asset, bytes: compressed };
}

export async function compressImageBytes(
  bytes: Uint8Array,
  mediaType: string,
  pass: CompressionPass
): Promise<Uint8Array> {
  if (typeof createImageBitmap !== "function") return bytes.slice();
  const image = await createImageBitmap(new Blob([toArrayBuffer(bytes)], { type: mediaType }));
  try {
    const scale = Math.min(1, pass.maxDimension / Math.max(image.width, image.height));
    const width = Math.max(1, Math.round(image.width * scale));
    const height = Math.max(1, Math.round(image.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d", { alpha: mediaType !== "image/jpeg" });
    if (!context) return bytes.slice();
    if (mediaType === "image/jpeg") {
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, width, height);
    }
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.drawImage(image, 0, 0, width, height);
    const blob = await canvasToBlob(canvas, mediaType, pass.quality);
    const result = new Uint8Array(await blob.arrayBuffer());
    return result.byteLength < bytes.byteLength ? result : bytes.slice();
  } finally {
    image.close();
  }
}

export function inferRasterMediaType(path: string, bytes: Uint8Array): string | null {
  const lower = path.toLowerCase();
  if (/\.jpe?g$/u.test(lower) || (bytes[0] === 0xff && bytes[1] === 0xd8)) return "image/jpeg";
  if (/\.png$/u.test(lower) || matches(bytes, [0x89, 0x50, 0x4e, 0x47])) return "image/png";
  if (/\.webp$/u.test(lower) || ascii(bytes, 8, 4) === "WEBP") return "image/webp";
  return null;
}

function canvasToBlob(canvas: HTMLCanvasElement, mediaType: string, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("浏览器无法压缩图片。"))),
      mediaType,
      quality
    );
  });
}

function matches(bytes: Uint8Array, signature: number[]): boolean {
  return signature.every((value, index) => bytes[index] === value);
}

function ascii(bytes: Uint8Array, offset: number, length: number): string {
  return String.fromCharCode(...bytes.slice(offset, offset + length));
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}
