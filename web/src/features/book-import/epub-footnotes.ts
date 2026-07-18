import type {
  ParsedBookFootnote,
  ParsedBookFootnoteReference
} from "./types.js";
import { epubDirectoryName, resolveEpubPath } from "./epub-path.js";

export interface EpubFootnoteExtraction {
  notes: ParsedBookFootnote[];
  notesByTarget: ReadonlyMap<string, ParsedBookFootnote>;
  containers: ReadonlySet<Element>;
}

export function extractEpubFootnotes(
  body: Element,
  chapterId: string,
  chapterPath: string
): EpubFootnoteExtraction {
  const notes: ParsedBookFootnote[] = [];
  const notesByTarget = new Map<string, ParsedBookFootnote>();
  const containers = new Set<Element>();

  for (const element of Array.from(body.querySelectorAll("aside,div,p,li"))) {
    if (!isFootnoteContainer(element) || hasFootnoteAncestor(element, body)) continue;
    const target = findFootnoteTarget(element);
    if (!target) continue;

    const label = cleanFootnoteText(target.textContent ?? "");
    const copy = element.cloneNode(true) as Element;
    for (const backlink of Array.from(copy.querySelectorAll("a[href]"))) {
      const href = backlink.getAttribute("href") ?? "";
      if (href.includes("#zw") || hasBacklinkRole(backlink)) backlink.remove();
    }
    const text = cleanFootnoteText(copy.textContent ?? "");
    if (!text) continue;

    const targetId = target.getAttribute("id")?.trim() || element.getAttribute("id")?.trim();
    if (!targetId) continue;
    const note: ParsedBookFootnote = {
      id: `${chapterId}-note-${targetId}`,
      label: label || targetId,
      text,
      targetHref: `${chapterPath}#${targetId}`,
      backHref: target.getAttribute("href") || undefined
    };
    notes.push(note);
    notesByTarget.set(note.targetHref, note);
    containers.add(element);
  }

  return { notes, notesByTarget, containers };
}

export function extractTextAndFootnoteRefs(
  element: Element,
  chapterPath: string,
  notesByTarget: ReadonlyMap<string, ParsedBookFootnote>
): { text: string; footnoteRefs: ParsedBookFootnoteReference[] } {
  let text = "";
  const footnoteRefs: ParsedBookFootnoteReference[] = [];

  const walk = (node: Node): void => {
    if (node.nodeType === Node.TEXT_NODE) {
      text += node.textContent ?? "";
      return;
    }
    if (!(node instanceof Element)) return;

    if (node.localName.toLowerCase() === "a") {
      const href = node.getAttribute("href")?.trim();
      const targetHref = href ? resolveEpubLink(chapterPath, href) : null;
      const note = targetHref ? notesByTarget.get(targetHref) : undefined;
      if (note || isNoteref(node)) {
        footnoteRefs.push({
          id: `${element.getAttribute("id") ?? "block"}-ref-${footnoteRefs.length + 1}`,
          noteId: note?.id ?? targetHref ?? href ?? "",
          label: cleanFootnoteText(node.textContent ?? "") || note?.label || "注",
          offset: cleanFootnoteText(text).length
        });
        return;
      }
    }

    for (const child of Array.from(node.childNodes)) walk(child);
  };

  for (const child of Array.from(element.childNodes)) walk(child);
  return { text: cleanFootnoteText(text), footnoteRefs };
}

export function resolveEpubLink(chapterPath: string, href: string): string {
  const [resourcePart, fragmentPart = ""] = href.split("#", 2);
  const path = resourcePart
    ? resolveEpubPath(epubDirectoryName(chapterPath), resourcePart)
    : chapterPath;
  return fragmentPart ? `${path}#${decodeFragment(fragmentPart)}` : path;
}

function hasFootnoteAncestor(element: Element, body: Element): boolean {
  let parent = element.parentElement;
  while (parent && parent !== body) {
    if (isFootnoteContainer(parent)) return true;
    parent = parent.parentElement;
  }
  return false;
}

function isFootnoteContainer(element: Element): boolean {
  const role = element.getAttribute("role") ?? "";
  const epubType =
    element.getAttribute("epub:type") ??
    element.getAttributeNS("http://www.idpf.org/2007/ops", "type") ??
    "";
  const className = element.getAttribute("class") ?? "";
  if (/doc-(footnote|endnote)/i.test(role)) return true;
  if (/(^|\s)(footnote|endnote)(\s|$)/i.test(epubType)) return true;
  if (/(^|[-_\s])(fnote\d*|footnote|endnote)([-_\s]|$)/i.test(className)) return true;
  return Boolean(
    element.querySelector(':scope > a[id^="zhu"][href*="#zw"],:scope > a[id^="note"][href*="#"],:scope > p > a[id^="zhu"][href*="#zw"]')
  );
}

function findFootnoteTarget(element: Element): Element | null {
  if (element.id) return element;
  return element.querySelector("a[id],span[id],p[id]");
}

function isNoteref(element: Element): boolean {
  const role = element.getAttribute("role") ?? "";
  const epubType =
    element.getAttribute("epub:type") ??
    element.getAttributeNS("http://www.idpf.org/2007/ops", "type") ??
    "";
  const id = element.getAttribute("id") ?? "";
  return /doc-noteref/i.test(role) || /(^|\s)noteref(\s|$)/i.test(epubType) || /^zw\d+$/i.test(id);
}

function hasBacklinkRole(element: Element): boolean {
  const role = element.getAttribute("role") ?? "";
  const epubType = element.getAttribute("epub:type") ?? "";
  return /doc-backlink/i.test(role) || /backlink/i.test(epubType);
}

function cleanFootnoteText(value: string): string {
  return value
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\s*\n\s*/g, " ")
    .trim();
}

function decodeFragment(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
