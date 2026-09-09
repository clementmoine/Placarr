/**
 * nikita.jp `nrt` image list — JP Carddass scans, not Bandai USA CCG.
 *
 * Printed keys on the site: N/J/S/I/K = 忍/術/作/依/騎 → disk `ni/te/ta/cl/ki`.
 * Never `n001`. PRN = PR忍, PRS = PR作. Skip Data Carddass.
 *
 * `K` = 騎士 (Temujin, Gelel knights). It used to be skipped as "not a prefix
 * we mint"; cardcheckbox prints the ranges 騎-1〜6 / 騎-7〜8 and the site serves
 * `K-007.jpg`, so it is a real printed number and now has a family.
 */
import { carddasJpVolumeSetCode } from "./parseCarddasJpCardlist";
import { narutoDiskCardId } from "../collectorIdentity";

export const NIKITA_NRT_ORIGIN = "https://tcg-db.nikita.jp";
export const NIKITA_NRT_IMG_PATH = "/cardlist/nrt/?mode=img";
export const NIKITA_NRT_LANG = "ja";

const PREFIX_TO_PRINTED: Record<string, string> = {
  n: "ni",
  j: "te",
  s: "ta",
  i: "cl",
  k: "ki",
  prn: "prni",
  prs: "prta",
};

const FILE_RE = /^(PRN|PRS|N|J|S|I|K)-(\d+)(?:_(\d+))?\.jpg$/i;

const VOLUME_TOKEN =
  /巻ノ(十七|十六|十五|十四|十三|十二|十一|十|九|八|七|六|五|四|参|三|弐|二|壱)/;

export type NikitaNrtCard = {
  number: string;
  nikitaKey: string;
  setCode: string | null;
  variant: number;
  imagePath: string;
};

export function nikitaNrtFaceUrl(imagePath: string): string {
  if (imagePath.startsWith("http")) return imagePath;
  return `${NIKITA_NRT_ORIGIN}${imagePath.startsWith("/") ? "" : "/"}${imagePath}`;
}

/** `N-001.jpg` / `PRN-006` → `ni0001` / `prni0006`. Null for K / NM / EN N. */
export function nikitaNrtFileToDiskId(filename: string): {
  number: string;
  nikitaKey: string;
  variant: number;
} | null {
  const base = filename.split("/").pop() ?? filename;
  const m = FILE_RE.exec(base);
  if (!m) return null;
  const printed = PREFIX_TO_PRINTED[m[1]!.toLowerCase()];
  if (!printed) return null;
  const disk = narutoDiskCardId(`${printed}${m[2]}`);
  if (!disk) return null;
  return {
    number: disk,
    nikitaKey: `${m[1]!.toUpperCase()}-${m[2]}`,
    variant: m[3] ? Number(m[3]) : 0,
  };
}

export function nikitaNrtVolumeSetCode(header: string): string | null {
  const m = VOLUME_TOKEN.exec(header);
  if (!m) return null;
  return carddasJpVolumeSetCode(`巻ノ${m[1]}`);
}

/**
 * Parse `mode=img` HTML. Prefer the unsuffixed JPEG when `_2` / `_3` exist.
 */
export function parseNikitaNrtImgList(html: string): NikitaNrtCard[] {
  const byNumber = new Map<string, NikitaNrtCard>();
  const sections = html.split(/(?=<div[^>]*>巻ノ)/);
  for (const section of sections) {
    const setCode = nikitaNrtVolumeSetCode(section);
    for (const path of section.matchAll(/\/img\/card\/nrt\/([^"'>\s]+)/gi)) {
      const file = path[1]!;
      const parsed = nikitaNrtFileToDiskId(file);
      if (!parsed) continue;
      const imagePath = `/img/card/nrt/${file}`;
      const prev = byNumber.get(parsed.number);
      if (prev && prev.variant <= parsed.variant) continue;
      byNumber.set(parsed.number, {
        number: parsed.number,
        nikitaKey: parsed.nikitaKey,
        setCode,
        variant: parsed.variant,
        imagePath,
      });
    }
  }
  return [...byNumber.values()].sort((a, b) =>
    a.number.localeCompare(b.number),
  );
}
