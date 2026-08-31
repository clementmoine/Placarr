/**
 * Coleka listings for French Carddass S1–S5 (leaves under `_r41705`).
 *
 * Parent `_r41705` (~741) and umbrella `_r4102` stay unscraped. Faces come
 * from `thumbs.coleka.com`. Coleka names a series after one starter — that
 * is a collector label, not Bandai's. Disk ids stay `ni/te/ta/cl` in
 * `cards/{family}/{ni0001}/fr/`. Do not write these into `cards/s6/`.
 */
import coleka from "../curated/sources/coleka.json";
import {
  colekaCarddassPrefixToCollector,
  colekaS6ItNameIsPlaceholder,
  type ColekaS6ItCardType,
} from "./parseColekaS6It";
import { COLEKA_ORIGIN, colekaFullFaceUrl } from "./parseColekaStorm3";

export const COLEKA_CARDDASS_FR_LANG = "fr";

export type ColekaCarddassFrSeriesCode = "s1" | "s2" | "s3" | "s4" | "s5";

export type ColekaCarddassFrSeries = {
  set: ColekaCarddassFrSeriesCode;
  rubrique: string;
  path: string;
  listedCount: number;
};

export type ColekaCarddassFrCard = {
  number: string;
  cardType: ColekaS6ItCardType;
  set: ColekaCarddassFrSeriesCode;
  colekaRef: string;
  name: string | null;
  colekaId: string;
  pagePath: string;
  thumbUrl: string | null;
  faceUrl: string | null;
};

const SERIES_PATH: Record<ColekaCarddassFrSeriesCode, string> = {
  s1: new URL(coleka.branches["serie-01"]).pathname,
  s2: "/fr/cartes-de-collection/cartes-anime-manga/naruto-cartes-a-jouer-et-a-collectionner/naruto-carddass-series-francaises/cartes-naruto-serie-02-detruire-konoha_r4109",
  s3: "/fr/cartes-de-collection/cartes-anime-manga/naruto-cartes-a-jouer-et-a-collectionner/naruto-carddass-series-francaises/cartes-naruto-serie-03-puissances-cachees_r4110",
  s4: "/fr/cartes-de-collection/cartes-anime-manga/naruto-cartes-a-jouer-et-a-collectionner/naruto-carddass-series-francaises/cartes-naruto-serie-04-l-esprit-du-sable_r4111",
  s5: "/fr/cartes-de-collection/cartes-anime-manga/naruto-cartes-a-jouer-et-a-collectionner/naruto-carddass-series-francaises/cartes-naruto-serie-05-un-nouveau-depart_r4112",
};

/** Coleka leaf counts (2026-08-17). Parent `_r41705` lists 741. */
const SERIES_COUNTS: Record<ColekaCarddassFrSeriesCode, number> = {
  s1: 184,
  s2: 156,
  s3: 128,
  s4: 126,
  s5: 147,
};

export const COLEKA_CARDDASS_FR_SERIES: readonly ColekaCarddassFrSeries[] = (
  ["s1", "s2", "s3", "s4", "s5"] as const
).map((set) => ({
  set,
  rubrique: `_r${{ s1: "4108", s2: "4109", s3: "4110", s4: "4111", s5: "4112" }[set]}`,
  path: SERIES_PATH[set],
  listedCount: SERIES_COUNTS[set],
}));

export function colekaCarddassFrParentUrl(): string {
  return coleka.branches["series-francaises"];
}

/** 48 per page; `?p=1` is page 2. Extra pages stop at empty / verify wall. */
export function colekaCarddassFrListingPageUrls(
  path: string,
  listedCount: number,
): string[] {
  const base = `${COLEKA_ORIGIN}${path}`;
  const pages = Math.max(1, Math.ceil(listedCount / 48));
  return [
    base,
    ...Array.from({ length: pages - 1 }, (_, i) => `${base}?p=${i + 1}`),
  ];
}

const ITEM_RE =
  /<a\s([^>]*class="[^"]*lib_has_2_lines[^"]*"[^>]*)>([\s\S]*?)<\/a>/gi;
const NO_IMAGE_RE = /\/css\/assets\/default\/no-image/i;

function decodeEntities(raw: string): string {
  return raw
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n: string) =>
      String.fromCharCode(Number.parseInt(n, 16)),
    )
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function parseColekaCarddassFrListing(
  html: string,
  set: ColekaCarddassFrSeriesCode,
): ColekaCarddassFrCard[] {
  const byNumber = new Map<string, ColekaCarddassFrCard>();
  for (const match of html.matchAll(ITEM_RE)) {
    const attrs = match[1]!;
    const inner = match[2]!;
    const ref = inner.match(
      /<span class="ref">\s*Ref\.\s*(NI|TE|TA|CL)-(\d{1,3})\s*<\/span>/i,
    );
    if (!ref) continue;
    const colekaRef = `${ref[1]!.toUpperCase()}-${ref[2]}`;
    const number = colekaCarddassPrefixToCollector(colekaRef);
    if (!number || byNumber.has(number)) continue;
    const title = inner.match(/<h3 class="product-title">([^<]+)<\/h3>/i);
    const rawName = title ? decodeEntities(title[1]!) : "";
    const name =
      rawName && !colekaS6ItNameIsPlaceholder(rawName) ? rawName : null;
    const img = inner.match(
      /<img[^>]+src="(https:\/\/thumbs\.coleka\.com\/[^"]+)"/i,
    );
    const href = attrs.match(/\bhref="([^"]+)"/i)?.[1];
    if (!href) continue;
    const colekaId = attrs.match(/\bdata-id="(\d+)"/i)?.[1] ?? "";
    const pagePath = href.startsWith("http") ? new URL(href).pathname : href;
    const thumbUrl = img?.[1] ?? null;
    const hasFace = Boolean(thumbUrl) && !NO_IMAGE_RE.test(thumbUrl!);
    byNumber.set(number, {
      number,
      cardType: number.slice(0, 2) as ColekaS6ItCardType,
      set,
      colekaRef,
      name,
      colekaId,
      pagePath,
      thumbUrl: hasFace ? thumbUrl : null,
      faceUrl: hasFace ? colekaFullFaceUrl(thumbUrl!) : null,
    });
  }
  return [...byNumber.values()].sort((a, b) =>
    a.number.localeCompare(b.number, "en"),
  );
}
