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

/** Where a stored face came from. Order is the tie-break, best first. */
export const DBS_FACE_SOURCES = ["dbscards", "bandai", "deckplanet"] as const;

export type DbsFaceSource = (typeof DBS_FACE_SOURCES)[number];

export function dbsFaceFilename(source: DbsFaceSource): string {
  return `art.${source}.webp`;
}

/** `art.dbscards.webp` → `dbscards`; anything else → null. */
export function dbsFaceSourceOf(filename: string): DbsFaceSource | null {
  const match = /^art\.([a-z]+)\.webp$/.exec(filename);
  const source = match?.[1];
  return DBS_FACE_SOURCES.includes(source as DbsFaceSource)
    ? (source as DbsFaceSource)
    : null;
}

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
): DbsFaceSource | null {
  /*
    A file we cannot measure is still a face. Dropping it would leave the card
    blank over a metadata hiccup, so unmeasurable candidates fall back to the
    source order rather than out of the running.
  */
  if (faces.length > 0 && faces.every((f) => f.width <= 0 || f.height <= 0)) {
    return [...faces].sort(
      (a, b) =>
        DBS_FACE_SOURCES.indexOf(a.source) - DBS_FACE_SOURCES.indexOf(b.source),
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
      const rank = DBS_FACE_SOURCES.indexOf(face.source);
      const bestRank = DBS_FACE_SOURCES.indexOf(best.source);
      if (rank < bestRank) best = face;
    }
  }
  return best?.source ?? null;
}
