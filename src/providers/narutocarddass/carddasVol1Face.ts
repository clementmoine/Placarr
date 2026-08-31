/**
 * Official JP Carddass 巻ノ… vol.1 face GIFs (`shinobi-003_1.gif`, …).
 * Pure — no I/O.
 */
import { carddasJpCardlistCards } from "./parse/parseCarddasJpCardlist";

const PRINTED_TO_KIND: Record<string, string> = {
  忍: "shinobi",
  術: "jutsu",
  作: "saku",
  依: "irai",
};

/** `maki7` → 7. */
export function carddasJpVolumeNumberFromSetCode(
  setCode: string,
): number | null {
  const m = /^maki(\d{1,2})$/i.exec(setCode.trim());
  if (!m) return null;
  const n = Number.parseInt(m[1]!, 10);
  return Number.isFinite(n) && n >= 1 && n <= 17 ? n : null;
}

/** `忍-146` + 巻ノ七 → `shinobi-146_7`. */
export function carddasJpVolumeFaceStem(
  printed: string,
  volume: number,
): string | null {
  const m = /^(忍|術|作|依)-(\d+)$/.exec(printed.trim());
  if (!m) return null;
  const kind = PRINTED_TO_KIND[m[1]!];
  if (!kind) return null;
  const n = Number.parseInt(m[2]!, 10);
  if (!Number.isFinite(n) || n < 1) return null;
  if (!Number.isFinite(volume) || volume < 1 || volume > 17) return null;
  return `${kind}-${String(n).padStart(3, "0")}_${volume}`;
}

/** `忍-3` → `shinobi-003_1`. */
export function carddasJpVol1FaceStem(printed: string): string | null {
  return carddasJpVolumeFaceStem(printed, 1);
}

/** Candidate live URLs (Wayback originals). */
export function carddasJpVol1FaceOriginalUrls(stem: string): string[] {
  const file = `${stem}.gif`;
  return [
    `http://www.carddas.com/naruto/cardlist/card_img/${file}`,
    `http://www.carddass.com/naruto/cardlist/card_img/${file}`,
    `http://www.carddas.com/cgi-bin/naruto/view_naruto.cgi?/${stem}.gif`,
  ];
}

export function carddasJpVolumeFaceOriginalUrls(stem: string): string[] {
  const bare = stem.replace(/_\d{1,2}$/, "");
  return [
    ...carddasJpVol1FaceOriginalUrls(stem),
    `http://www.carddas.com/naruto/card/${bare}.gif`,
    `http://www.carddass.com/naruto/card/${bare}.gif`,
  ];
}

/** Snapshots that retained 1st.shtml viewer HTML (GIF body often still 404). */
export const CARDDAS_JP_VOL1_WAYBACK_TIMESTAMPS = [
  "20071224051112",
  "20071016145510",
  "20160506074951",
] as const;

export function waybackImageUrl(timestamp: string, original: string): string {
  const ts = timestamp.replace(/\D/g, "");
  return `https://web.archive.org/web/${ts}im_/${original}`;
}

export type CarddasJpVol1FaceTarget = {
  printed: string;
  number: string;
  stem: string;
  original: string;
};

/** All 巻ノ壱 checklist rows that map to a vol.1 GIF stem. */
export function carddasJpVol1FaceTargets(
  setCode = "maki1",
): CarddasJpVol1FaceTarget[] {
  return carddasJpVolumeFaceTargets(setCode);
}

/** Checklist rows for one 巻ノ… (or every volume when `setCode` is omitted). */
export function carddasJpVolumeFaceTargets(
  setCode?: string,
): CarddasJpVol1FaceTarget[] {
  const out: CarddasJpVol1FaceTarget[] = [];
  for (const row of carddasJpCardlistCards()) {
    if (setCode && row.setCode !== setCode) continue;
    const volume = carddasJpVolumeNumberFromSetCode(row.setCode);
    if (!volume) continue;
    const stem = carddasJpVolumeFaceStem(row.printed, volume);
    if (!stem) continue;
    out.push({
      printed: row.printed,
      number: row.number,
      stem,
      original: carddasJpVolumeFaceOriginalUrls(stem)[0]!,
    });
  }
  return out;
}
