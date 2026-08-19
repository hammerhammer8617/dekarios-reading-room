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

type DetailThought = {
  id?: string;
  author: "tav" | "gale" | "shared";
  kind?: string;
  content: string;
  position?: ReadingPosition;
  status?: string;
  updatedAt?: string;
};

type BookDetailsOutput = {
  session: {
    id: string;
    title: string;
    author?: string;
    genre: string;
    status: "active" | "completed";
    userCurrentPosition: ReadingPosition;
    assistantSyncedPosition: ReadingPosition | null;
    spoilerBoundary?: ReadingPosition | null;
    lastReadAt: string;
    lastNotionSyncedAt?: string;
  };
  thoughts: DetailThought[];
  openQuestions: DetailThought[];
  unsyncedThoughtCount: number;
  quotes?: unknown[];
  bookmarks?: unknown[];
  casebook?: Record<string, unknown>;
};

type ToolCallResult = {
  structuredContent?: unknown;
  content?: unknown[];
  isError?: boolean;
};

type CompatibilityHost = {
  toolOutput?: unknown;
  callTool?: (
    name: string,
    args: Record<string, unknown>
  ) => Promise<ToolCallResult>;
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
  setTimer: (listener: () => void, delay: number) => number;
  clearTimer: (id: number) => void;
  createOperationId: () => string;
  measure: () => { width: number; height: number };
};

const PROTOCOL_VERSION = "2026-01-26";
const INITIALIZE_ID = "bookshelf-static-v4-initialize";
const TOOL_REQUEST_TIMEOUT_MS = 4_000;
export const BOOKS_PER_PAGE = 3;
const genreLabels: Record<BookshelfItem["genre"], string> = {
  novel: "小说",
  mystery: "推理",
  nonfiction: "非虚构",
  essay: "随笔",
  poetry: "诗歌",
  manga: "漫画",
  other: "其他"
};
const authorLabels: Record<DetailThought["author"], string> = {
  tav: "塔芙",
  gale: "盖尔",
  shared: "共同"
};
const kindLabels: Record<string, string> = {
  reaction: "反应",
  interpretation: "解释",
  disagreement: "分歧",
  question: "问题",
  prediction: "预测",
  connection: "连接",
  clue: "线索"
};
const statusLabels: Record<string, string> = {
  open: "仍保留",
  revised: "已修正",
  resolved: "已回答",
  rejected: "已推翻"
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
  setTimer: (listener, delay) => window.setTimeout(listener, delay),
  clearTimer: (id) => window.clearTimeout(id),
  createOperationId: () =>
    globalThis.crypto?.randomUUID?.() ??
    `delete-${Date.now()}-${Math.random().toString(16).slice(2)}`,
  measure: () => ({
    width: Math.ceil(Math.max(window.innerWidth, document.documentElement.scrollWidth)),
    height: Math.ceil(
      Math.max(
        320,
        document.documentElement.scrollHeight,
        document.body.scrollHeight,
        document.getElementById("bookshelf-static-v4")?.scrollHeight ?? 0
      )
    )
  })
};

