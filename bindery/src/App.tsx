import { useEffect, useMemo, useRef, useState } from "react";
import { buildEpubWithinBudget, MAX_EPUB_OUTPUT_BYTES } from "./epub.js";
import {
  ACCEPTED_BOOK_FILES,
  detectBinderyFormat,
  formatBytes,
  stripBookExtension
} from "./format.js";
import { optimizeExistingEpub } from "./optimize-epub.js";
import { parseSourceBook } from "./parsers.js";
import { BinderyError, type BuiltEpub } from "./types.js";

type Phase = "idle" | "reading" | "packing" | "ready" | "failed";

export function App() {
  const [file, setFile] = useState<File | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [status, setStatus] = useState("请选择一本需要整理的电子书。");
  const [result, setResult] = useState<BuiltEpub | null>(null);
  const [error, setError] = useState("");
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const downloadUrl = useMemo(
    () => (result ? URL.createObjectURL(result.blob) : ""),
    [result]
  );
  useEffect(
    () => () => {
      if (downloadUrl) URL.revokeObjectURL(downloadUrl);
    },
    [downloadUrl]
  );

  function selectFile(nextFile: File | null) {
    setResult(null);
    setError("");
    if (!nextFile) {
      setFile(null);
      setPhase("idle");
      setStatus("请选择一本需要整理的电子书。");
      return;
    }
    try {
      detectBinderyFormat(nextFile.name);
      setFile(nextFile);
      setPhase("idle");
      setStatus("文件已放上装订台，可以开始转换。");
    } catch (reason) {
      setFile(null);
      setPhase("failed");
      setError(errorMessage(reason));
    }
  }

  async function convert() {
    if (!file || phase === "reading" || phase === "packing") return;
    setResult(null);
    setError("");
    try {
      const format = detectBinderyFormat(file.name);
      let built: BuiltEpub;
      if (format === "epub") {
        setPhase("packing");
        setStatus("正在保留原排版并重新压缩 EPUB……");
        built = await optimizeExistingEpub(file, (label) => {
          setStatus(`正在尝试“${label}”图片档位并校验真实体积……`);
        });
      } else {
        setPhase("reading");
        setStatus(`正在读取 ${format.toUpperCase()} 的正文、目录与图片……`);
        const book = await parseSourceBook(file);
        setPhase("packing");
        setStatus("正文读取完成，正在生成 EPUB……");
        built = await buildEpubWithinBudget(book, (label) => {
          setStatus(`正在使用“${label}”图片档位装订并校验体积……`);
        });
      }
      setResult(built);
      setPhase("ready");
      setStatus(`装订完成：${formatBytes(built.sizeBytes)}，已通过小于 40 MB 的硬校验。`);
    } catch (reason) {
      setPhase("failed");
      setStatus("这次没有生成可下载文件。");
      setError(errorMessage(reason));
    }
  }

  return (
    <main className="bindery-shell">
      <header className="bindery-hero">
        <div className="bindery-mark">G.T.D.</div>
        <p className="eyebrow">德卡里奥斯家的书房 · 独立工具</p>
        <h1>电子书装订室</h1>
        <p className="hero-copy">
          把其他格式整理成书房能读的 EPUB。处理只发生在当前浏览器里，原书不会上传。
        </p>
      </header>

      <section className="workbench" aria-labelledby="workbench-title">
        <div className="section-heading">
          <div>
            <p className="step-label">01 · 放上原书</p>
            <h2 id="workbench-title">选择一本文件</h2>
          </div>
          <span className="limit-badge">输出 &lt; 40 MB</span>
        </div>

        <button
          className={`drop-zone ${dragging ? "dragging" : ""}`}
          type="button"
          onClick={() => inputRef.current?.click()}
          onDragEnter={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragOver={(event) => event.preventDefault()}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragging(false);
            selectFile(event.dataTransfer.files[0] ?? null);
          }}
        >
          <span className="drop-icon" aria-hidden="true">⌁</span>
          {file ? (
            <span className="file-summary">
              <strong>{file.name}</strong>
              <small>{formatBytes(file.size)} · {detectBinderyFormat(file.name).toUpperCase()}</small>
            </span>
          ) : (
            <span className="file-summary">
              <strong>点击选择，或把文件拖到这里</strong>
              <small>TXT / MD / HTML / DOCX / PDF / MOBI / AZW3 / EPUB</small>
            </span>
          )}
        </button>
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED_BOOK_FILES}
          hidden
          onChange={(event) => selectFile(event.target.files?.[0] ?? null)}
        />

        <div className="conversion-status" aria-live="polite" data-phase={phase}>
          <span className="status-dot" />
          <p>{status}</p>
        </div>

        {error ? <div className="error-card" role="alert"><strong>装订没有完成</strong><p>{error}</p></div> : null}

        {result ? (
          <div className="result-card">
            <div>
              <p className="step-label">02 · 成品</p>
              <h2>{result.fileName}</h2>
              <p>{formatBytes(result.sizeBytes)} · {result.passLabel}档 · 严格小于 {formatBytes(MAX_EPUB_OUTPUT_BYTES)}</p>
            </div>
            <a className="download-button" href={downloadUrl} download={result.fileName}>
              下载 EPUB
            </a>
            {result.warnings.length > 0 ? (
              <ul className="warning-list">
                {result.warnings.map((warning) => <li key={warning}>{warning}</li>)}
              </ul>
            ) : null}
          </div>
        ) : null}

        <div className="workbench-actions">
          <button
            type="button"
            className="primary-button"
            disabled={!file || phase === "reading" || phase === "packing"}
            onClick={convert}
          >
            {phase === "reading" || phase === "packing" ? "正在装订……" : "转换并校验"}
          </button>
          {file ? (
            <button type="button" className="quiet-button" onClick={() => selectFile(null)}>
              换一本
            </button>
          ) : null}
        </div>
      </section>

      <section className="format-notes">
        <article>
          <strong>保留得最好</strong>
          <p>TXT、Markdown、HTML、DOCX 会整理成清晰章节；DOCX 内嵌图片会一并装订。</p>
        </article>
        <article>
          <strong>文字型 PDF</strong>
          <p>保留文字与页码，不复刻原始版式。扫描 PDF 需要 OCR，本版会明确停止。</p>
        </article>
        <article>
          <strong>Kindle 与 EPUB</strong>
          <p>支持无 DRM 的 MOBI/AZW3；现有 EPUB 可保留结构后重新压缩。不会破解 DRM。</p>
        </article>
      </section>

      <footer>
        <span>装订室不会保存原书。下载完成后，成品由你亲手带进书房。</span>
        <a href="../">返回书房</a>
      </footer>
    </main>
  );
}

function errorMessage(reason: unknown): string {
  if (reason instanceof BinderyError || reason instanceof Error) return reason.message;
  return "发生了无法识别的转换错误。";
}
