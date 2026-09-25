/**
 * Pure parsers for Kayou host catalogues (official, narutodb, narutopia, alertehit, CCG).
 * Must not import sources/*.
 */

import type { NarutopiaChecklistEntry } from "@/providers/naruto/shared/narutopia/parseChecklistPage";

import {
  canonicalizeKayouNumber,
  kayouBoxToSetCode,
  kayouCleanPrintedId,
  kayouHitmarketFileToNumber,
  kayouHitmarketRelativePath,
  kayouNumberToPrinted,
  kayouOfficialIdToPrint,
  kayouOfficialSetLabel,
  kayouPrintedToNumber,
  type KayouChecklist,
  type KayouChecklistCard,
  type KayouChecklistSet,
} from "../identity";


// ─── kayouOfficialParse ───

/** Naruto on the US storefront. */
export const KAYOU_NARUTO_IP_ID = "ip-rtqgm0xa";

export const KAYOU_OFFICIAL_IP_COLLECTIONS =
  "https://www.kayouofficial.com/en-US/ip-collections";

export const KAYOU_OFFICIAL_SERIES_URL = (seriesId: string) =>
  `https://www.kayouofficial.com/en-US/series/${seriesId}`;

export type KayouOfficialSeriesIndexEntry = {
  ipId: string;
  seriesId: string;
  sectionEyebrow: string;
  sectionTitle: string;
};

export type KayouOfficialCard = {
  idCode: string;
  name: string;
  rarity: string;
  rarityFull?: string;
  frontImage: string;
  frontWidth?: number;
  frontHeight?: number;
  backImage: string;
  sortOrder?: number;
};

export type KayouOfficialSeriesDetail = {
  seriesId: string;
  seriesTypeName: string;
  seriesTypeDescription: string;
  productSpecs: Record<string, string>;
  productName?: string;
  model?: string;
  heroBoxImage?: string;
  cards: KayouOfficialCard[];
};

function narutoIpBlock(html: string, ipId: string): string {
  const marker = ipId;
  const start = html.indexOf(marker);
  if (start < 0) return "";
  let block = html.slice(start);
  const nextIp = block.slice(marker.length).search(/ip-[a-z0-9]{8,}/);
  if (nextIp >= 0) block = block.slice(0, marker.length + nextIp);
  return block;
}

