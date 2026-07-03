import { useEffect, useState } from "react";
import { FootnotedChapter } from "../book-reader/FootnotedChapter.js";
import { parseBookFile } from "./book-file-parser.js";
import {
  cacheStructuredBook,
  restoreStructuredBookByKey
} from "./structured-book-cache.js";
import type { ParsedBook } from "./types.js";

const LAST_BOOK_KEY = "gtd-epub-smoke-last-book";
const LAST_CHAPTER_KEY = "gtd-epub-smoke-last-chapter";

export function EpubSmokeLab() {
  const [book, setBook] = useState<ParsedBook | null>(null);
  const [chapterIndex, setChapterIndex] = useState(0);
  const [status, setStatus] = useState("请选择一本 EPUB 开始验收。");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const key = localStorage.getItem(LAST_BOOK_KEY);
    if (!key) return;
    let cancelled = false;
    setStatus("正在恢复上次打开的 EPUB…");
    void restoreStructuredBookByKey(key)
      .then((restored) => {
        if (cancelled || !restored) return;
        const rememberedIndex = Number(localStorage.getItem(LAST_CHAPTER_KEY) ?? "0");
        setBook(restored);
        setChapterIndex(clampChapterIndex(rememberedIndex, restored));
        setStatus("已从本机缓存恢复上次打开的 EPUB。");
      })
      .catch(() => {
        if (!cancelled) setStatus("上次的 EPUB 没能恢复，请重新上传。");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!book) return;
    localStorage.setItem(LAST_CHAPTER_KEY, String(chapterIndex));
  }, [book, chapterIndex]);

  const importBook = async (file: File | undefined) => {
    if (!file || busy) return;
    setBusy(true);
    setStatus("正在解析 EPUB…");
    try {
      const parsed = await parseBookFile(file);
      if (parsed.format !== "epub") throw new Error("请选择 EPUB 文件。");
      const key = await cacheStructuredBook(parsed);
      localStorage.setItem(LAST_BOOK_KEY, key);
      localStorage.setItem(LAST_CHAPTER_KEY, "0");
      setBook(parsed);
      setChapterIndex(0);
      setStatus(
        `读取成功：${parsed.chapters.length} 个阅读单元，${parsed.resources?.length ?? 0} 个图片资源。`
      );
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "EPUB 读取失败。");
    } finally {
      setBusy(false);
    }
  };

  const chapter = book?.chapters[chapterIndex];
  const previous = () => setChapterIndex((value) => Math.max(0, value - 1));
  const next = () =>
    setChapterIndex((value) => Math.min((book?.chapters.length ?? 1) - 1, value + 1));

  return (
    <main style={styles.shell}>
      <header style={styles.header}>
        <div>
          <p style={styles.eyebrow}>G.T.D. Reading Room</p>
          <h1 style={styles.title}>塔芙测试组 · EPUB 验收入口</h1>
          <p style={styles.subtitle}>只在本机解析和缓存，不上传书籍内容。</p>
        </div>
        <label style={styles.uploadButton}>
          {busy ? "正在读取…" : "选择 EPUB"}
          <input
            type="file"
            accept=".epub,application/epub+zip"
            disabled={busy}
            style={styles.hiddenInput}
            onChange={(event) => {
              void importBook(event.target.files?.[0]);
              event.target.value = "";
            }}
          />
        </label>
      </header>

      <section aria-live="polite" style={styles.statusCard}>
        <strong>{status}</strong>
        {book ? (
          <span style={styles.metadata}>
            {book.title} · {book.authors.join("、") || "作者信息未提供"}
          </span>
        ) : null}
        <span style={styles.hint}>
          阅读单元来自 EPUB 内部结构，不等同于阅读器根据屏幕与字号生成的页码。
        </span>
      </section>

      {book && chapter ? (
        <>
          <nav style={styles.navigation} aria-label="阅读单元导航">
            <button type="button" onClick={previous} disabled={chapterIndex === 0} style={styles.navButton}>
              上一阅读单元
            </button>
            <span style={styles.chapterCounter}>
              {chapterIndex + 1} / {book.chapters.length} · {chapter.title}
            </span>
            <button
              type="button"
              onClick={next}
              disabled={chapterIndex >= book.chapters.length - 1}
              style={styles.navButton}
            >
              下一阅读单元
            </button>
          </nav>

          <section style={styles.paper}>
            <FootnotedChapter chapter={chapter} resources={book.resources} />
          </section>

          <nav style={styles.navigation} aria-label="页尾阅读单元导航">
            <button type="button" onClick={previous} disabled={chapterIndex === 0} style={styles.navButton}>
              上一阅读单元
            </button>
            <span style={styles.chapterCounter}>{chapter.title}</span>
            <button
              type="button"
              onClick={next}
              disabled={chapterIndex >= book.chapters.length - 1}
              style={styles.navButton}
            >
              下一阅读单元
            </button>
          </nav>
        </>
      ) : (
        <section style={styles.emptyState}>
          <strong>书房侧门已经打开。</strong>
          <p>上传 EPUB 后，请检查阅读单元标题、正文顺序、图片和脚注气泡。</p>
          <p>共读、划线和收藏请回到正式书房使用。</p>
        </section>
      )}
    </main>
  );
}

