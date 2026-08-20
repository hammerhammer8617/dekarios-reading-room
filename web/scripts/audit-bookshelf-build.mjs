import { readFile } from "node:fs/promises";

const artifactUrl = new URL("../dist-bookshelf/bookshelf.html", import.meta.url);
const html = await readFile(artifactUrl, "utf8");

const forbidden = [
  "100dvh",
  "open_reading_nest",
  "render_reading_end_card",
  "reader-jump-toolbar",
  "app-v37",
  "react-dom",
  "jsx-runtime",
  "__REACT",
  "McpApp",
  "fetch(",
  "工具身份缓存失效探针"
];
for (const value of forbidden) {
  if (html.includes(value)) throw new Error(`Legacy reading shell leaked into bookshelf build: ${value}`);
}

const required = [
  "正在从书架上取书",
  "我们的书架",
  "返回书架",
  "get_book_details",
  "delete_reading_session",
  "确认删除",
  "正文副本不会删除",
  "bookshelf-pagination",
  "tools/call",
  "ui/notifications/tool-result",
  "ui/notifications/size-changed",
  "ui/initialize",
  "notifyIntrinsicHeight",
  "data:image/webp;base64",
  'data-bookshelf-height-strategy="raw-postmessage-v4"'
];
for (const value of required) {
  if (!html.includes(value)) throw new Error(`Bookshelf build is missing: ${value}`);
}

const bytes = Buffer.byteLength(html);
if (bytes < 35_000 || bytes > 110_000) {
  throw new Error(`Expected a 35-110 KB interactive artifact, found ${bytes} bytes`);
}

const embeddedWebpCount = html.match(/data:image\/webp;base64/g)?.length ?? 0;
if (embeddedWebpCount !== 1) {
  throw new Error(`Expected exactly one embedded WebP, found ${embeddedWebpCount}`);
}

console.log(
  JSON.stringify(
    {
      artifact: "web/dist-bookshelf/bookshelf.html",
      bytes,
      embeddedWebpCount,
      forbiddenLegacyTokens: 0,
      status: "passed"
    },
    null,
    2
  )
);