/** Series ids under one IP block on ip-collections. */
export function parseKayouOfficialSeriesIds(
  ipCollectionsHtml: string,
  ipId: string = KAYOU_NARUTO_IP_ID,
): string[] {
  const block = narutoIpBlock(ipCollectionsHtml, ipId);
  if (!block) return [];
  const ids = new Set<string>();
  for (const m of block.matchAll(/seriesId\\":\\"(series-[a-z0-9]+)/g)) {
    ids.add(m[1]!);
  }
  if (!ids.size) {
    for (const m of block.matchAll(/\\"id\\":\\"(series-[a-z0-9]+)/g)) {
      ids.add(m[1]!);
    }
  }
  return [...ids].sort();
}

/** @deprecated use {@link parseKayouOfficialSeriesIds} */
export function parseNarutoKayouSeriesIds(ipCollectionsHtml: string): string[] {
  return parseKayouOfficialSeriesIds(ipCollectionsHtml, KAYOU_NARUTO_IP_ID);
}

/** IP → section eyebrow/title → series id (SKU family index). */
export function parseKayouOfficialIpSeriesIndex(
  ipCollectionsHtml: string,
  ipId: string = KAYOU_NARUTO_IP_ID,
): KayouOfficialSeriesIndexEntry[] {
  const block = narutoIpBlock(ipCollectionsHtml, ipId);
  if (!block) return [];

  const out: KayouOfficialSeriesIndexEntry[] = [];
  let sectionEyebrow = "";
  let sectionTitle = "";
  for (const m of block.matchAll(/\\"(eyebrow|title|seriesId)\\":\\"([^\\]+)/g)) {
    const kind = m[1]!;
    const value = m[2]!;
    if (kind === "eyebrow") sectionEyebrow = value;
    else if (kind === "title" && !value.startsWith("series-")) sectionTitle = value;
    else if (kind === "seriesId") {
      out.push({ ipId, seriesId: value, sectionEyebrow, sectionTitle });
    }
  }
  return out;
}

const PRODUCT_SPEC_LABELS = new Set([
  "Product Name",
  "Model",
  "Packaging Specs",
  "Package Dimension",
  "Release Date",
  "Version Code",
]);

export function parseKayouOfficialProductSpecs(
  seriesHtml: string,
): Record<string, string> {
  const block = seriesHtml.match(
    /productSpecs\\":\[(.*?)\],\\"probabilities/s,
  )?.[1];
  if (!block) return {};
  const out: Record<string, string> = {};
  for (const m of block.matchAll(/\\"label\\":\\"([^\\]+)\\",\\"value\\":\\"([^\\]+)/g)) {
    if (PRODUCT_SPEC_LABELS.has(m[1]!)) out[m[1]!] = m[2]!;
  }
  return out;
}

function parseKayouOfficialCardChunk(chunk: string): KayouOfficialCard | null {
  const idCode =
    chunk.match(/idCode\\":\\"([^\\]+)/)?.[1] ??
    chunk.match(/^([^\\]+)/)?.[1];
  const rarity = chunk.match(/rarity\\":\\"([^\\]+)/)?.[1];
  const backImage = chunk.match(/backImage\\":\\"([^\\]+)/)?.[1];
  if (!idCode || !rarity || !backImage) return null;

  const rawName = chunk.match(/name\\":\\"([^\\]*)/)?.[1];
  const image = chunk.match(/\\"image\\":\\"([^\\]+)/)?.[1];
  const rarityFull = chunk.match(/rarityFull\\":\\"([^\\]*)/)?.[1];
  const sortOrder = Number(chunk.match(/sortOrder\\":(\d+)/)?.[1]);
  const frontWidth = Number(chunk.match(/imageWidth\\":(\d+)/)?.[1]);
  const frontHeight = Number(chunk.match(/imageHeight\\":(\d+)/)?.[1]);

  return {
    idCode,
    name: rawName?.replace(/\\n/g, "\n").trim() ?? idCode,
    rarity,
    ...(rarityFull ? { rarityFull } : {}),
    frontImage: image ?? "",
    ...(Number.isFinite(frontWidth) ? { frontWidth } : {}),
    ...(Number.isFinite(frontHeight) ? { frontHeight } : {}),
    backImage,
    ...(Number.isFinite(sortOrder) ? { sortOrder } : {}),
  };
}

/** Featured gallery on a series (SKU) page — face + back + idCode. */
export function parseKayouOfficialSeriesCards(
  seriesHtml: string,
): KayouOfficialCard[] {
  const byCode = new Map<string, KayouOfficialCard>();
  const chunks = seriesHtml.includes('\\"cards\\":[')
    ? seriesHtml.split('\\"id\\":\\"merch-').slice(1)
    : seriesHtml.split('idCode\\":\\"').slice(1);

  for (const chunk of chunks) {
    const card = parseKayouOfficialCardChunk(chunk);
    if (card?.idCode) byCode.set(card.idCode, card);
  }
  return [...byCode.values()].sort(
    (a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0),
  );
}

export function parseKayouOfficialHeroBoxImage(
  seriesHtml: string,
): string | null {
  return seriesHtml.match(/heroBoxImage\\":\\"([^\\]+)/)?.[1]?.trim() ?? null;
}

export function parseKayouOfficialSeriesDetail(
  seriesHtml: string,
  seriesId: string,
): KayouOfficialSeriesDetail {
  const productSpecs = parseKayouOfficialProductSpecs(seriesHtml);
  return {
    seriesId,
    seriesTypeName:
      seriesHtml.match(/seriesTypeName\\":\\"([^\\]+)/)?.[1]?.trim() ?? "",
    seriesTypeDescription:
      seriesHtml.match(/seriesTypeDescription\\":\\"([^\\]+)/)?.[1]?.trim() ??
      "",
    productSpecs,
    productName: productSpecs["Product Name"],
    model: productSpecs.Model,
    heroBoxImage: parseKayouOfficialHeroBoxImage(seriesHtml) ?? undefined,
    cards: parseKayouOfficialSeriesCards(seriesHtml),
  };
}

// ─── narutodbParse ───

export const NARUTODB_API_ORIGIN = "https://api.narutodb.com";
export const NARUTODB_CDN_ORIGIN = "https://cdn.narutodb.com";

export type NarutodbSet = {
  id: string;
  name: string;
  subtitle?: string | null;
  total_cards?: number | null;
};

export type NarutodbCardListRow = {
  card_number: string;
  set_id: string;
  rarity_code?: string | null;
  character_name?: string | null;
  image_front_url?: string | null;
  image_back_url?: string | null;
  image_thumb_url?: string | null;
};

export function narutodbCardApiUrl(cardNumber: string): string {
  return `${NARUTODB_API_ORIGIN}/api/cards/${encodeURIComponent(cardNumber)}`;
}

export function narutodbSetCardsApiUrl(setId: string): string {
  return `${NARUTODB_API_ORIGIN}/api/sets/${encodeURIComponent(setId)}/cards`;
}

export function narutodbSetsApiUrl(): string {
  return `${NARUTODB_API_ORIGIN}/api/sets`;
}

/** CDN layout attested on NREA01-SR-018L2 (front + back). */
export function narutodbOfficialImageUrl(
  cardNumber: string,
  side: "front" | "back" | "thumb",
): string {
  const code = cardNumber.trim();
  return `${NARUTODB_CDN_ORIGIN}/storage/cards/official/${encodeURIComponent(code)}-${side}.png`;
}

export function parseNarutodbSetsJson(raw: unknown): NarutodbSet[] {
  if (!Array.isArray(raw)) return [];
  const out: NarutodbSet[] = [];
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const id = String((row as { id?: unknown }).id ?? "").trim();
    const name = String((row as { name?: unknown }).name ?? "").trim();
    if (!id || !name) continue;
    out.push({
      id,
      name,
      subtitle:
        typeof (row as { subtitle?: unknown }).subtitle === "string"
          ? (row as { subtitle: string }).subtitle
          : null,
      total_cards:
        typeof (row as { total_cards?: unknown }).total_cards === "number"
          ? (row as { total_cards: number }).total_cards
          : null,
    });
  }
  return out;
}

export function parseNarutodbCardsJson(raw: unknown): NarutodbCardListRow[] {
  const list = Array.isArray(raw)
    ? raw
    : raw && typeof raw === "object" && Array.isArray((raw as { cards?: unknown }).cards)
      ? (raw as { cards: unknown[] }).cards
      : [];
  const out: NarutodbCardListRow[] = [];
  for (const row of list) {
    if (!row || typeof row !== "object") continue;
    const card_number = String(
      (row as { card_number?: unknown }).card_number ?? "",
    ).trim();
    const set_id = String((row as { set_id?: unknown }).set_id ?? "").trim();
    if (!card_number || !set_id) continue;
    out.push({
      card_number,
      set_id,
      rarity_code:
        typeof (row as { rarity_code?: unknown }).rarity_code === "string"
          ? (row as { rarity_code: string }).rarity_code
          : null,
      character_name:
        typeof (row as { character_name?: unknown }).character_name === "string"
          ? (row as { character_name: string }).character_name
          : null,
      image_front_url:
        typeof (row as { image_front_url?: unknown }).image_front_url === "string"
          ? (row as { image_front_url: string }).image_front_url
          : null,
      image_back_url:
        typeof (row as { image_back_url?: unknown }).image_back_url === "string"
          ? (row as { image_back_url: string }).image_back_url
          : null,
      image_thumb_url:
        typeof (row as { image_thumb_url?: unknown }).image_thumb_url === "string"
          ? (row as { image_thumb_url: string }).image_thumb_url
          : null,
    });
  }
  return out;
}

/**
 * Build a Kayou checklist from narutodb set + card rows.
 * Uses `kayouOfficialIdToPrint` so NREA01 → set `nrea01`.
 */
export function buildNarutodbKayouChecklist(input: {
  sets: readonly NarutodbSet[];
  cardsBySet: Readonly<Record<string, readonly NarutodbCardListRow[]>>;
  observed?: string;
}): KayouChecklist {
  const setMeta = new Map(input.sets.map((s) => [s.id, s]));
  const byCode = new Map<string, KayouChecklistSet>();

  for (const [setId, rows] of Object.entries(input.cardsBySet)) {
    for (const row of rows) {
      const mapped = kayouOfficialIdToPrint(row.card_number);
      if (!mapped) continue;
      // Ninja Age already on narutocards / official enrich as cc.*
      if (mapped.setCode === "ninjaagebox") continue;

      let set = byCode.get(mapped.setCode);
      if (!set) {
        const meta = setMeta.get(setId);
        const label =
          kayouOfficialSetLabel(mapped.setCode) !== mapped.setCode.toUpperCase()
            ? kayouOfficialSetLabel(mapped.setCode)
            : meta
              ? `${meta.name}${meta.subtitle ? ` (${meta.subtitle})` : ""}`
              : kayouOfficialSetLabel(mapped.setCode);
        set = {
          slug: `narutodb-${mapped.setCode}`,
          code: mapped.setCode,
          label,
          url: `https://narutodb.com/sets/${encodeURIComponent(setId)}`,
          cards: [],
        };
        byCode.set(mapped.setCode, set);
      }

      const front =
        row.image_front_url?.trim() ||
        narutodbOfficialImageUrl(row.card_number, "front");
      set.cards.push({
        printed: row.card_number,
        number: mapped.number,
        name: row.character_name?.trim() || row.card_number,
        rarity: row.rarity_code?.trim() || null,
        faceUrl: front,
        faceSource: "narutodb",
      });
    }
  }

  const sets = [...byCode.values()]
    .map((set) => ({
      ...set,
      cards: set.cards.sort((a, b) => a.number.localeCompare(b.number)),
    }))
    .filter((set) => set.cards.length > 0)
    .sort((a, b) => a.code.localeCompare(b.code));

  return {
    source: "narutodb.com",
    url: "https://narutodb.com/",
    observed: input.observed,
    sets,
  };
}

export function narutodbBackUrlForCard(row: NarutodbCardListRow): string {
  return (
    row.image_back_url?.trim() ||
    narutodbOfficialImageUrl(row.card_number, "back")
  );
}

// ─── narutopiaParse ───

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
  /*
    Héritage XR on Narutopia: `NRCC-XR-006` (base), `NRCC-XR-006P` (numérotée),
    `NRCC-XR-001Y` (alt). Placarr uses Capsule `cc.xr.006l5` / `cc.xr.006pl5` /
    `cc.xr.001yl5` — bridge the suffixes so clean Narutopia scans replace
    watermarked capsulecorpgear dumps.
  */
  const xr = cleaned.match(/^NRCC-XR-(\d{3})([PY])?$/i);
  if (xr) {
    const n = xr[1]!;
    const suf = (xr[2] || "").toUpperCase();
    const ccBase = `cc.xr.${n.toLowerCase()}`;
    if (suf === "P") {
      keys.add(`${ccBase}pl5`);
      keys.add(`CC-XR-${n}PL5`);
      keys.add(`NRCC-XR-${n}PL5`);
    } else if (suf === "Y") {
      keys.add(`${ccBase}yl5`);
      keys.add(`CC-XR-${n}YL5`);
      keys.add(`NRCC-XR-${n}YL5`);
    } else {
      keys.add(`${ccBase}l5`);
      keys.add(`${ccBase}pl5`);
      keys.add(`CC-XR-${n}L5`);
      keys.add(`CC-XR-${n}PL5`);
      keys.add(`NRCC-XR-${n}L5`);
      keys.add(`NRCC-XR-${n}PL5`);
    }
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
      }
      alts.add(hit.faceUrl);
      const src = (card.faceSource ?? "").toLowerCase();
      // Promote Narutopia over watermarked shop dumps; keep official.
      const promote =
        !card.faceUrl?.trim() ||
        src === "capsulecorpgear" ||
        src === "alertehit";
      if (!promote) {
        return {
          ...card,
          faceUrlAlternates: [...alts].filter((u) => u !== card.faceUrl),
        };
      }
      return {
        ...card,
        faceUrl: hit.faceUrl,
        faceSource: "narutopia",
        faceUrlAlternates: [...alts].filter((u) => u !== hit!.faceUrl),
      };
    }),
  }));
  return { ...ledger, sets };
}

// ─── alertehitNarutodexParse ───

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

// ─── capsulecorpgearParse ───

export const CAPSULECORPGEAR_LIST_URL =
  "https://capsulecorpgear.com/naruto-kayou-card-list/";
export const CAPSULECORPGEAR_UPLOADS_BASE =
  "https://capsulecorpgear.com/wp-content/uploads/";

export type CapsulecorpRawCard = {
  name: string;
  id: string;
  image: string;
  box: string;
  rank: string;
  meta?: string;
  form?: string;
  price?: string;
  link?: string;
};

export function decodeCapsulecorpField(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  try {
    return Buffer.from(trimmed, "base64").toString("utf8");
  } catch {
    return trimmed;
  }
}

export function decodeCapsulecorpCards(raw: CapsulecorpRawCard[]): CapsulecorpRawCard[] {
  return raw.map((row) => ({
    name: decodeCapsulecorpField(row.name),
    id: decodeCapsulecorpField(row.id),
    image: decodeCapsulecorpField(row.image),
    box: decodeCapsulecorpField(row.box),
    rank: decodeCapsulecorpField(row.rank),
    meta: row.meta ? decodeCapsulecorpField(row.meta) : "",
    form: row.form ? decodeCapsulecorpField(row.form) : "",
    price: row.price ? decodeCapsulecorpField(row.price) : "",
    link: row.link ? decodeCapsulecorpField(row.link) : "",
  }));
}

export function extractCapsulecorpCardsJson(html: string): CapsulecorpRawCard[] {
  const match = html.match(/let cards = (\[[\s\S]*?\]);/);
  if (!match?.[1]) {
    throw new Error("capsulecorpgear: cards payload not found");
  }
  return JSON.parse(match[1]) as CapsulecorpRawCard[];
}

export function capsulecorpFaceUrl(imageFile: string): string | null {
  const file = imageFile.trim();
  if (!file) return null;
  return `${CAPSULECORPGEAR_UPLOADS_BASE}${file}`;
}

export function capsulecorpCardToChecklistEntry(
  card: CapsulecorpRawCard,
): { setCode: string; card: KayouChecklistCard } | null {
  const setCode = kayouBoxToSetCode(card.box);
  if (!setCode) return null;
  const printed = kayouCleanPrintedId(card.id);
  const number = kayouPrintedToNumber(printed);
  const name = card.name.trim() || card.meta?.trim() || printed;
  if (!number || !name) return null;
  const faceUrl = capsulecorpFaceUrl(card.image);
  return {
    setCode,
    card: {
      printed: kayouNumberToPrinted(number),
      number,
      name,
      rarity: card.rank.trim() || null,
      faceUrl,
      faceSource: "capsulecorpgear",
    },
  };
}

export function buildCapsulecorpChecklist(
  raw: CapsulecorpRawCard[],
  observed = new Date().toISOString().slice(0, 10),
): KayouChecklist {
  const decoded = decodeCapsulecorpCards(raw);
  const bySet = new Map<string, KayouChecklistCard[]>();
  const byKey = new Map<string, KayouChecklistCard>();

  for (const row of decoded) {
    const mapped = capsulecorpCardToChecklistEntry(row);
    if (!mapped) continue;
    const key = `${mapped.setCode}:${mapped.card.number}`;
    const existing = byKey.get(key);
    if (existing) {
      if (mapped.card.faceUrl && !existing.faceUrl) {
        existing.faceUrl = mapped.card.faceUrl;
        existing.faceSource = "capsulecorpgear";
      } else if (mapped.card.faceUrl) {
        existing.faceUrlAlternates = [
          ...(existing.faceUrlAlternates ?? []),
          mapped.card.faceUrl,
        ].filter((u, i, a) => a.indexOf(u) === i);
      }
      if (mapped.card.name && mapped.card.name !== mapped.card.printed) {
        existing.name = mapped.card.name;
      }
      continue;
    }
    byKey.set(key, mapped.card);
    const list = bySet.get(mapped.setCode) ?? [];
    list.push(mapped.card);
    bySet.set(mapped.setCode, list);
  }

  const sets: KayouChecklistSet[] = [...bySet.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([code, cards]) => ({
      slug: `capsulecorpgear-${code}`,
      code,
      label: code.toUpperCase(),
      url: CAPSULECORPGEAR_LIST_URL,
      cards: cards.sort((a, b) => a.number.localeCompare(b.number)),
    }));

  return {
    source: "capsulecorpgear.com — Naruto Kayou card list",
    url: CAPSULECORPGEAR_LIST_URL,
    observed,
    ingest: "HTML `let cards = …` base64 fields + wp-content/uploads faces",
    sets,
  };
}

export function parseCapsulecorpChecklist(html: string): KayouChecklist {
  const raw = extractCapsulecorpCardsJson(html);
  return buildCapsulecorpChecklist(raw);
}

// ─── kayouOfficialChecklist ───

/** Minimal catalog shape (avoids importing sources/crawl). */
export type KayouOfficialChecklistCatalog = {
  series: readonly {
    url?: string;
    cards: readonly {
      idCode: string;
      name?: string;
      rarity?: string;
      frontImage?: string;
    }[];
  }[];
};

export function buildKayouOfficialChecklist(
  catalog: KayouOfficialChecklistCatalog | null,
): KayouChecklist | null {
  if (!catalog?.series?.length) return null;

  const bySet = new Map<string, KayouChecklistSet>();

  for (const series of catalog.series) {
    for (const card of series.cards) {
      const mapped = kayouOfficialIdToPrint(card.idCode);
      if (!mapped) continue;
      // Ninja Age already lives on narutocards / CCG as `cc.*`.
      if (mapped.setCode === "ninjaagebox") continue;

      let set = bySet.get(mapped.setCode);
      if (!set) {
        set = {
          slug: `kayouofficial-${mapped.setCode}`,
          code: mapped.setCode,
          label: kayouOfficialSetLabel(mapped.setCode),
          url: series.url ?? "https://www.kayouofficial.com/",
          cards: [],
        };
        bySet.set(mapped.setCode, set);
      }

      const name = card.name?.trim() || card.idCode;
      set.cards.push({
        printed: card.idCode,
        number: mapped.number,
        name,
        rarity: card.rarity?.trim() || null,
        faceUrl: card.frontImage?.trim() || null,
        faceSource: "kayouofficial",
      });
    }
  }

  const sets = [...bySet.values()]
    .map((set) => ({
      ...set,
      cards: set.cards.sort((a, b) => a.number.localeCompare(b.number)),
    }))
    .filter((set) => set.cards.length > 0)
    .sort((a, b) => a.code.localeCompare(b.code));

  if (!sets.length) return null;

  return {
    source: "kayouofficial.com",
    url: "https://www.kayouofficial.com/",
    sets,
  };
}
