import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { parseBookFile } from "./book-file-parser.js";
import { setActiveImportedBook } from "./active-imported-book.js";
import { cacheStructuredBook } from "./structured-book-cache.js";

export function EpubImportBridge() {
  const [host, setHost] = useState<Element | null>(null);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const locateHost = () => setHost(document.querySelector(".novel-source-field .source-import-row"));
    locateHost();
    const observer = new MutationObserver(locateHost);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  if (!host) return null;

  const importEpub = async (file: File | undefined) => {
    if (!file || busy) return;
    setBusy(true);
    setStatus("正在读取 EPUB…");
    try {
      const parsed = await parseBookFile(file);
      if (parsed.format !== "epub") throw new Error("请选择 EPUB 文件");
      setActiveImportedBook(parsed);
      await cacheStructuredBook(parsed);
      setControlledValue(
        document.querySelector<HTMLInputElement>('input[aria-label="作品名"]'),
        parsed.title,
        true
      );
      setControlledValue(
        document.querySelector<HTMLTextAreaElement>("#novel-source-text"),
        parsed.sourceText
      );
      setStatus(`EPUB 已读取并缓存：${parsed.chapters.length} 个章节`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "EPUB 读取失败");
    } finally {
      setBusy(false);
    }
  };

  return createPortal(
    <>
      <label className="source-import-button">
        {busy ? "正在读取 EPUB" : "上传 EPUB"}
        <input
          aria-label="上传 EPUB"
          type="file"
          accept=".epub,application/epub+zip"
          disabled={busy}
          onChange={(event) => {
            void importEpub(event.target.files?.[0]);
            event.target.value = "";
          }}
        />
      </label>
      {status ? <span aria-live="polite">{status}</span> : null}
    </>,
    host
  );
}

function setControlledValue(
  element: HTMLInputElement | HTMLTextAreaElement | null,
  value: string,
  onlyWhenBlank = false
): void {
  if (!element || (onlyWhenBlank && element.value.trim())) return;
  const prototype =
    element instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
  setter?.call(element, value);
  element.dispatchEvent(new Event("input", { bubbles: true }));
  element.dispatchEvent(new Event("change", { bubbles: true }));
}