export function createStaticBookshelfApp(
  overrides: Partial<StaticBookshelfDependencies> = {}
) {
  const deps = { ...defaultDependencies, ...overrides };
  const pendingRequests = new Map<
    string,
    {
      resolve: (value: ToolCallResult) => void;
      reject: (reason: Error) => void;
      timer: number;
    }
  >();
  let frameId: number | undefined;
  let requestSequence = 0;
  let lastSize = "";
  let currentBooks: BookshelfItem[] = [];
  const locallyDeletedBookIds = new Set<string>();
  let currentPage = 0;
  let openingBook = false;
  let deletingBook = false;
  let disposed = false;

  const sendSize = (size: { width: number; height: number }) => {
    if (disposed || size.width <= 0 || size.height <= 0) return;
    const key = String(size.width) + ":" + String(size.height);
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
      // The raw MCP Apps notification above remains the primary path.
    }
  };

  const reportSize = () => {
    if (disposed || frameId !== undefined) return;
    frameId = deps.requestFrame(() => {
      frameId = undefined;
      if (!disposed) sendSize(deps.measure());
    });
  };

  const requestTool = (name: string, args: Record<string, unknown>) =>
    new Promise<ToolCallResult>((resolve, reject) => {
      const id = "bookshelf-static-v4-tool-" + String(++requestSequence);
      const timer = deps.setTimer(() => {
        pendingRequests.delete(id);
        reject(new Error("The host did not answer the tool request."));
      }, TOOL_REQUEST_TIMEOUT_MS);
      pendingRequests.set(id, { resolve, reject, timer });
      try {
        deps.postToParent({
          jsonrpc: "2.0",
          id,
          method: "tools/call",
          params: { name, arguments: args }
        });
      } catch (error) {
        pendingRequests.delete(id);
        deps.clearTimer(timer);
        reject(error instanceof Error ? error : new Error("The tool request could not be sent."));
      }
    });

  const callTool = async (name: string, args: Record<string, unknown>) => {
    try {
      return await requestTool(name, args);
    } catch (standardError) {
      const compatibilityCall = deps.getCompatibilityHost()?.callTool;
      if (!compatibilityCall) throw standardError;
      return compatibilityCall(name, args);
    }
  };

  const renderCurrentShelf = () => {
    currentPage = clampShelfPage(currentBooks.length, currentPage);
    renderBookshelf(deps.document, currentBooks, openBook, currentPage, (page) => {
      currentPage = page;
      renderCurrentShelf();
      reportSize();
    });
  };

  const deleteBook = async (details: BookDetailsOutput) => {
    if (disposed || deletingBook) throw new Error("A deletion is already in progress.");
    deletingBook = true;
    setRootState(deps.document, "deleting");
    setText(
      deps.document,
      "bookshelf-status",
      "正在从书架移除《" + details.session.title + "》；正文副本会保留……"
    );
    reportSize();

    try {
      const result = await callTool("delete_reading_session", {
        sessionId: details.session.id,
        operationId: deps.createOperationId()
      });
      if (result.isError) throw new Error("delete_reading_session returned an error");
      if (
        !isRecord(result.structuredContent) ||
        typeof result.structuredContent.deleted !== "boolean"
      ) {
        throw new Error("delete_reading_session returned an incomplete result");
      }
      locallyDeletedBookIds.add(details.session.id);
      currentBooks = currentBooks.filter((book) => book.bookId !== details.session.id);
      currentPage = clampShelfPage(currentBooks.length, currentPage);
      renderCurrentShelf();
      setText(
        deps.document,
        "bookshelf-status",
        "《" + details.session.title + "》已从书架删除；正文副本仍保留。"
      );
      reportSize();
    } catch (error) {
      setRootState(deps.document, "detail");
      setText(
        deps.document,
        "bookshelf-status",
        "《" + details.session.title + "》没有删除成功；原记录仍然保留。"
      );
      reportSize();
      throw error;
    } finally {
      deletingBook = false;
    }
  };

  async function openBook(bookId: string) {
    if (disposed || openingBook) return;
    const book = currentBooks.find((candidate) => candidate.bookId === bookId);
    if (!book) return;
    openingBook = true;
    setBooksDisabled(deps.document, true);
    setRootState(deps.document, "loading");
    setText(deps.document, "bookshelf-status", "正在翻找《" + book.title + "》的共读记录……");
    reportSize();

    try {
      const result = await callTool("get_book_details", { bookId });
      if (result.isError) throw new Error("get_book_details returned an error");
      const details = parseBookDetailsOutput(result.structuredContent);
      if (!details) throw new Error("get_book_details returned an incomplete record");
      renderBookDetails(
        deps.document,
        details,
        () => {
          renderCurrentShelf();
          reportSize();
        },
        () => deleteBook(details)
      );
    } catch {
      showError(deps.document, "这本书的记录暂时没有读出来；书架仍然可以继续使用。");
    } finally {
      openingBook = false;
      setBooksDisabled(deps.document, false);
      reportSize();
    }
  }

  const publishOutput = (value: unknown) => {
    const output = parseBookshelfOutput(value);
    if (!output) {
      showError(deps.document, "书架工具结果不完整；轻量外壳仍保持可见。");
      reportSize();
      return;
    }
    currentBooks = output.bookshelf.filter((book) => !locallyDeletedBookIds.has(book.bookId));
    currentPage = clampShelfPage(currentBooks.length, currentPage);
    renderCurrentShelf();
    reportSize();
  };

  const removeMessageListener = deps.addMessageListener((value) => {
    if (!isRecord(value) || value.jsonrpc !== "2.0") return;

    if ("id" in value) {
      const pending = pendingRequests.get(String(value.id));
      if (pending) {
        pendingRequests.delete(String(value.id));
        deps.clearTimer(pending.timer);
        if (isRecord(value.error)) {
          pending.reject(
            new Error(
              typeof value.error.message === "string"
                ? value.error.message
                : "The host rejected the tool request."
            )
          );
        } else {
          pending.resolve(isRecord(value.result) ? (value.result as ToolCallResult) : {});
        }
        return;
      }
    }

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
      const output = parseBookshelfOutput(value.params.structuredContent);
      if (output) publishOutput(output);
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
      appInfo: { name: "德卡里奥斯家的书房｜轻量书架", version: "0.3.0" },
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
      for (const pending of pendingRequests.values()) {
        deps.clearTimer(pending.timer);
        pending.reject(new Error("The bookshelf app was closed."));
      }
      pendingRequests.clear();
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

export function parseBookDetailsOutput(value: unknown): BookDetailsOutput | undefined {
  if (!isRecord(value) || !isRecord(value.session)) return undefined;
  const session = value.session;
  if (
    !isNonEmptyString(session.id) ||
    !isNonEmptyString(session.title) ||
    (session.author !== undefined && !isNonEmptyString(session.author)) ||
    !isNonEmptyString(session.genre) ||
    !["active", "completed"].includes(String(session.status)) ||
    !isReadingPosition(session.userCurrentPosition) ||
    (session.assistantSyncedPosition !== null &&
      !isReadingPosition(session.assistantSyncedPosition)) ||
    (session.spoilerBoundary !== undefined &&
      session.spoilerBoundary !== null &&
      !isReadingPosition(session.spoilerBoundary)) ||
    !isNonEmptyString(session.lastReadAt) ||
    (session.lastNotionSyncedAt !== undefined &&
      !isNonEmptyString(session.lastNotionSyncedAt)) ||
    !Array.isArray(value.thoughts) ||
    value.thoughts.some((thought) => !isDetailThought(thought)) ||
    !Array.isArray(value.openQuestions) ||
    value.openQuestions.some((thought) => !isDetailThought(thought)) ||
    !isNonNegativeInteger(value.unsyncedThoughtCount) ||
    (value.quotes !== undefined && !Array.isArray(value.quotes)) ||
    (value.bookmarks !== undefined && !Array.isArray(value.bookmarks)) ||
    (value.casebook !== undefined && !isRecord(value.casebook))
  ) {
    return undefined;
  }
  return value as BookDetailsOutput;
}

export function renderBookshelf(
  doc: Document,
  books: BookshelfItem[],
  onOpenBook: (bookId: string) => void = () => undefined,
  page = 0,
  onPageChange: (page: number) => void = () => undefined
) {
  const list = doc.getElementById("bookshelf-list");
  if (!list) return;
  list.replaceChildren();
  const safePage = clampShelfPage(books.length, page);
  const pageCount = Math.max(1, Math.ceil(books.length / BOOKS_PER_PAGE));

  if (books.length === 0) {
    const empty = doc.createElement("p");
    empty.className = "empty";
    empty.textContent = "书架还是空的。选一本故事，我们一起开始吧。";
    list.append(empty);
  } else {
    const pageStart = safePage * BOOKS_PER_PAGE;
    for (const book of books.slice(pageStart, pageStart + BOOKS_PER_PAGE)) {
      list.append(createBookCard(doc, book, onOpenBook));
    }
  }

  const pagination = doc.getElementById("bookshelf-pagination");
  const previous = doc.getElementById("bookshelf-previous") as HTMLButtonElement | null;
  const next = doc.getElementById("bookshelf-next") as HTMLButtonElement | null;
  if (books.length > BOOKS_PER_PAGE) {
    pagination?.removeAttribute("hidden");
    setText(doc, "bookshelf-page", `第 ${safePage + 1} / ${pageCount} 页`);
    if (previous) {
      previous.disabled = safePage === 0;
      previous.onclick = () => onPageChange(safePage - 1);
    }
    if (next) {
      next.disabled = safePage === pageCount - 1;
      next.onclick = () => onPageChange(safePage + 1);
    }
  } else {
    pagination?.setAttribute("hidden", "");
    if (previous) previous.onclick = null;
    if (next) next.onclick = null;
  }

  setText(doc, "bookshelf-title", "我们的书架");
  setText(doc, "bookshelf-count", String(books.length) + " 本");
  doc.getElementById("bookshelf-probe")?.setAttribute("hidden", "");
  const detail = doc.getElementById("bookshelf-detail");
  detail?.replaceChildren();
  detail?.setAttribute("hidden", "");
  doc.getElementById("bookshelf-content")?.removeAttribute("hidden");
  setText(
    doc,
    "bookshelf-status",
    books.length > BOOKS_PER_PAGE
      ? `${books.length} 本作品 · 第 ${safePage + 1} / ${pageCount} 页 · 点击书名查看完整共读记录`
      : String(books.length) + " 本作品 · 点击书名查看完整共读记录"
  );
  setRootState(doc, "bookshelf");
}

function clampShelfPage(bookCount: number, page: number) {
  const lastPage = Math.max(0, Math.ceil(bookCount / BOOKS_PER_PAGE) - 1);
  return Math.max(0, Math.min(lastPage, Number.isInteger(page) ? page : 0));
}

export function renderBookDetails(
  doc: Document,
  details: BookDetailsOutput,
  onBack: () => void,
  onDelete: () => Promise<void>
) {
  const target = doc.getElementById("bookshelf-detail");
  if (!target) return;
  target.replaceChildren();

  const back = doc.createElement("button");
  back.type = "button";
  back.className = "back";
  back.textContent = "← 返回书架";
  back.addEventListener("click", onBack);

  const header = doc.createElement("header");
  header.className = "detail-header";
  const title = doc.createElement("h2");
  title.textContent = "《" + details.session.title + "》";
  header.append(title);
  if (details.session.author) {
    const author = doc.createElement("p");
    author.textContent = details.session.author;
    header.append(author);
  }

  const grid = doc.createElement("div");
  grid.className = "detail-grid";
  appendDetailItem(doc, grid, "塔芙读到", details.session.userCurrentPosition.label);
  appendDetailItem(
    doc,
    grid,
    "我们读到",
    details.session.assistantSyncedPosition?.label ?? "尚未接上"
  );
  appendDetailItem(
    doc,
    grid,
    "剧透边界",
    details.session.spoilerBoundary?.label ?? details.session.userCurrentPosition.label
  );
  appendDetailItem(
    doc,
    grid,
    "书页边缘",
    details.unsyncedThoughtCount > 0
      ? String(details.unsyncedThoughtCount) + " 条待同步"
      : "已经同步"
  );
  header.append(grid);

  const counts = doc.createElement("p");
  counts.className = "facts";
  const countParts = [
    String(details.thoughts.length) + " 条思考",
    String(details.quotes?.length ?? 0) + " 个摘录",
    String(details.bookmarks?.length ?? 0) + " 个书签"
  ];
  const casebookCount = countCasebookItems(details.casebook);
  if (casebookCount > 0) countParts.push("案件簿 " + String(casebookCount) + " 项");
  counts.textContent = countParts.join(" · ");
  header.append(counts);

  target.append(back, header);
  appendThoughtSection(doc, target, details.thoughts);
  appendQuestionSection(doc, target, details.openQuestions);
  appendDeleteControls(doc, target, details.session.title, onDelete);

  doc.getElementById("bookshelf-probe")?.setAttribute("hidden", "");
  doc.getElementById("bookshelf-content")?.setAttribute("hidden", "");
  target.removeAttribute("hidden");
  setText(doc, "bookshelf-status", "已打开《" + details.session.title + "》的共读记录。");
  setRootState(doc, "detail");
}

function appendDeleteControls(
  doc: Document,
  target: Element,
  title: string,
  onDelete: () => Promise<void>
) {
  const section = doc.createElement("section");
  section.className = "danger-zone";

  const trigger = doc.createElement("button");
  trigger.type = "button";
  trigger.className = "delete-trigger";
  trigger.textContent = "删除这本书";

  const confirmation = doc.createElement("div");
  confirmation.className = "delete-confirmation";
  confirmation.setAttribute("hidden", "");

  const warning = doc.createElement("p");
  warning.textContent =
    "这会删除《" +
    title +
    "》在书架中的共读进度、思考与案件记录；正文副本不会删除。";

  const actions = doc.createElement("div");
  actions.className = "delete-actions";
  const cancel = doc.createElement("button");
  cancel.type = "button";
  cancel.className = "delete-cancel";
  cancel.textContent = "取消";
  const confirm = doc.createElement("button");
  confirm.type = "button";
  confirm.className = "delete-confirm";
  confirm.textContent = "确认删除";
  const error = doc.createElement("p");
  error.className = "delete-error";
  error.setAttribute("role", "status");
  error.setAttribute("hidden", "");
  error.textContent = "没有删除成功，请稍后再试。";
  actions.append(cancel, confirm);
  confirmation.append(warning, actions, error);

  trigger.addEventListener("click", () => {
    trigger.disabled = true;
    confirmation.removeAttribute("hidden");
    confirm.focus();
  });
  cancel.addEventListener("click", () => {
    confirmation.setAttribute("hidden", "");
    error.setAttribute("hidden", "");
    trigger.disabled = false;
    trigger.focus();
  });
  confirm.addEventListener("click", async () => {
    confirm.disabled = true;
    cancel.disabled = true;
    confirm.textContent = "正在删除…";
    error.setAttribute("hidden", "");
    try {
      await onDelete();
    } catch {
      confirm.disabled = false;
      cancel.disabled = false;
      confirm.textContent = "确认删除";
      error.removeAttribute("hidden");
    }
  });

  section.append(trigger, confirmation);
  target.append(section);
}

function createBookCard(
  doc: Document,
  book: BookshelfItem,
  onOpenBook: (bookId: string) => void
) {
  const button = doc.createElement("button");
  button.type = "button";
  button.className = "book";
  button.dataset.status = book.status;
  button.setAttribute("aria-label", "打开《" + book.title + "》的共读记录");
  button.addEventListener("click", () => onOpenBook(book.bookId));

  const title = doc.createElement("h3");
  title.textContent = "《" + book.title + "》";
  const meta = doc.createElement("p");
  meta.className = "meta";
  meta.textContent = [
    book.author,
    genreLabels[book.genre],
    book.status === "active" ? "阅读中" : "已完成"
  ]
    .filter(Boolean)
    .join(" · ");
  const position = doc.createElement("p");
  position.className = "position";
  position.textContent =
    "塔芙：" +
    book.tavPosition.label +
    " · 共同进度：" +
    (book.sharedPosition?.label ?? "尚未同步");
  button.append(title, meta, position);

  if (book.latestThought) {
    const thought = doc.createElement("p");
    thought.className = "thought";
    thought.textContent =
      authorLabels[book.latestThought.author] + "：" + book.latestThought.content;
    button.append(thought);
  }

  const facts = doc.createElement("p");
  facts.className = "facts";
  const parts = [String(book.openQuestionCount) + " 个开放问题"];
  if (book.casebookInProgress) parts.push("案件簿 " + String(book.casebookItemCount) + " 项");
  if (book.unsyncedThoughtCount > 0) {
    parts.push(String(book.unsyncedThoughtCount) + " 条待同步");
  }
  facts.textContent = parts.join(" · ");
  button.append(facts);
  return button;
}

function appendThoughtSection(doc: Document, target: Element, thoughts: DetailThought[]) {
  const section = doc.createElement("section");
  section.className = "detail-section";
  section.append(createSectionHeading(doc, "我们把书读厚的地方", String(thoughts.length)));
  const list = doc.createElement("div");
  list.className = "thought-list";
  for (const thought of thoughts.slice(0, 16)) {
    const row = doc.createElement("article");
    row.className = "thought-row";
    row.dataset.author = thought.author;
    const meta = doc.createElement("div");
    meta.className = "thought-meta";
    const author = doc.createElement("b");
    author.textContent = authorLabels[thought.author];
    const kind = doc.createElement("span");
    kind.textContent = thought.kind ? kindLabels[thought.kind] ?? thought.kind : "思考";
    const position = doc.createElement("span");
    position.textContent =
      thought.position?.label ??
      (thought.updatedAt ? formatDate(thought.updatedAt) : statusLabels[thought.status ?? ""] ?? "");
    meta.append(author, kind, position);
    const content = doc.createElement("p");
    content.textContent = thought.content;
    row.append(meta, content);
    list.append(row);
  }
  if (thoughts.length === 0) {
    const empty = doc.createElement("p");
    empty.className = "empty";
    empty.textContent = "还没有需要钉在书页边缘的想法。";
    list.append(empty);
  }
  section.append(list);
  target.append(section);
}

function appendQuestionSection(
  doc: Document,
  target: Element,
  questions: DetailThought[]
) {
  if (questions.length === 0) return;
  const section = doc.createElement("section");
  section.className = "detail-section";
  section.append(createSectionHeading(doc, "还没合上的问题", String(questions.length)));
  const list = doc.createElement("ol");
  list.className = "question-list";
  for (const question of questions) {
    const item = doc.createElement("li");
    item.textContent =
      question.content + (question.position?.label ? " · " + question.position.label : "");
    list.append(item);
  }
  section.append(list);
  target.append(section);
}

function createSectionHeading(doc: Document, label: string, count: string) {
  const heading = doc.createElement("div");
  heading.className = "section-heading";
  const title = doc.createElement("h3");
  title.textContent = label;
  const amount = doc.createElement("span");
  amount.textContent = count;
  heading.append(title, amount);
  return heading;
}

function appendDetailItem(doc: Document, grid: Element, label: string, value: string) {
  const item = doc.createElement("div");
  const key = doc.createElement("span");
  key.className = "detail-label";
  key.textContent = label;
  const content = doc.createElement("strong");
  content.textContent = value;
  item.append(key, content);
  grid.append(item);
}

function countCasebookItems(value: Record<string, unknown> | undefined) {
  if (!value) return 0;
  return ["entities", "relations", "clues", "hypotheses", "timeline", "observationTasks"]
    .map((key) => (Array.isArray(value[key]) ? value[key].length : 0))
    .reduce((total, count) => total + count, 0);
}

function setBooksDisabled(doc: Document, disabled: boolean) {
  for (const element of doc.querySelectorAll<HTMLButtonElement>("button.book")) {
    element.disabled = disabled;
  }
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

function isDetailThought(value: unknown): value is DetailThought {
  return (
    isRecord(value) &&
    ["tav", "gale", "shared"].includes(String(value.author)) &&
    isNonEmptyString(value.content) &&
    (value.id === undefined || isNonEmptyString(value.id)) &&
    (value.kind === undefined || isNonEmptyString(value.kind)) &&
    (value.status === undefined || isNonEmptyString(value.status)) &&
    (value.updatedAt === undefined || isNonEmptyString(value.updatedAt)) &&
    (value.position === undefined || isReadingPosition(value.position))
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

function formatDate(value: string) {
  try {
    return new Intl.DateTimeFormat("zh-CN", {
      timeZone: "Asia/Shanghai",
      month: "long",
      day: "numeric"
    }).format(new Date(value));
  } catch {
    return value;
  }
}

function showError(doc: Document, message: string) {
  setText(doc, "bookshelf-status", message);
  setRootState(doc, "error");
}

function setRootState(doc: Document, state: string) {
  const root = doc.getElementById("bookshelf-static-v4");
  if (root) root.dataset.state = state;
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
  document.getElementById("bookshelf-static-v4")
) {
  createStaticBookshelfApp();
}
