type ReadingPosition = {
  kind: "paragraph" | "page";
  index: number;
  total?: number;
  label: string;
};

type BookshelfThought = {
  author: "tav" | "gale" | "shared";
  content: string;
};

type BookshelfItem = {
  bookId: string;
  title: string;
  author?: string;
  genre: "novel" | "mystery" | "nonfiction" | "essay" | "poetry" | "manga" | "other";
  status: "active" | "completed";
  tavPosition: ReadingPosition;
  sharedPosition: ReadingPosition | null;
  spoilerBoundary: ReadingPosition | null;
  lastReadAt: string;
  lastNotionSyncedAt: string | null;
  latestThought?: BookshelfThought;
  openQuestionCount: number;
  unsyncedThoughtCount: number;
  casebookInProgress: boolean;
  casebookItemCount: number;
};

type BookshelfOutput = {
  view: "bookshelf";
  bookshelf: BookshelfItem[];
};

type CompatibilityHost = {
  toolOutput?: unknown;
  notifyIntrinsicHeight?: (input: { height: number }) => void | Promise<void>;
};

type MessageListener = (message: unknown) => void;

export type StaticBookshelfDependencies = {
  document: Document;
  getCompatibilityHost: () => CompatibilityHost | undefined;
  postToParent: (message: unknown) => void;
  addMessageListener: (listener: MessageListener) => () => void;
  addGlobalsListener: (listener: (output: unknown) => void) => () => void;
  observeSize: (listener: () => void) => () => void;
  requestFrame: (listener: () => void) => number;
  cancelFrame: (id: number) => void;
  measure: () => { width: number; height: number };
};

const PROTOCOL_VERSION = "2026-01-26";
const INITIALIZE_ID = "bookshelf-static-v2-initialize";
const genreLabels: Record<BookshelfItem["genre"], string> = {
  novel: "小说",
  mystery: "推理",
  nonfiction: "非虚构",
  essay: "随笔",
  poetry: "诗歌",
  manga: "漫画",
  other: "其他"
};
const authorLabels: Record<BookshelfThought["author"], string> = {
  tav: "塔芙",
  gale: "盖尔",
  shared: "共同"
};

const defaultDependencies: StaticBookshelfDependencies = {
  document,
  getCompatibilityHost: () => window.openai,
  postToParent: (message) => window.parent.postMessage(message, "*"),
  addMessageListener: (listener) => {
    const handler = (event: MessageEvent) => {
      if (event.source === window.parent) listener(event.data);
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  },
  addGlobalsListener: (listener) => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{ globals?: { toolOutput?: unknown } }>).detail;
      const output = detail?.globals?.toolOutput ?? window.openai?.toolOutput;
      if (output !== undefined) listener(output);
    };
    window.addEventListener("openai:set_globals", handler);
    return () => window.removeEventListener("openai:set_globals", handler);
  },
  observeSize: (listener) => {
    if (typeof ResizeObserver === "undefined") return () => undefined;
    const observer = new ResizeObserver(listener);
    observer.observe(document.documentElement);
    observer.observe(document.body);
    return () => observer.disconnect();
  },
  requestFrame: (listener) => window.requestAnimationFrame(listener),
  cancelFrame: (id) => window.cancelAnimationFrame(id),
  measure: () => ({
    width: Math.ceil(Math.max(window.innerWidth, document.documentElement.scrollWidth)),
    height: Math.ceil(
      Math.max(
        320,
        document.documentElement.scrollHeight,
        document.body.scrollHeight,
        document.getElementById("bookshelf-static-v2")?.scrollHeight ?? 0
      )
    )
  })
};

export function createStaticBookshelfApp(
  overrides: Partial<StaticBookshelfDependencies> = {}
) {
  const deps = { ...defaultDependencies, ...overrides };
  let frameId: number | undefined;
  let lastSize = "";
  let disposed = false;

  const sendSize = (size: { width: number; height: number }) => {
    if (disposed || size.width <= 0 || size.height <= 0) return;
    const key = `${size.width}:${size.height}`;
    if (key === lastSize) return;
    lastSize = key;
    deps.postToParent({
      jsonrpc: "2.0",
      method: "ui/notifications/size-changed",
      params: size
    });
    try {
      void Promise.resolve(
        deps.getCompatibilityHost()?.notifyIntrinsicHeight?.({ height: size.height })
      ).catch(() => undefined);
    } catch {
      // The standards-first raw notification above remains the primary path.
    }
  };

  const reportSize = () => {
    if (disposed || frameId !== undefined) return;
    frameId = deps.requestFrame(() => {
      frameId = undefined;
      if (!disposed) sendSize(deps.measure());
    });
  };

  const publishOutput = (value: unknown) => {
    const output = parseBookshelfOutput(value);
    if (!output) {
      showError(deps.document, "书架工具结果不完整；静态外壳仍保持可见。");
      reportSize();
      return;
    }
    renderBookshelf(deps.document, output.bookshelf);
    reportSize();
  };

  const removeMessageListener = deps.addMessageListener((value) => {
    if (!isRecord(value) || value.jsonrpc !== "2.0") return;
    if (value.id === INITIALIZE_ID && "result" in value) {
      deps.postToParent({
        jsonrpc: "2.0",
        method: "ui/notifications/initialized",
        params: {}
      });
      lastSize = "";
      reportSize();
      return;
    }
    if (value.method === "ui/notifications/tool-result" && isRecord(value.params)) {
      publishOutput(value.params.structuredContent);
    }
  });
  const removeGlobalsListener = deps.addGlobalsListener(publishOutput);
  const removeSizeObserver = deps.observeSize(reportSize);

  const compatibilityOutput = deps.getCompatibilityHost()?.toolOutput;
  if (compatibilityOutput !== undefined) publishOutput(compatibilityOutput);

  sendSize(deps.measure());
  deps.postToParent({
    jsonrpc: "2.0",
    id: INITIALIZE_ID,
    method: "ui/initialize",
    params: {
      appInfo: { name: "德卡里奥斯家的书房｜静态书架", version: "0.3.0" },
      appCapabilities: {},
      protocolVersion: PROTOCOL_VERSION
    }
  });

  return {
    publishOutput,
    reportSize,
    dispose() {
      disposed = true;
      if (frameId !== undefined) deps.cancelFrame(frameId);
      removeMessageListener();
      removeGlobalsListener();
      removeSizeObserver();
    }
  };
}

