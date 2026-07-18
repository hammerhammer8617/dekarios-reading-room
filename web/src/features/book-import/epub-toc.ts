import { epubDirectoryName, resolveEpubPath } from "./epub-path.js";

export function readEpub2TocTitles(
  document: Document,
  tocPath: string
): Map<string, string> {
  const result = new Map<string, string>();
  const tocDirectory = epubDirectoryName(tocPath);
  const navPoints = Array.from(document.getElementsByTagNameNS("*", "navPoint"));
  for (const navPoint of navPoints) {
    const content = navPoint.getElementsByTagNameNS("*", "content")[0];
    const label = navPoint.getElementsByTagNameNS("*", "text")[0]?.textContent?.trim();
    const src = content?.getAttribute("src")?.trim();
    if (!label || !src) continue;
    result.set(resolveEpubPath(tocDirectory, src), label);
  }
  return result;
}
