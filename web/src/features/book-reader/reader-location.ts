const READER_LOCATION_STORAGE_PREFIX = "gtd-reading-location";

export interface StoredReaderLocation {
  currentIndex: number;
  scrollByIndex: Record<string, number>;
  updatedAt: string;
  bookmarkIndex?: number;
  bookmarkScrollTop?: number;
  bookmarkedAt?: string;
}

export function loadReaderLocation(sessionId: string): StoredReaderLocation | null {
  try {
    const raw = localStorage.getItem(readerLocationStorageKey(sessionId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredReaderLocation>;
    if (
      !Number.isInteger(parsed.currentIndex) ||
      (parsed.currentIndex ?? 0) < 1 ||
      !parsed.scrollByIndex ||
      typeof parsed.scrollByIndex !== "object" ||
      typeof parsed.updatedAt !== "string"
    ) {
      return null;
    }
    return parsed as StoredReaderLocation;
  } catch {
    return null;
  }
}

export function saveReaderLocation(
  sessionId: string,
  index: number,
  scrollTop: number,
  options: { markCurrent?: boolean } = {}
): StoredReaderLocation {
  const existing = loadReaderLocation(sessionId);
  const normalizedIndex = Math.max(1, Math.trunc(index));
  const normalizedScrollTop = Math.max(0, Math.round(scrollTop));
  const next: StoredReaderLocation = {
    currentIndex:
      options.markCurrent === false
        ? existing?.currentIndex ?? normalizedIndex
        : normalizedIndex,
    scrollByIndex: {
      ...(existing?.scrollByIndex ?? {}),
      [String(normalizedIndex)]: normalizedScrollTop
    },
    updatedAt: new Date().toISOString(),
    ...(existing?.bookmarkIndex
      ? {
          bookmarkIndex: existing.bookmarkIndex,
          bookmarkScrollTop: existing.bookmarkScrollTop ?? 0,
          ...(existing.bookmarkedAt ? { bookmarkedAt: existing.bookmarkedAt } : {})
        }
      : {})
  };
  persistReaderLocation(sessionId, next);
  return next;
}

export function saveReaderBookmark(
  sessionId: string,
  index: number,
  scrollTop: number
): StoredReaderLocation {
  const next = saveReaderLocation(sessionId, index, scrollTop);
  const bookmarked: StoredReaderLocation = {
    ...next,
    bookmarkIndex: Math.max(1, Math.trunc(index)),
    bookmarkScrollTop: Math.max(0, Math.round(scrollTop)),
    bookmarkedAt: new Date().toISOString()
  };
  persistReaderLocation(sessionId, bookmarked);
  return bookmarked;
}

export function savedScrollTop(
  location: StoredReaderLocation | null,
  index: number
): number | null {
  const value = location?.scrollByIndex[String(index)];
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : null;
}

export function isLocalLocationNewer(
  location: StoredReaderLocation,
  sessionUpdatedAt: string
): boolean {
  const localTime = Date.parse(location.updatedAt);
  const sessionTime = Date.parse(sessionUpdatedAt);
  if (!Number.isFinite(localTime)) return false;
  if (!Number.isFinite(sessionTime)) return true;
  return localTime > sessionTime;
}

export function readerLocationStorageKey(sessionId: string): string {
  return `${READER_LOCATION_STORAGE_PREFIX}:${sessionId}`;
}

function persistReaderLocation(
  sessionId: string,
  location: StoredReaderLocation
): void {
  try {
    localStorage.setItem(readerLocationStorageKey(sessionId), JSON.stringify(location));
  } catch {
    // Server-side unit progress remains available when device storage is unavailable.
  }
}
