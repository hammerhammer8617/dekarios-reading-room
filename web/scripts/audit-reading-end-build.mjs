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
  "app-v37",
  "react",
  "McpApp"
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
  "如果你看见这张卡，ChatGPT 已经渲染了图片内嵌的普通 HTML。",
  "data:image/webp;base64",
  'data-reading-end-height-strategy="raw-postmessage-v5"'
];
for (const value of required) {
  if (!html.includes(value)) throw new Error(`Reading-end build is missing: ${value}`);
}

const bytes = Buffer.byteLength(html);
if (bytes < 250_000 || bytes > 500_000) {
  throw new Error(`Expected a 250-500 KB image-backed artifact, found ${bytes} bytes`);
}

const embeddedWebpCount = html.match(/data:image\/webp;base64/g)?.length ?? 0;
if (embeddedWebpCount !== 6) {
  throw new Error(`Expected exactly six embedded WebPs, found ${embeddedWebpCount}`);
}

console.log(
  JSON.stringify(
    {
      artifact: "web/dist-reading-end/reading-end.html",
      bytes,
      embeddedWebpCount,
      forbiddenLegacyTokens: 0,
      status: "passed"
    },
    null,
    2
  )
);
