/**
 * Which stored face a card shows, for any pack that keeps several.
 *
 * Every source that answers is kept as `art.<source>.<ext>`; the displayed
 * face is chosen by core criteria ([`pickBestCatalogueFace`]) — pixels +
 * provenance + filename markers — never by provider-name lists.
 *
 * Language is a hard filter one level up (`cards/<set>/<lang>/`).
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { resolveCoverProvenance } from "@/core/enrich/media/coverProvenance";
import { pickBestCatalogueFace } from "@/core/enrich/media/catalogueFaceRank";

/**
 * Named files a catalogue folder can hold: `art.<source>.<ext>`,
 * `back.<source>.<ext>`, `logo.<source>.<ext>`.
 *
 * Cards use art + back (`back` is also a Leader's awakened side — the app
 * already resolves verso through one mechanism). Sealed SKUs use art + logo
 * in `products/{slug}/{lang}/`. Same ranking, same sidecar.
 */
export const CARD_FACE_ROLES = ["art", "back", "logo"] as const;

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
   * Optional declaration-order for score ties (`tieBreakIds`). Print and
   * sealed faces both rank via [`pickBestCatalogueFace`] only.
   */
  priority?: Readonly<Record<string, readonly S[]>>;
  /**
   * Provenance handed to the scorer when `sourceCoverProvenance` is unset.
   * Publisher scans, not marketplace photos.
   */
  coverProvenance?: string;
  /**
   * Per-source provenance (catalog vs listing_photo). When set, a clean
   * boutique packshot beats a larger seller photo — same tier order as
   * `rankCoversForDisplay`.
   */
  sourceCoverProvenance?: (source: S) => string | null | undefined;
  /**
   * Surface (en pixels) sous laquelle la **taille** tranche seule, sans passer
   * par le score d'affichage (padded thumbs vs real pack photos).
   */
  areaDecidesBelow?: number;
}): CardFaceChoice<S> {
  const { sources } = config;
  const priority = config.priority ?? {};
  const defaultProvenance = config.coverProvenance ?? "catalog";
  const provenanceOf = (source: S): string =>
    resolveCoverProvenance({
      coverProvenance:
        config.sourceCoverProvenance?.(source) ?? defaultProvenance,
    });
  const areaFloor = config.areaDecidesBelow ?? 0;

  /** Locale declaration order → tie-break ids (earlier wins on equal score). */
  const tieBreakForLang = (lang: string): readonly S[] => {
    const list = priority[lang.toLowerCase()];
    if (list?.length) {
      const rest = sources.filter((s) => !list.includes(s));
      return [...list, ...rest];
    }
    return sources;
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
    const picked = pickBestCatalogueFace(
      faces.map((face) => ({
        id: face.source,
        artFile: face.file ?? faceFilename(face.source),
        width: face.width,
        height: face.height,
        coverProvenance: provenanceOf(face.source),
      })),
      {
        areaDecidesBelow: areaFloor,
        tieBreakIds: tieBreakForLang(lang),
      },
    );
    return (picked?.id as S | undefined) ?? null;
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
    let previous = "";
    try {
      previous = readFileSync(file, "utf8");
      current = JSON.parse(previous) as FaceDecision;
    } catch {
      /* first decision for this card */
    }
    const next = serializeFaceDecision({ ...current, [role]: filename });
    /*
      Promote passe sur tout le pack à chaque Sync : réécrire un face.json
      identique ne fait que bouger le mtime (sync cloud = « modifié »).
    */
    if (previous === next) return;
    writeFileSync(file, next, "utf8");
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
