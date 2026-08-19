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
  "app-v36",
  "react",
  "McpApp",
  "data:image/webp;base64"
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
  "ui/initialize",
  "notifyIntrinsicHeight",
  "如果你看见这张卡，ChatGPT 已经渲染了普通 HTML。",
  'data-reading-end-height-strategy="raw-postmessage-v4"'
];
for (const value of required) {
  if (!html.includes(value)) throw new Error(`Reading-end build is missing: ${value}`);
}

const bytes = Buffer.byteLength(html);
if (bytes < 4_000 || bytes > 50_000) {
  throw new Error(`Expected a 4-50 KB stop-loss artifact, found ${bytes} bytes`);
}

console.log(
  JSON.stringify(
    {
      artifact: "web/dist-reading-end/reading-end.html",
      bytes,
      embeddedWebpCount: 0,
      forbiddenLegacyTokens: 0,
      status: "passed"
    },
    null,
    2
  )
);
