/**
 * Inline story mentions: [[print:<printKey>|<label>]] / [[sealed:<slug>|<label>]].
 * Pure parse — UI resolves thumbs / enlarge separately.
 */

export type StoryMentionKind = "print" | "sealed";

export type StoryMention = {
  kind: StoryMentionKind;
  id: string;
  label: string;
};

export type StoryBodySegment =
  | { type: "text"; value: string }
  | { type: "mention"; mention: StoryMention };

const MENTION_RE =
  /\[\[(print|sealed):([^\]|]+)\|([^\]]+)\]\]/gi;

export function parseStoryMentions(body: string): StoryBodySegment[] {
  const raw = body ?? "";
  if (!raw) return [];
  const segments: StoryBodySegment[] = [];
  let last = 0;
  for (const match of raw.matchAll(MENTION_RE)) {
    const index = match.index ?? 0;
    if (index > last) {
      segments.push({ type: "text", value: raw.slice(last, index) });
    }
    const kind = match[1]!.toLowerCase() as StoryMentionKind;
    const id = match[2]!.trim();
    const label = match[3]!.trim();
    if (id && label && (kind === "print" || kind === "sealed")) {
      segments.push({ type: "mention", mention: { kind, id, label } });
    } else {
      segments.push({ type: "text", value: match[0]! });
    }
    last = index + match[0]!.length;
  }
  if (last < raw.length) {
    segments.push({ type: "text", value: raw.slice(last) });
  }
  return segments.length ? segments : [{ type: "text", value: raw }];
}

/** Plain text for search / a11y (mentions → label only). */
export function storyBodyPlainText(body: string): string {
  return parseStoryMentions(body)
    .map((seg) => (seg.type === "text" ? seg.value : seg.mention.label))
    .join("");
}
