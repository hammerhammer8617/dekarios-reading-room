import type {
  Bookmark,
  CompanionComment,
  Quote,
  Reaction
} from "@ss/shared";

export interface ReadingNotesExportInput {
  title: string;
  authors?: string[];
  quotes: Quote[];
  reactions?: Reaction[];
  bookmarks?: Bookmark[];
  companionComments?: CompanionComment[];
  exportedAt?: Date;
}

export interface ReadingNotesJsonExport {
  version: 1;
  title: string;
  authors: string[];
  exportedAt: string;
  quotes: Quote[];
  reactions: Reaction[];
  bookmarks: Bookmark[];
  companionComments: CompanionComment[];
}

export function buildReadingNotesJson(
  input: ReadingNotesExportInput
): ReadingNotesJsonExport {
  return {
    version: 1,
    title: input.title,
    authors: input.authors ?? [],
    exportedAt: (input.exportedAt ?? new Date()).toISOString(),
    quotes: [...input.quotes],
    reactions: [...(input.reactions ?? [])],
    bookmarks: [...(input.bookmarks ?? [])],
    companionComments: [...(input.companionComments ?? [])]
  };
}

export function buildReadingNotesMarkdown(
  input: ReadingNotesExportInput
): string {
  const exportedAt = input.exportedAt ?? new Date();
  const lines = [
    `# ${input.title}`,
    input.authors?.length ? `作者：${input.authors.join("、")}` : "",
    `导出时间：${exportedAt.toLocaleString()}`,
    ""
  ].filter((line, index) => line || index === 3);

  const items = [
    ...input.quotes.map((quote) => ({
      kind: "quote" as const,
      createdAt: quote.createdAt,
      positionIndex: quote.position.index,
      value: quote
    })),
    ...(input.reactions ?? []).map((reaction) => ({
      kind: "reaction" as const,
      createdAt: reaction.createdAt,
      positionIndex: reaction.position.index,
      value: reaction
    })),
    ...(input.companionComments ?? []).map((comment) => ({
      kind: "comment" as const,
      createdAt: comment.createdAt,
      positionIndex: comment.position.index,
      value: comment
    }))
  ].sort(
    (left, right) =>
      left.positionIndex - right.positionIndex ||
      left.createdAt.localeCompare(right.createdAt)
  );

  for (const item of items) {
    if (item.kind === "quote") {
      lines.push(
        `## ${item.value.position.label}`,
        "",
        blockquote(item.value.content),
        item.value.note ? `\n我的批注：${item.value.note}` : "",
        ""
      );
      continue;
    }

    if (item.kind === "reaction") {
      lines.push(
        `### 我的吐槽 · ${item.value.position.label}`,
        "",
        item.value.content,
        ""
      );
      continue;
    }

    lines.push(
      `### 盖尔的页边批注 · ${item.value.position.label}`,
      "",
      item.value.text,
      ""
    );
  }

  if ((input.bookmarks ?? []).length) {
    lines.push("## 书签", "");
    for (const bookmark of input.bookmarks ?? []) {
      lines.push(`- ${bookmark.position.label}${bookmark.label ? `：${bookmark.label}` : ""}`);
    }
    lines.push("");
  }

  return lines.filter((line, index, all) => !(line === "" && all[index - 1] === "")).join("\n").trim() + "\n";
}

export function downloadReadingNotes(
  fileName: string,
  content: string,
  mimeType: string
): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}

function blockquote(value: string): string {
  return value
    .split("\n")
    .map((line) => `> ${line}`)
    .join("\n");
}