function clampChapterIndex(index: number, book: ParsedBook): number {
  if (!Number.isFinite(index)) return 0;
  return Math.max(0, Math.min(book.chapters.length - 1, Math.trunc(index)));
}

const styles = {
  shell: {
    width: "min(100%, 58rem)",
    margin: "0 auto",
    padding: "1.25rem",
    color: "#2e2833",
    fontFamily: "ui-serif, Georgia, 'Times New Roman', serif"
  },
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "1rem",
    flexWrap: "wrap" as const,
    padding: "1.25rem 0"
  },
  eyebrow: { margin: 0, fontSize: "0.75rem", letterSpacing: "0.16em", textTransform: "uppercase" as const },
  title: { margin: "0.25rem 0", fontSize: "clamp(1.55rem, 5vw, 2.5rem)" },
  subtitle: { margin: 0, opacity: 0.7 },
  uploadButton: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    minHeight: "2.75rem",
    padding: "0 1.1rem",
    borderRadius: "999px",
    background: "#5c466f",
    color: "white",
    cursor: "pointer",
    fontFamily: "ui-sans-serif, system-ui, sans-serif"
  },
  hiddenInput: { position: "absolute" as const, width: 1, height: 1, opacity: 0 },
  statusCard: {
    display: "grid",
    gap: "0.35rem",
    padding: "0.9rem 1rem",
    border: "1px solid rgba(92,70,111,.18)",
    borderRadius: "1rem",
    background: "rgba(255,255,255,.72)"
  },
  metadata: { fontSize: "0.9rem", opacity: 0.72 },
  hint: { fontSize: "0.82rem", opacity: 0.62 },
  navigation: {
    display: "grid",
    gridTemplateColumns: "minmax(7rem, auto) 1fr minmax(7rem, auto)",
    alignItems: "center",
    gap: "0.75rem",
    margin: "1rem 0"
  },
  navButton: {
    minHeight: "2.5rem",
    border: "1px solid rgba(92,70,111,.25)",
    borderRadius: "0.75rem",
    background: "white",
    font: "inherit"
  },
  chapterCounter: { textAlign: "center" as const, fontSize: "0.9rem" },
  paper: {
    minWidth: 0,
    maxWidth: "100%",
    minHeight: "45vh",
    padding: "clamp(1rem, 4vw, 3rem)",
    overflow: "hidden",
    borderRadius: "1.25rem",
    background: "#fffdf9",
    boxShadow: "0 18px 50px rgba(54,42,63,.12)",
    lineHeight: 1.9
  },
  emptyState: {
    marginTop: "1rem",
    padding: "3rem 1.25rem",
    border: "1px dashed rgba(92,70,111,.35)",
    borderRadius: "1.25rem",
    textAlign: "center" as const
  }
} satisfies Record<string, React.CSSProperties>;
