import { readFile } from "node:fs/promises";

const artifactUrl = new URL("../dist-bookshelf/bookshelf.html", import.meta.url);
const html = await readFile(artifactUrl, "utf8");

const forbidden = [
  "100dvh",
  "open_reading_nest",
  "render_reading_end_card",
  "reader-jump-toolbar",
  "app-v36",
  "react",
  "McpApp",
  "data:image/webp;base64",
  "fetch("
];
for (const value of forbidden) {
  if (html.includes(value)) throw new Error(`Legacy reading shell leaked into bookshelf build: ${value}`);
}

const required = [
  "静态书架已加载",
  "我们的书架",
  "ui/notifications/tool-result",
  "ui/notifications/size-changed",
  "ui/initialize",
  "notifyIntrinsicHeight",
  "如果你看见这张卡，ChatGPT 已经选择并渲染了 open_bookshelf_v2 的 UI resource。",
  'data-bookshelf-height-strategy="raw-postmessage-v2"'
];
for (const value of required) {
  if (!html.includes(value)) throw new Error(`Bookshelf build is missing: ${value}`);
}

const bytes = Buffer.byteLength(html);
if (bytes < 4_000 || bytes > 50_000) {
  throw new Error(`Expected a 4-50 KB stop-loss artifact, found ${bytes} bytes`);
}

console.log(
  JSON.stringify(
    {
      artifact: "web/dist-bookshelf/bookshelf.html",
      bytes,
      embeddedWebpCount: 0,
      forbiddenLegacyTokens: 0,
      status: "passed"
    },
    null,
    2
  )
);
