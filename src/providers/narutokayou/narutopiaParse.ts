/**
 * Narutopia Kayou / Heritage checklist pages → face index + enrich.
 */
import {
  canonicalizeKayouNumber,
  kayouPrintedToNumber,
} from "./kayouIdNormalize";
import type { KayouChecklist, KayouChecklistCard } from "./kayouLedgerTypes";
import type { NarutopiaChecklistEntry } from "@/providers/shared/narutopia/parseChecklistPage";

export type NarutopiaKayouImageRow = {
  page: string;
  code: string;
  name: string | null;
  faceUrl: string;
  heading: string;
};

export type NarutopiaKayouImageIndex = {
  source: string;
  observed: string;
  pages: string[];
  images: NarutopiaKayouImageRow[];
};

/** Hub + rarity pages the user listed (Kayou + Heritage). */
export const NARUTOPIA_KAYOU_PAGE_URLS: readonly string[] = [
  "https://narutopia.fr/br-naruto-kayou/",
  "https://narutopia.fr/lr-naruto-kayou/",
  "https://narutopia.fr/sv-naruto-kayou/",
  "https://narutopia.fr/carte-20th-anniversaire/",
  "https://narutopia.fr/scr-naruto-kayou/",
  "https://narutopia.fr/cartes-asp-naruto-kayou/",
  "https://narutopia.fr/se-naruto-kayou/",
  "https://narutopia.fr/bp-naruto-kayou/",
  "https://narutopia.fr/gp-naruto-kayou/",
  "https://narutopia.fr/cr-naruto-kayou/",
  "https://narutopia.fr/nr-naruto-kayou/",
  "https://narutopia.fr/mr-naruto-kayou/",
  "https://narutopia.fr/sp-naruto-kayou/",
  "https://narutopia.fr/cartes-pu-naruto-kayou/",
  "https://narutopia.fr/or-naruto-kayou/",
  "https://narutopia.fr/slr-naruto-kayou/",
  "https://narutopia.fr/cp-naruto-kayou/",
  "https://narutopia.fr/ar-naruto-kayou/",
  "https://narutopia.fr/zr-naruto-kayou/",
  "https://narutopia.fr/ur-naruto-kayou/",
  "https://narutopia.fr/tr-tgr-naruto-kayou/",
  "https://narutopia.fr/hr-naruto-kayou/",
  "https://narutopia.fr/cartes-ptr-naruto-kayou/",
  "https://narutopia.fr/ssr-naruto-kayou/",
  "https://narutopia.fr/sr-naruto-kayou/",
  "https://narutopia.fr/r-naruto-kayou/",
  "https://narutopia.fr/cartes-r-naruto-heritage-age-ninja/",
  "https://narutopia.fr/cartes-sr-naruto-heritage-age-ninja/",
  "https://narutopia.fr/cartes-ssr-naruto-heritage-age-ninja/",
  "https://narutopia.fr/cartes-ptr-naruto-heritage-age-ninja/",
  "https://narutopia.fr/cartes-ur-naruto-heritage-age-ninja/",
  "https://narutopia.fr/cartes-sp-naruto-heritage-age-ninja/",
  "https://narutopia.fr/cartes-mr-naruto-heritage-age-ninja/",
  "https://narutopia.fr/cartes-xr-naruto-heritage-age-ninja/",
  "https://narutopia.fr/cartes-qr-naruto-heritage-age-ninja/",
  "https://narutopia.fr/cartes-pr-naruto-heritage-age-ninja/",
];

export function narutopiaKayouLookupKeys(code: string): string[] {
  const cleaned = code.trim().toUpperCase().replace(/\s+/g, "");
  if (!cleaned) return [];
  const keys = new Set<string>([cleaned]);
  const number = kayouPrintedToNumber(cleaned);
  if (number) keys.add(canonicalizeKayouNumber(number));
  // SSR-001 → NR-SSR-001 (narutocards printed form)
  if (/^[A-Z]+-\d+[A-Z]?$/i.test(cleaned) && !cleaned.startsWith("NR")) {
    keys.add(`NR-${cleaned}`);
    const withNr = kayouPrintedToNumber(`NR-${cleaned}`);
    if (withNr) keys.add(canonicalizeKayouNumber(withNr));
  }
  // CC-R-2 → NRCC-R-002-ish
  if (cleaned.startsWith("CC-")) {
    keys.add(cleaned.replace(/^CC-/, "NRCC-"));
  }
  return [...keys];
}

export function buildNarutopiaKayouImageIndex(
  pages: readonly { url: string; entries: NarutopiaChecklistEntry[] }[],
  observed = new Date().toISOString().slice(0, 10),
): NarutopiaKayouImageIndex {
  const images: NarutopiaKayouImageRow[] = [];
  const seen = new Set<string>();
  for (const page of pages) {
    for (const entry of page.entries) {
      const code = entry.code?.trim();
      const faceUrl = entry.faceUrl?.trim();
      if (!code || !faceUrl) continue;
      const key = `${code.toUpperCase()}|${faceUrl}`;
      if (seen.has(key)) continue;
      seen.add(key);
      images.push({
        page: page.url,
        code,
        name: entry.name,
        faceUrl,
        heading: entry.heading,
      });
    }
  }
  return {
    source: "narutopia.fr Kayou / Héritage checklists",
    observed,
    pages: pages.map((p) => p.url),
    images,
  };
}

function indexByLookupKey(
  index: NarutopiaKayouImageIndex,
): Map<string, NarutopiaKayouImageRow> {
  const out = new Map<string, NarutopiaKayouImageRow>();
  for (const row of index.images) {
    for (const key of narutopiaKayouLookupKeys(row.code)) {
      if (!out.has(key)) out.set(key, row);
    }
  }
  return out;
}

function cardLookupKeys(card: KayouChecklistCard): string[] {
  const keys = new Set<string>();
  for (const k of narutopiaKayouLookupKeys(card.printed)) keys.add(k);
  keys.add(canonicalizeKayouNumber(card.number));
  return [...keys];
}

export function enrichChecklistWithNarutopiaFaces(
  ledger: KayouChecklist,
  index: NarutopiaKayouImageIndex,
): KayouChecklist {
  const map = indexByLookupKey(index);
  const sets = ledger.sets.map((set) => ({
    ...set,
    cards: set.cards.map((card) => {
      let hit: NarutopiaKayouImageRow | undefined;
      for (const key of cardLookupKeys(card)) {
        hit = map.get(key);
        if (hit) break;
      }
      if (!hit) return card;
      if (card.faceUrl === hit.faceUrl) return card;
      const alts = new Set(card.faceUrlAlternates ?? []);
      if (card.faceUrl?.trim()) {
        alts.add(card.faceUrl);
        alts.add(hit.faceUrl);
      }
      return {
        ...card,
        faceUrlAlternates: [...alts],
        ...(card.faceUrl
          ? {}
          : { faceUrl: hit.faceUrl, faceSource: "narutopia" }),
      };
    }),
  }));
  return { ...ledger, sets };
}