export function parseBookshelfOutput(value: unknown): BookshelfOutput | undefined {
  if (!isRecord(value) || value.view !== "bookshelf" || !Array.isArray(value.bookshelf)) {
    return undefined;
  }
  if (value.bookshelf.some((item) => !isBookshelfItem(item))) return undefined;
  return value as BookshelfOutput;
}

export function renderBookshelf(doc: Document, books: BookshelfItem[]) {
  const list = doc.getElementById("bookshelf-list");
  if (!list) return;
  list.replaceChildren();

  if (books.length === 0) {
    const empty = doc.createElement("p");
    empty.className = "position";
    empty.textContent = "书架还是空的。选一本故事，我们一起开始吧。";
    list.append(empty);
  } else {
    for (const book of books) list.append(createBookCard(doc, book));
  }

  setText(doc, "bookshelf-title", "我们的书架");
  doc.getElementById("bookshelf-probe")?.setAttribute("hidden", "");
  doc.getElementById("bookshelf-content")?.removeAttribute("hidden");
  setText(doc, "bookshelf-status", `${books.length} 本作品 · open_bookshelf_v2 工具结果已抵达`);
  const root = doc.getElementById("bookshelf-static-v2");
  if (root) root.dataset.state = "bookshelf";
}

function createBookCard(doc: Document, book: BookshelfItem) {
  const article = doc.createElement("article");
  article.className = "book";
  article.dataset.status = book.status;

  const title = doc.createElement("h2");
  title.textContent = `《${book.title}》`;
  const meta = doc.createElement("p");
  meta.className = "meta";
  meta.textContent = [book.author, genreLabels[book.genre], book.status === "active" ? "阅读中" : "已完成"]
    .filter(Boolean)
    .join(" · ");
  const position = doc.createElement("p");
  position.className = "position";
  position.textContent = `塔芙：${book.tavPosition.label} · 共同进度：${book.sharedPosition?.label ?? "尚未同步"}`;
  article.append(title, meta, position);

  if (book.latestThought) {
    const thought = doc.createElement("p");
    thought.className = "thought";
    thought.textContent = `${authorLabels[book.latestThought.author]}：${book.latestThought.content}`;
    article.append(thought);
  }

  const facts = doc.createElement("p");
  facts.className = "facts";
  const parts = [`${book.openQuestionCount} 个开放问题`];
  if (book.casebookInProgress) parts.push(`案件簿 ${book.casebookItemCount} 项`);
  if (book.unsyncedThoughtCount > 0) parts.push(`${book.unsyncedThoughtCount} 条待同步`);
  facts.textContent = parts.join(" · ");
  article.append(facts);
  return article;
}

function isBookshelfItem(value: unknown): value is BookshelfItem {
  if (!isRecord(value)) return false;
  return (
    isNonEmptyString(value.bookId) &&
    isNonEmptyString(value.title) &&
    (value.author === undefined || isNonEmptyString(value.author)) &&
    ["novel", "mystery", "nonfiction", "essay", "poetry", "manga", "other"].includes(String(value.genre)) &&
    ["active", "completed"].includes(String(value.status)) &&
    isReadingPosition(value.tavPosition) &&
    (value.sharedPosition === null || isReadingPosition(value.sharedPosition)) &&
    (value.spoilerBoundary === null || isReadingPosition(value.spoilerBoundary)) &&
    isNonEmptyString(value.lastReadAt) &&
    (value.lastNotionSyncedAt === null || isNonEmptyString(value.lastNotionSyncedAt)) &&
    (value.latestThought === undefined || isBookshelfThought(value.latestThought)) &&
    isNonNegativeInteger(value.openQuestionCount) &&
    isNonNegativeInteger(value.unsyncedThoughtCount) &&
    typeof value.casebookInProgress === "boolean" &&
    isNonNegativeInteger(value.casebookItemCount)
  );
}

function isReadingPosition(value: unknown): value is ReadingPosition {
  if (!isRecord(value)) return false;
  return (
    ["paragraph", "page"].includes(String(value.kind)) &&
    typeof value.index === "number" &&
    Number.isInteger(value.index) &&
    value.index >= 1 &&
    (value.total === undefined ||
      (typeof value.total === "number" && Number.isInteger(value.total) && value.total >= 1)) &&
    isNonEmptyString(value.label)
  );
}

function isBookshelfThought(value: unknown): value is BookshelfThought {
  return (
    isRecord(value) &&
    ["tav", "gale", "shared"].includes(String(value.author)) &&
    isNonEmptyString(value.content)
  );
}

function isNonNegativeInteger(value: unknown) {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function showError(doc: Document, message: string) {
  setText(doc, "bookshelf-status", message);
  const root = doc.getElementById("bookshelf-static-v2");
  if (root) root.dataset.state = "error";
}

function setText(doc: Document, id: string, value: string) {
  const element = doc.getElementById(id);
  if (element) element.textContent = value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

if (
  typeof window !== "undefined" &&
  typeof document !== "undefined" &&
  document.getElementById("bookshelf-static-v2")
) {
  createStaticBookshelfApp();
}
