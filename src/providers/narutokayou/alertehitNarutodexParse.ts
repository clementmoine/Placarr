/**
 * Parse Alerte Hit Narutodex (naruto.hitmarket.fr image CDN).
 *
 * @see https://alertehit.fr/narutodex
 */
import {
  kayouHitmarketFileToNumber,
  kayouHitmarketRelativePath,
  kayouNumberToPrinted,
} from "./kayouIdNormalize";
import type { KayouChecklist, KayouChecklistCard } from "./kayouLedgerTypes";

export const ALERTEHIT_NARUTODEX_URL = "https://alertehit.fr/narutodex";
export const ALERTEHIT_HITMARKET_BASE = "https://naruto.hitmarket.fr";
export const ALERTEHIT_NARUTODEX_JS =
  "https://cdn.shopify.com/oxygen-v2/38027/30176/63028/4323301/assets/narutodex-COeXJGXh.js";

export type AlerteHitImageRow = {
  folder: string;
  file: string;
  faceUrl: string;
};

export type AlerteHitImageIndex = {
  source: string;
  url: string;
  observed?: string;
  imageBase: string;
  images: AlerteHitImageRow[];
};

const RARITY_ARRAY_RE = /(\w+)=\[(?:"[^"]+\.webp",?\s*)+\]/g;
const WEBP_RE = /"([^"]+\.webp)"/g;

/** Map minified array vars to CDN folders (order follows bundle `folder:"AR"` blocks). */
export function alertehitFolderByVar(): Readonly<Record<string, string>> {
  return {
    V: "AR",
    D: "BP",
    X: "BR",
    k: "CP",
    Q: "GP",
    z: "HR",
    F: "LR",
    q: "MR",
    J: "NR",
    ee: "OR",
    pe: "PR",
    be: "PTR",
    we: "PU",
    Re: "R",
    oe: "SE",
    Se: "CC",
    ie: "SP",
    ne: "SR",
    te: "SSR",
    le: "SV",
    Ce: "TGR",
    ae: "TR",
    de: "UR",
    se: "ZR",
  };
}

/** Extract `{ var: files[] }` rarity lists from the Hydrogen bundle. */
export function extractAlertehitRarityFiles(js: string): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const match of js.matchAll(RARITY_ARRAY_RE)) {
    const varName = match[1];
    if (!varName) continue;
    const files = [...match[0].matchAll(WEBP_RE)].map((m) => m[1]!);
    if (files.length >= 5 && !files[0]!.includes("/")) {
      out.set(varName, files);
    }
  }
  return out;
}

export function parseAlertehitImages(js: string): AlerteHitImageRow[] {
  const arrays = extractAlertehitRarityFiles(js);
  const folderByVar = alertehitFolderByVar();
  const rows: AlerteHitImageRow[] = [];
  for (const [varName, files] of arrays) {
    const folder = folderByVar[varName as keyof typeof folderByVar];
    if (!folder) continue;
    for (const file of files) {
      if (file.startsWith("Display/")) continue;
      rows.push({
        folder,
        file,
        faceUrl: `${ALERTEHIT_HITMARKET_BASE}/${folder}/${file}`,
      });
    }
  }
  return rows;
}

export function buildAlertehitImageIndex(
  js: string,
  observed = new Date().toISOString().slice(0, 10),
): AlerteHitImageIndex {
  return {
    source: "alertehit.fr/narutodex — hitmarket.fr faces",
    url: ALERTEHIT_NARUTODEX_URL,
    observed,
    imageBase: ALERTEHIT_HITMARKET_BASE,
    images: parseAlertehitImages(js),
  };
}

export function alertehitImageIndexMap(
  index: AlerteHitImageIndex,
): Map<string, string> {
  const out = new Map<string, string>();
  for (const row of index.images) {
    out.set(`${row.folder}/${row.file}`.toUpperCase(), row.faceUrl);
  }
  return out;
}

/** Attach hitmarket URLs to an already merged checklist. */
export function enrichChecklistWithAlertehitFaces(
  ledger: KayouChecklist,
  index: AlerteHitImageIndex,
): KayouChecklist {
  const map = alertehitImageIndexMap(index);
  const sets = ledger.sets.map((set) => ({
    ...set,
    cards: set.cards.map((card) => enrichCardWithAlertehit(card, map)),
  }));
  return { ...ledger, sets };
}

function enrichCardWithAlertehit(
  card: KayouChecklistCard,
  map: Map<string, string>,
): KayouChecklistCard {
  const rel = kayouHitmarketRelativePath(card.printed, card.rarity);
  if (!rel) return card;
  const faceUrl = map.get(rel.toUpperCase());
  if (!faceUrl) return card;
  if (card.faceUrl === faceUrl) return card;
  const alts = new Set(card.faceUrlAlternates ?? []);
  if (card.faceUrl?.trim()) {
    alts.add(card.faceUrl);
    alts.add(faceUrl);
  }
  return {
    ...card,
    faceUrlAlternates: [...alts],
    ...(card.faceUrl ? {} : { faceUrl, faceSource: "alertehit" }),
  };
}

export function buildAlertehitChecklist(js: string): KayouChecklist {
  const images = parseAlertehitImages(js);
  const bySet = new Map<string, KayouChecklistCard[]>();

  for (const row of images) {
    const number = kayouHitmarketFileToNumber(row.file);
    if (!number) continue;
    const setCode = "smritiheavenscrolls1";
    const printed = kayouNumberToPrinted(number);
    const list = bySet.get(setCode) ?? [];
    list.push({
      printed,
      number,
      name: printed,
      rarity: row.folder,
      faceUrl: row.faceUrl,
      faceSource: "alertehit",
    });
    bySet.set(setCode, list);
  }

  return {
    source: "alertehit.fr/narutodex — prefix-only rows",
    url: ALERTEHIT_NARUTODEX_URL,
    sets: [...bySet.entries()].map(([code, cards]) => ({
      slug: `alertehit-${code}`,
      code,
      label: `Alerte Hit — ${code}`,
      url: ALERTEHIT_NARUTODEX_URL,
      cards,
    })),
  };
}
