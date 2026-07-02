import { describe, expect, it } from "vitest";
import {
  epubDirectoryName,
  normalizeEpubPath,
  openEpubArchive,
  readEpubText,
  resolveEpubPath
} from "./epub-path.js";

const encoder = new TextEncoder();

describe("EPUB path helpers", () => {
  it("normalizes dot segments and fragments", () => {
    expect(normalizeEpubPath("OEBPS/Text/../Images/pic.png#cover")).toBe(
      "OEBPS/Images/pic.png"
    );
  });

  it("resolves hrefs from the OPF directory", () => {
    expect(resolveEpubPath("OEBPS", "Text/chapter01.xhtml")).toBe(
      "OEBPS/Text/chapter01.xhtml"
    );
  });

  it("returns the directory of an EPUB resource", () => {
    expect(epubDirectoryName("OEBPS/content.opf")).toBe("OEBPS");
  });
});

describe("EPUB ZIP parsing", () => {
  it("reads a valid stored ZIP entry", async () => {
    const archive = await openEpubArchive(
      new File([createStoredZip("mimetype", encoder.encode("application/epub+zip"))], "book.epub", {
        type: "application/epub+zip"
      })
    );

    expect(readEpubText(archive, "mimetype")).toBe("application/epub+zip");
  });

  it("rejects a declared unpacked size above the EPUB limit before allocation", async () => {
    const zip = createStoredZip("huge.bin", new Uint8Array(), 161 * 1024 * 1024);

    await expect(
      openEpubArchive(new File([zip], "huge.epub", { type: "application/epub+zip" }))
    ).rejects.toMatchObject({ code: "file_too_large" });
  });
});

function createStoredZip(
  name: string,
  data: Uint8Array,
  declaredUncompressedSize = data.byteLength
): Uint8Array {
  const fileName = encoder.encode(name);
  const checksum = crc32(data);
  const local = new Uint8Array(30 + fileName.byteLength + data.byteLength);
  writeUint32(local, 0, 0x04034b50);
  writeUint16(local, 4, 20);
  writeUint16(local, 8, 0);
  writeUint32(local, 14, checksum);
  writeUint32(local, 18, data.byteLength);
  writeUint32(local, 22, declaredUncompressedSize);
  writeUint16(local, 26, fileName.byteLength);
  local.set(fileName, 30);
  local.set(data, 30 + fileName.byteLength);

  const central = new Uint8Array(46 + fileName.byteLength);
  writeUint32(central, 0, 0x02014b50);
  writeUint16(central, 4, 20);
  writeUint16(central, 6, 20);
  writeUint16(central, 10, 0);
  writeUint32(central, 16, checksum);
  writeUint32(central, 20, data.byteLength);
  writeUint32(central, 24, declaredUncompressedSize);
  writeUint16(central, 28, fileName.byteLength);
  writeUint32(central, 42, 0);
  central.set(fileName, 46);

  const end = new Uint8Array(22);
  writeUint32(end, 0, 0x06054b50);
  writeUint16(end, 8, 1);
  writeUint16(end, 10, 1);
  writeUint32(end, 12, central.byteLength);
  writeUint32(end, 16, local.byteLength);

  return concatenate(local, central, end);
}

function concatenate(...parts: Uint8Array[]): Uint8Array {
  const output = new Uint8Array(parts.reduce((size, part) => size + part.byteLength, 0));
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.byteLength;
  }
  return output;
}

function writeUint16(target: Uint8Array, offset: number, value: number): void {
  target[offset] = value & 0xff;
  target[offset + 1] = (value >>> 8) & 0xff;
}

function writeUint32(target: Uint8Array, offset: number, value: number): void {
  writeUint16(target, offset, value & 0xffff);
  writeUint16(target, offset + 2, (value >>> 16) & 0xffff);
}

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc & 1) !== 0 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}
