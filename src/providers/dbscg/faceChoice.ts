import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

/**
 * Which stored face a print shows.
 *
 * Faces used to be first-hit-wins: the preferred host was asked first and
 * whatever answered got written to `art.webp`. That made the result depend on
 * the weather — a pass run while dbscards was rate-limiting froze thousands of
 * cards at Bandai's 260x363, and the only way back was re-downloading
 * everything with `--force`.
 *
 * So every source that answers is kept, side by side, as `art.<source>.webp`,
 * and the displayed face is *chosen* rather than raced for. Adding a source
 * later needs no re-download of the others, and the choice is a pure function
 * that can be re-run offline.
 *
 * Language is not part of the ranking: it is a hard filter one level up, in
 * the folder (`cards/<set>/<lang>/`). A French print never sees an English
 * candidate, however large it is.
 */

/** Every source a stored face can come from. */
export const DBS_FACE_SOURCES = ["dbscards", "bandai", "deckplanet"] as const;

/**
 * Preferred order per locale, best first — the tie-break, not the rule.
 *
 * Deliberately *not* dominating size, because with today's sources it could
 * only make things worse. Measured: Deckplanet serves 260x363 on the older
 * English sets and 860x1205 on the recent ones, while dbscards is a steady
 * 400x560. An English list headed by Deckplanet would therefore lose on the
 * old sets. Size-first already picks correctly everywhere — dbscards in
 * French, dbscards on old English, Deckplanet on recent English.
 *
 * It earns its keep the day a source is better without being bigger: the Fnac
 * scans are 500x680 *without* the SAMPLE watermark every other source carries.
 * That is the rule this list is here to hold when it comes.
 */
export const DBS_FACE_PRIORITY: Record<string, readonly DbsFaceSource[]> = {
  // Deckplanet mirrors no French printing at all.
  fr: ["dbscards", "bandai"],
  en: ["deckplanet", "dbscards", "bandai"],
};

/** Rank within a locale; unlisted sources sort last, in declaration order. */
function priorityOf(source: DbsFaceSource, lang: string): number {
  const list = DBS_FACE_PRIORITY[lang.toLowerCase()];
  const rank = list?.indexOf(source) ?? -1;
  return rank >= 0
    ? rank
    : DBS_FACE_SOURCES.length + DBS_FACE_SOURCES.indexOf(source);
}

export type DbsFaceSource = (typeof DBS_FACE_SOURCES)[number];

/**
 * The two sides a print can hold.
 *
 * `back` on purpose, not a separate `awakened` notion: the app already resolves
 * a card's verso through one mechanism — pack default, per set, per print (see
 * `resolveCardBackCandidates`) — and a Leader's awakened side is exactly that,
 * the back of this print. A parallel concept would have been a second way to
 * say the same thing.
 */
export const DBS_FACE_ROLES = ["art", "back"] as const;

export type DbsFaceRole = (typeof DBS_FACE_ROLES)[number];

export function dbsFaceFilename(
  source: DbsFaceSource,
  role: DbsFaceRole = "art",
): string {
  return `${role}.${source}.webp`;
}

/** `art.dbscards.webp` → `{art, dbscards}`; anything else → null. */
export function dbsFaceFileOf(
  filename: string,
): { role: DbsFaceRole; source: DbsFaceSource } | null {
  const match = /^([a-z]+)\.([a-z]+)\.webp$/.exec(filename);
  const role = match?.[1] as DbsFaceRole | undefined;
  const source = match?.[2] as DbsFaceSource | undefined;
  if (!role || !source) return null;
  if (!DBS_FACE_ROLES.includes(role)) return null;
  if (!DBS_FACE_SOURCES.includes(source)) return null;
  return { role, source };
}

/** The source of a front face, or null when it is not one. */
export function dbsFaceSourceOf(filename: string): DbsFaceSource | null {
  const parsed = dbsFaceFileOf(filename);
  return parsed?.role === "art" ? parsed.source : null;
}

/**
 * Where the chosen face is recorded, next to the sources it chose between.
 *
 * The winner used to be *copied* to `art.webp`, which duplicated a file we
 * already held and made `art.webp` lie: it looked like the card's face while
 * being a stale snapshot of a decision taken at download time. Recording the
 * name instead means nothing is duplicated, the decision is re-readable, and
 * adding a source rewrites one small file rather than a picture.
 *
 * A sidecar rather than a symlink on purpose — links do not survive the copies
 * and archives this data goes through.
 */
export const DBS_FACE_DECISION_FILE = "face.json";

/** One filename per role that has a winner. */
export type FaceDecision = Partial<Record<DbsFaceRole, string>>;

export type StoredFace = {
  source: DbsFaceSource;
  width: number;
  height: number;
};

/**
 * The best of what we hold: most pixels wins.
 *
 * Resolution rather than a fixed source order, because no source is best
 * everywhere — dbscards carries 400x560 across the corpus, but Deckplanet
 * reaches 860x1205 on the recent English sets, and Bandai is the only one that
 * covers some prints at all. Source order only settles a tie.
 */
export function pickBestFace(
  faces: readonly StoredFace[],
  lang = "fr",
): DbsFaceSource | null {
  /*
    A file we cannot measure is still a face. Dropping it would leave the card
    blank over a metadata hiccup, so unmeasurable candidates fall back to the
    source order rather than out of the running.
  */
  if (faces.length > 0 && faces.every((f) => f.width <= 0 || f.height <= 0)) {
    return [...faces].sort(
      (a, b) => priorityOf(a.source, lang) - priorityOf(b.source, lang),
    )[0]!.source;
  }
  let best: StoredFace | null = null;
  for (const face of faces) {
    if (face.width <= 0 || face.height <= 0) continue;
    if (!best) {
      best = face;
      continue;
    }
    const area = face.width * face.height;
    const bestArea = best.width * best.height;
    if (area > bestArea) {
      best = face;
    } else if (area === bestArea) {
      const rank = priorityOf(face.source, lang);
      const bestRank = priorityOf(best.source, lang);
      if (rank < bestRank) best = face;
    }
  }
  return best?.source ?? null;
}

/** The filename recorded for a role, or null when it says nothing usable. */
export function parseFaceDecision(
  json: string,
  role: DbsFaceRole = "art",
): string | null {
  try {
    const raw = JSON.parse(json) as FaceDecision;
    const named = raw?.[role]?.trim();
    // Must name a file we recognise for that role: a stale entry pointing at a
    // deleted file would otherwise send the router at nothing.
    if (!named) return null;
    return dbsFaceFileOf(named)?.role === role ? named : null;
  } catch {
    return null;
  }
}

/** What to write once the ranking has spoken, keeping the other role's answer. */
export function serializeFaceDecision(decision: FaceDecision): string {
  return `${JSON.stringify(decision, null, 2)}\n`;
}

/**
 * Record the winner for one role, keeping whatever the other role had.
 *
 * Read-modify-write because the two roles are decided at different moments —
 * `arena` settles the awakened side from a local clone, the faces pass settles
 * the front over HTTP — and neither should erase the other's answer.
 */
export function recordFaceDecision(
  cardDir: string,
  role: DbsFaceRole,
  filename: string,
): void {
  const file = path.join(cardDir, DBS_FACE_DECISION_FILE);
  let current: FaceDecision = {};
  try {
    current = JSON.parse(readFileSync(file, "utf8")) as FaceDecision;
  } catch {
    /* first decision for this card */
  }
  writeFileSync(
    file,
    serializeFaceDecision({ ...current, [role]: filename }),
    "utf8",
  );
}
