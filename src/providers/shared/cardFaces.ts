/**
 * Which stored face a card shows, for any pack that keeps several.
 *
 * Faces used to be first-hit-wins: the preferred host was asked first and
 * whatever answered got written to `art.webp`. That made the result depend on
 * the weather — a pass run while a source was rate-limiting froze thousands of
 * cards at the smallest available scan, and the only way back was
 * re-downloading everything with `--force`.
 *
 * So every source that answers is kept side by side as `art.<source>.<ext>`, and
 * the displayed face is *chosen* rather than raced for. Adding a source later
 * needs no re-download of the others, and the choice is a pure function that
 * can be re-run offline.
 *
 * The ranking is not ours: `explainAttachmentScoreForDisplay` is what already
 * decides which cover an item shows, and a card face is the same question. It
 * takes plain objects — no Prisma row, no `sharp` — so a catalogue can use it
 * before any item exists.
 *
 * Language is not part of the ranking: it is a hard filter one level up, in the
 * folder (`cards/<set>/<lang>/`). A French print never sees an English
 * candidate, however large it is.
 *
 * Two packs read this — DBS Masters, with three sources, and Fusion World, with
 * two — so the source list and its per-locale tie-break are arguments.
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { explainAttachmentScoreForDisplay } from "@/core/enrich/media/attachmentDisplayScoring";

/**
 * The two sides a print can hold.
 *
 * `back` on purpose, not a separate `awakened` notion: the app already resolves
 * a card's verso through one mechanism — pack default, per set, per print (see
 * `resolveCardBackCandidates`) — and a Leader's awakened side is exactly that,
 * the back of this print. A parallel concept would have been a second way to
 * say the same thing.
 */
export const CARD_FACE_ROLES = ["art", "back"] as const;

export type CardFaceRole = (typeof CARD_FACE_ROLES)[number];

/**
 * Where the chosen face is recorded, next to the sources it chose between.
 *
 * The winner used to be *copied* to `art.webp`, which duplicated a file we
 * already held and made `art.webp` lie: it looked like the card's face while
 * being a stale snapshot of a decision taken at download time. Recording the
 * name instead means nothing is duplicated, the decision is re-readable, and
 * adding a source rewrites one small file rather than a picture.
 *
 * Not frozen either: the faces pass re-runs the ranking for every card it
 * walks, downloaded or not, so a change of policy takes one pass and no
 * re-download.
 *
 * A sidecar rather than a symlink on purpose — links do not survive the copies
 * and archives this data goes through.
 */
export const CARD_FACE_DECISION_FILE = "face.json";

/** One filename per role that has a winner. */
export type FaceDecision = Partial<Record<CardFaceRole, string>>;

export type StoredFace<S extends string> = {
  source: S;
  /** The file as it sits on disk, extension included. */
  file?: string;
  width: number;
  height: number;
};

export type CardFaceChoice<S extends string> = {
  sources: readonly S[];
  faceFilename: (source: S, role?: CardFaceRole, ext?: string) => string;
  faceFileOf: (
    filename: string,
  ) => { role: CardFaceRole; source: S; ext: string } | null;
  faceSourceOf: (filename: string) => S | null;
  pickBestFace: (faces: readonly StoredFace<S>[], lang?: string) => S | null;
  parseFaceDecision: (json: string, role?: CardFaceRole) => string | null;
  serializeFaceDecision: (decision: FaceDecision) => string;
  recordFaceDecision: (
    cardDir: string,
    role: CardFaceRole,
    filename: string,
  ) => void;
};

