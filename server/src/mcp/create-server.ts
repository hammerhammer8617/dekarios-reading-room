import { resolve } from "node:path";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { JsonReadingRepository } from "../repositories/json-reading-repository.js";
import { createMcpServerFromRepository } from "./server-factory.js";

const widgetPath = fileURLToPath(new URL("../../../web/dist/index.html", import.meta.url));
const bookshelfPath = fileURLToPath(
  new URL("../../../web/dist-bookshelf/bookshelf.html", import.meta.url)
);
const readingEndPath = fileURLToPath(
  new URL("../../../web/dist-reading-end/reading-end.html", import.meta.url)
);

export async function createMcpServer(dataFile = resolve("data", "sessions.json")) {
  const widgetHtml = await readWidgetHtml();
  const bookshelfHtml = await readBookshelfHtml();
  const readingEndHtml = await readReadingEndHtml();
  return createMcpServerFromRepository(new JsonReadingRepository(dataFile), widgetHtml, undefined, {
    bookshelfHtml,
    readingEndHtml
  });
}

async function readBookshelfHtml() {
  try {
    return await readFile(bookshelfPath, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    return "<!doctype html><html><body><main>Build web first to load the bookshelf.</main></body></html>";
  }
}

async function readReadingEndHtml() {
  try {
    return await readFile(readingEndPath, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    return "<!doctype html><html><body><main>Build web first to load the reading-end card.</main></body></html>";
  }
}

async function readWidgetHtml() {
  try {
    return await readFile(widgetPath, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    return "<!doctype html><html><body><main>Build web first to load the reading nest UI.</main></body></html>";
  }
}
