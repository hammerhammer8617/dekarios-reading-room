import type { ParsedBook } from "./types.js";

const DATABASE_NAME = "ss-reading-nest-structured-books";
const DATABASE_VERSION = 1;
const STORE_NAME = "books";

export async function cacheStructuredBook(book: ParsedBook): Promise<string> {
  const key = structuredBookCacheKey(book.sourceText);
  const database = await openStructuredBookDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).put(
      {
        key,
        book,
        updatedAt: new Date().toISOString()
      },
      key
    );
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("结构化书籍缓存失败"));
    transaction.onabort = () => reject(transaction.error ?? new Error("结构化书籍缓存中止"));
  }).finally(() => database.close());
  return key;
}

export async function restoreStructuredBook(sourceText: string): Promise<ParsedBook | null> {
  if (!sourceText.trim()) return null;
  const key = structuredBookCacheKey(sourceText);
  const book = await restoreStructuredBookByKey(key);
  return book?.sourceText === sourceText ? book : null;
}

export async function restoreStructuredBookByKey(key: string): Promise<ParsedBook | null> {
  if (!key.trim()) return null;
  const database = await openStructuredBookDatabase();
  return new Promise<ParsedBook | null>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readonly");
    const request = transaction.objectStore(STORE_NAME).get(key);
    request.onsuccess = () => {
      const record = request.result as { book?: ParsedBook } | undefined;
      resolve(record?.book ?? null);
    };
    request.onerror = () => reject(request.error ?? new Error("结构化书籍缓存读取失败"));
    transaction.oncomplete = () => database.close();
    transaction.onabort = () => database.close();
  });
}

export function structuredBookCacheKey(sourceText: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < sourceText.length; index += 1) {
    hash ^= sourceText.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `book-${sourceText.length}-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

function openStructuredBookDatabase(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") {
    return Promise.reject(new Error("当前环境不支持结构化书籍缓存"));
  }
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("结构化书籍缓存不可用"));
  });
}
