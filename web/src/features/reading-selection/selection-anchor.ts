export interface SelectionTextBlock {
  id: string;
  text: string;
}

export interface TextSelectionAnchor {
  version: 1;
  chapterId: string;
  startBlockId: string;
  startOffset: number;
  endBlockId: string;
  endOffset: number;
  exact: string;
  prefix: string;
  suffix: string;
}

export interface ResolvedTextSelection {
  startBlockId: string;
  startOffset: number;
  endBlockId: string;
  endOffset: number;
  exact: string;
}

const BLOCK_SEPARATOR = "\n\n";

export function createTextSelectionAnchor(input: {
  chapterId: string;
  blocks: SelectionTextBlock[];
  startBlockId: string;
  startOffset: number;
  endBlockId: string;
  endOffset: number;
  contextLength?: number;
}): TextSelectionAnchor {
  const flattened = flattenSelectionBlocks(input.blocks);
  const start = toGlobalOffset(flattened, input.startBlockId, input.startOffset);
  const end = toGlobalOffset(flattened, input.endBlockId, input.endOffset);
  if (start === null || end === null || end <= start) {
    throw new Error("Invalid text selection range");
  }

  const contextLength = input.contextLength ?? 32;
  return {
    version: 1,
    chapterId: input.chapterId,
    startBlockId: input.startBlockId,
    startOffset: input.startOffset,
    endBlockId: input.endBlockId,
    endOffset: input.endOffset,
    exact: flattened.text.slice(start, end),
    prefix: flattened.text.slice(Math.max(0, start - contextLength), start),
    suffix: flattened.text.slice(end, end + contextLength)
  };
}

export function resolveTextSelectionAnchor(
  anchor: TextSelectionAnchor,
  blocks: SelectionTextBlock[]
): ResolvedTextSelection | null {
  const flattened = flattenSelectionBlocks(blocks);
  const directStart = toGlobalOffset(flattened, anchor.startBlockId, anchor.startOffset);
  const directEnd = toGlobalOffset(flattened, anchor.endBlockId, anchor.endOffset);
  if (
    directStart !== null &&
    directEnd !== null &&
    directEnd > directStart &&
    flattened.text.slice(directStart, directEnd) === anchor.exact
  ) {
    return {
      startBlockId: anchor.startBlockId,
      startOffset: anchor.startOffset,
      endBlockId: anchor.endBlockId,
      endOffset: anchor.endOffset,
      exact: anchor.exact
    };
  }

  const candidates: number[] = [];
  let searchFrom = 0;
  while (searchFrom <= flattened.text.length - anchor.exact.length) {
    const index = flattened.text.indexOf(anchor.exact, searchFrom);
    if (index < 0) break;
    candidates.push(index);
    searchFrom = index + Math.max(1, anchor.exact.length);
  }
  if (candidates.length === 0) return null;

  const bestStart = candidates
    .map((index) => ({ index, score: contextScore(flattened.text, index, anchor) }))
    .sort((left, right) => right.score - left.score || left.index - right.index)[0]?.index;
  if (bestStart === undefined) return null;

  const start = fromGlobalOffset(flattened, bestStart);
  const end = fromGlobalOffset(flattened, bestStart + anchor.exact.length);
  if (!start || !end) return null;
  return {
    startBlockId: start.blockId,
    startOffset: start.offset,
    endBlockId: end.blockId,
    endOffset: end.offset,
    exact: anchor.exact
  };
}

function contextScore(text: string, start: number, anchor: TextSelectionAnchor): number {
  const end = start + anchor.exact.length;
  let score = 0;
  const prefix = text.slice(Math.max(0, start - anchor.prefix.length), start);
  const suffix = text.slice(end, end + anchor.suffix.length);
  if (anchor.prefix && prefix === anchor.prefix) score += 2;
  if (anchor.suffix && suffix === anchor.suffix) score += 2;
  score += commonSuffixLength(prefix, anchor.prefix) / Math.max(1, anchor.prefix.length);
  score += commonPrefixLength(suffix, anchor.suffix) / Math.max(1, anchor.suffix.length);
  return score;
}

function commonPrefixLength(left: string, right: string): number {
  const length = Math.min(left.length, right.length);
  let index = 0;
  while (index < length && left[index] === right[index]) index += 1;
  return index;
}

function commonSuffixLength(left: string, right: string): number {
  const length = Math.min(left.length, right.length);
  let index = 0;
  while (
    index < length &&
    left[left.length - index - 1] === right[right.length - index - 1]
  ) {
    index += 1;
  }
  return index;
}

function flattenSelectionBlocks(blocks: SelectionTextBlock[]) {
  const ranges: Array<{ id: string; start: number; end: number }> = [];
  let text = "";
  blocks.forEach((block, index) => {
    if (index > 0) text += BLOCK_SEPARATOR;
    const start = text.length;
    text += block.text;
    ranges.push({ id: block.id, start, end: text.length });
  });
  return { text, ranges };
}

function toGlobalOffset(
  flattened: ReturnType<typeof flattenSelectionBlocks>,
  blockId: string,
  offset: number
): number | null {
  const range = flattened.ranges.find((candidate) => candidate.id === blockId);
  if (!range) return null;
  const length = range.end - range.start;
  if (offset < 0 || offset > length) return null;
  return range.start + offset;
}

function fromGlobalOffset(
  flattened: ReturnType<typeof flattenSelectionBlocks>,
  globalOffset: number
): { blockId: string; offset: number } | null {
  const exactRange = flattened.ranges.find(
    (range) => globalOffset >= range.start && globalOffset <= range.end
  );
  if (exactRange) {
    return { blockId: exactRange.id, offset: globalOffset - exactRange.start };
  }
  const nextRange = flattened.ranges.find((range) => globalOffset < range.start);
  return nextRange ? { blockId: nextRange.id, offset: 0 } : null;
}
