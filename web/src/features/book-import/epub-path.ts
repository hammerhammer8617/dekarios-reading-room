export function normalizeEpubPath(value: string): string {
  const parts: string[] = [];
  const clean = value.replace(/\\/g, "/").split(/[?#]/, 1)[0] ?? "";
  for (const part of clean.split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") parts.pop();
    else parts.push(part);
  }
  return parts.join("/");
}

export function resolveEpubPath(base: string, href: string): string {
  return normalizeEpubPath([base, href].filter(Boolean).join("/"));
}

export function epubDirectoryName(value: string): string {
  const normalized = normalizeEpubPath(value);
  const index = normalized.lastIndexOf("/");
  return index < 0 ? "" : normalized.slice(0, index);
}

export function safeDecodeEpubPath(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
