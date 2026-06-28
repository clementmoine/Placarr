const PLAIN_NUMBERED_LINE = /^(\d+)\s+(.+)$/;
const DOT_NUMBERED_LINE = /^(\d+)\.\s*(.+)$/;
const BULLET_NUMBERED_LINE = /^[-–•*]\s*(\d+)\s+(.+)$/;
const MAX_INLINE_LIST_ITEMS = 200;

function parseNumberedLine(line: string): { num: number; text: string } | null {
  const trimmed = line.trim();
  if (!trimmed) return null;

  for (const pattern of [
    PLAIN_NUMBERED_LINE,
    DOT_NUMBERED_LINE,
    BULLET_NUMBERED_LINE,
  ]) {
    const match = trimmed.match(pattern);
    if (!match) continue;

    const num = Number.parseInt(match[1], 10);
    const text = match[2].trim();
    if (!Number.isFinite(num) || num <= 0 || !text) return null;

    return { num, text };
  }

  return null;
}

/**
 * Parses compact Booknode-style lists where every entry sits on one line:
 * `1 Story A 2 Story B 3 Story C`
 *
 * Markers are only accepted when they continue a 1..N sequence, so incidental
 * digits inside a title (e.g. "Mythologia V") are ignored.
 */
export function parseInlineNumberedList(
  line: string,
): Array<{ num: number; text: string }> | null {
  const trimmed = line.trim();
  if (!/^1\s+/.test(trimmed)) return null;

  const items: Array<{ num: number; text: string }> = [];
  let contentStart = /^1\s+/.exec(trimmed)![0].length;
  let expected = 1;

  while (expected <= MAX_INLINE_LIST_ITEMS) {
    const rest = trimmed.slice(contentStart);
    const nextMarker = new RegExp(`\\s+${expected + 1}\\s+`);
    const nextMatch = rest.match(nextMarker);

    const text = (nextMatch ? rest.slice(0, nextMatch.index) : rest).trim();
    if (!text) return null;

    items.push({ num: expected, text });

    if (!nextMatch) break;

    contentStart += nextMatch.index! + nextMatch[0].length;
    expected += 1;
  }

  return items.length >= 2 ? items : null;
}

/**
 * Finds a compact 1..N list embedded after a heading, e.g.
 * `Histoires contenues : 1 Story A 2 Story B`
 */
function findEmbeddedInlineNumberedList(
  line: string,
): { prefix: string; items: Array<{ num: number; text: string }> } | null {
  const marker = /(?:^|\s)1\s+/g;
  let match: RegExpExecArray | null;
  let best: { prefix: string; items: Array<{ num: number; text: string }> } | null =
    null;

  while ((match = marker.exec(line)) !== null) {
    const oneIndex = match.index + (line[match.index] === " " ? 1 : 0);
    const items = parseInlineNumberedList(line.slice(oneIndex).trimStart());
    if (!items) continue;

    if (!best || items.length > best.items.length) {
      best = { prefix: line.slice(0, oneIndex).trim(), items };
    }
  }

  return best;
}

/**
 * Parses Bédéthèque-style inline lists:
 * `… histoire n°1: foo histoire n°2: bar`
 */
function parseHistoireNumberedList(
  text: string,
): { prefix: string; items: Array<{ num: number; text: string }> } | null {
  const marker = /\bhistoire\s+n°(\d+)\s*:/gi;
  const matches = [...text.matchAll(marker)];
  if (matches.length < 2) return null;

  const items: Array<{ num: number; text: string }> = [];
  for (let index = 0; index < matches.length; index += 1) {
    const match = matches[index];
    const num = Number.parseInt(match[1], 10);
    if (num !== index + 1) return null;

    const textStart = match.index! + match[0].length;
    const textEnd =
      index + 1 < matches.length ? matches[index + 1].index! : text.length;
    const itemText = text.slice(textStart, textEnd).trim();
    if (!itemText) return null;

    items.push({ num, text: itemText });
  }

  const prefix = text.slice(0, matches[0].index!).trim();
  return items.length >= 2 ? { prefix, items } : null;
}

function parseDashSeparatedDescriptionList(
  line: string,
): { prefix: string; items: string[] } | null {
  const trimmed = line.trim();
  const headerMatch = trimmed.match(/^(.+?:)\s*-\s+(.+)$/);
  if (!headerMatch) return null;

  const items = headerMatch[2]
    .split(/\s-\s+/)
    .map((item) => item.trim())
    .filter(Boolean);

  if (items.length < 2) return null;

  return { prefix: headerMatch[1].trim(), items };
}