export function createCardFaceChoice<S extends string>(config: {
  /** Every source a stored face can come from. */
  sources: readonly S[];
  /**
   * Preferred order per locale, best first — the tie-break, not the rule.
   *
   * Deliberately *not* dominating size, because with today's sources it could
   * only make things worse. It earns its keep the day a source is better
   * without being bigger: a scan without the SAMPLE watermark every other
   * source carries, say. That is the rule this list is here to hold.
   */
  priority: Readonly<Record<string, readonly S[]>>;
  /**
   * Provenance handed to the scorer. Publisher scans, not marketplace photos.
   */
  coverProvenance?: string;
}): CardFaceChoice<S> {
  const { sources, priority } = config;
  const provenance = config.coverProvenance ?? "catalog";

  /** Rank within a locale; unlisted sources sort last, in declaration order. */
  const priorityOf = (source: S, lang: string): number => {
    const list = priority[lang.toLowerCase()];
    const rank = list?.indexOf(source) ?? -1;
    return rank >= 0 ? rank : sources.length + sources.indexOf(source);
  };

  /*
    `<role>.<source>.<ext>` — the extension is part of the name, not a constant.

    Writing `.webp` into the convention baked one pack's ingest policy into the
    shared contract: DBS re-encodes every source to WebP, but Lorcana and Naruto
    hold `.jpg` as it came, and a source that only serves PNG or GIF would have
    had to be re-encoded — a permanent loss — purely to satisfy a filename.
    Keeping the format the source gave also keeps the bytes comparable to it.
  */
  const faceFilename = (
    source: S,
    role: CardFaceRole = "art",
    ext = "webp",
  ): string => `${role}.${source}.${ext.replace(/^\./, "").toLowerCase()}`;

  const faceFileOf = (
    filename: string,
  ): { role: CardFaceRole; source: S; ext: string } | null => {
    const match = /^([a-z]+)\.([a-z0-9-]+)\.([a-z0-9]+)$/i.exec(filename);
    const role = match?.[1]?.toLowerCase() as CardFaceRole | undefined;
    const source = match?.[2]?.toLowerCase() as S | undefined;
    const ext = match?.[3]?.toLowerCase();
    if (!role || !source || !ext) return null;
    if (!CARD_FACE_ROLES.includes(role)) return null;
    if (!sources.includes(source)) return null;
    return { role, source, ext };
  };

  const faceSourceOf = (filename: string): S | null => {
    const parsed = faceFileOf(filename);
    return parsed?.role === "art" ? parsed.source : null;
  };

  const pickBestFace = (
    faces: readonly StoredFace<S>[],
    lang = "fr",
  ): S | null => {
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
    let best: { face: StoredFace<S>; score: number } | null = null;
    for (const face of faces) {
      if (face.width <= 0 || face.height <= 0) continue;
      const score = explainAttachmentScoreForDisplay(
        {
          type: "cover",
          url: `${face.source}/${face.file ?? faceFilename(face.source)}`,
          source: face.source,
          coverProvenance: provenance,
        },
        { width: face.width, height: face.height },
      ).score;
      if (!best || score > best.score) {
        best = { face, score };
        continue;
      }
      if (score === best.score) {
        if (
          priorityOf(face.source, lang) < priorityOf(best.face.source, lang)
        ) {
          best = { face, score };
        }
      }
    }
    return best?.face.source ?? null;
  };

  /** The filename recorded for a role, or null when it says nothing usable. */
  const parseFaceDecision = (
    json: string,
    role: CardFaceRole = "art",
  ): string | null => {
    try {
      const raw = JSON.parse(json) as FaceDecision;
      const named = raw?.[role]?.trim();
      // Must name a file we recognise for that role: a stale entry pointing at
      // a deleted file would otherwise send the router at nothing.
      if (!named) return null;
      return faceFileOf(named)?.role === role ? named : null;
    } catch {
      return null;
    }
  };

  const serializeFaceDecision = (decision: FaceDecision): string =>
    `${JSON.stringify(decision, null, 2)}\n`;

  /**
   * Record the winner for one role, keeping whatever the other role had.
   *
   * Read-modify-write because the two roles are decided at different moments —
   * a local clone can settle the awakened side while the faces pass settles the
   * front over HTTP — and neither should erase the other's answer.
   */
  const recordFaceDecision = (
    cardDir: string,
    role: CardFaceRole,
    filename: string,
  ): void => {
    const file = path.join(cardDir, CARD_FACE_DECISION_FILE);
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
  };

  return {
    sources,
    faceFilename,
    faceFileOf,
    faceSourceOf,
    pickBestFace,
    parseFaceDecision,
    serializeFaceDecision,
    recordFaceDecision,
  };
}
