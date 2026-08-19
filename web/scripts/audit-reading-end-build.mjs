import { readFile } from "node:fs/promises";

const artifactUrl = new URL("../dist-reading-end/reading-end.html", import.meta.url);
const html = await readFile(artifactUrl, "utf8");

const forbidden = [
  "100dvh",
  "open_reading_nest",
  "open_bookshelf",
  "正在打开书架",
  "手边的书",
  "案件簿",
  "app-v36"
];
for (const value of forbidden) {
  if (html.includes(value)) throw new Error(`Legacy reading shell leaked into reading-end build: ${value}`);
}

const required = [
  "今天读到这里",
  "读到哪里",
  "今天读了什么",
  "塔芙留下",
  "盖尔留下",
  "留到下次",
  "ui/notifications/size-changed",
  "notifyIntrinsicHeight"
];
for (const value of required) {
  if (!html.includes(value)) throw new Error(`Reading-end build is missing: ${value}`);
}

const embeddedWebpCount = html.match(/data:image\/webp;base64,/gu)?.length ?? 0;
if (embeddedWebpCount < 6) {
  throw new Error(`Expected all six closing backgrounds, found ${embeddedWebpCount}`);
}

console.log(
  JSON.stringify(
    {
      artifact: "web/dist-reading-end/reading-end.html",
      bytes: Buffer.byteLength(html),
      embeddedWebpCount,
      forbiddenLegacyTokens: 0,
      status: "passed"
    },
    null,
    2
  )
);