function emitDashBlock(
  out: string[],
  prefix: string,
  items: string[],
): void {
  out.push(prefix);
  out.push("");
  for (const item of items) {
    out.push(`- ${item}`);
  }
}

function formatNumberedListItems(
  items: Array<{ num: number; text: string }>,
): string[] {
  return items.map((item) => `${item.num}. ${item.text}`);
}

function emitNumberedBlock(
  out: string[],
  prefix: string | undefined,
  items: Array<{ num: number; text: string }>,
): void {
  if (prefix) {
    out.push(prefix);
    out.push("");
  }
  out.push(...formatNumberedListItems(items));
}

function tryMultilineNumberedSequence(
  lines: string[],
  startIndex: number,
): { items: Array<{ num: number; text: string }>; nextIndex: number } | null {
  const first = parseNumberedLine(lines[startIndex]);
  if (!first || first.num !== 1) return null;

  const sequence = [first];
  let cursor = startIndex + 1;
  let expected = 2;
  let aborted = false;

  while (cursor < lines.length) {
    const nextLine = lines[cursor];
    if (nextLine.trim() === "") {
      cursor += 1;
      continue;
    }

    const next = parseNumberedLine(nextLine);
    if (!next || next.num !== expected) {
      if (next && next.num !== expected) aborted = true;
      break;
    }

    sequence.push(next);
    expected += 1;
    cursor += 1;
  }

  if (aborted || sequence.length < 2) return null;

  return { items: sequence, nextIndex: cursor };
}

function tryPrefixedMultilineNumberedSequence(
  lines: string[],
  startIndex: number,
): {
  prefix: string;
  items: Array<{ num: number; text: string }>;
  nextIndex: number;
} | null {
  const trimmed = lines[startIndex]?.trim();
  const headerMatch = trimmed.match(/^(.+?:)\s*(.+)$/);
  if (!headerMatch) return null;

  const first = parseNumberedLine(headerMatch[2].trim());
  if (!first || first.num !== 1) return null;

  const sequence = [first];
  let cursor = startIndex + 1;
  let expected = 2;
  let aborted = false;

  while (cursor < lines.length) {
    const nextLine = lines[cursor];
    if (nextLine.trim() === "") {
      cursor += 1;
      continue;
    }

    const next = parseNumberedLine(nextLine);
    if (!next || next.num !== expected) {
      if (next && next.num !== expected) aborted = true;
      break;
    }

    sequence.push(next);
    expected += 1;
    cursor += 1;
  }

  if (aborted || sequence.length < 2) return null;

  return {
    prefix: headerMatch[1].trim(),
    items: sequence,
    nextIndex: cursor,
  };
}

function trySpecialNumberedLine(
  line: string,
): { prefix?: string; items: Array<{ num: number; text: string }> } | null {
  const inline = parseInlineNumberedList(line);
  if (inline) return { items: inline };

  const embedded = findEmbeddedInlineNumberedList(line);
  if (embedded) {
    return { prefix: embedded.prefix || undefined, items: embedded.items };
  }

  const histoire = parseHistoireNumberedList(line);
  if (histoire) {
    return { prefix: histoire.prefix || undefined, items: histoire.items };
  }

  return null;
}

/**
 * Turns plain-text story lists into markdown ordered lists when numbering
 * starts at 1 and stays contiguous — one item per line or inline on one line.
 */
export function normalizeNumberedDescriptionLists(text: string): string {
  const lines = text.split("\n");
  const out: string[] = [];
  let index = 0;

  while (index < lines.length) {
    const prefixed = tryPrefixedMultilineNumberedSequence(lines, index);
    if (prefixed) {
      emitNumberedBlock(out, prefixed.prefix, prefixed.items);
      index = prefixed.nextIndex;
      continue;
    }

    const multiline = tryMultilineNumberedSequence(lines, index);
    if (multiline) {
      out.push(...formatNumberedListItems(multiline.items));
      index = multiline.nextIndex;
      continue;
    }

    const special = trySpecialNumberedLine(lines[index]);
    if (special) {
      emitNumberedBlock(out, special.prefix, special.items);
      index += 1;
      continue;
    }

    const dash = parseDashSeparatedDescriptionList(lines[index]);
    if (dash) {
      emitDashBlock(out, dash.prefix, dash.items);
      index += 1;
      continue;
    }

    out.push(lines[index]);
    index += 1;
  }

  return out.join("\n");
}

export function prepareDescriptionMarkdown(description: string): string {
  return normalizeNumberedDescriptionLists(
    description.replace(/\r\n/g, "\n").trim(),
  )
    .replace(/^(#{1,6})([^\s#])/gm, "$1 $2")
    .trim();
}
