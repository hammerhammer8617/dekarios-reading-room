import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const fixtures = [
  ["docs/fixtures/reading-end-card-390.png", 390],
  ["docs/fixtures/reading-end-card-768.png", 768]
];

for (const [relativePath, expectedWidth] of fixtures) {
  const path = resolve(process.cwd(), relativePath);
  const png = await readFile(path);
  const signature = png.subarray(0, 8).toString("hex");
  if (signature !== "89504e470d0a1a0a") {
    throw new Error(`${relativePath} is not a PNG fixture`);
  }
  const width = png.readUInt32BE(16);
  const height = png.readUInt32BE(20);
  if (width !== expectedWidth || height <= 0) {
    throw new Error(
      `${relativePath} has ${width}x${height}; expected ${expectedWidth}px wide with positive intrinsic height`
    );
  }
  console.log(JSON.stringify({ fixture: relativePath, width, height, status: "passed" }));
}
