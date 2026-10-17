/**
 * Naruto Carddass face / marketplace ledgers (card scans, not sealed packshots).
 */

import bandaiFrSerie1DetailleeJson from "../curated/sources/bandai-fr-serie-1-detaillee.json";
import mercariLedgerJson from "../curated/sources/mercari.json";
import slabzLedgerJson from "../curated/sources/slab-z-ja.json";
import tvtokyoLedgerJson from "../curated/sources/tvtokyo.json";
import yahooAuctionsLedgerJson from "../curated/sources/yahoo-auctions.json";
import {
  canonicalizeNarutoPrintKey,
  canonicalNarutoDiskPrefix,
  loadOfficialNames,
  mintNarutoPrintKey,
  narutoDiskCardId,
  parseNarutoCollector,
} from "../identity";
import type { NarutoPrintRow, NarutoTitleRow } from "../indexStore";
import { cardTypeFromCollectorNumber } from "../parse/bandai";

// ─── Coleka listing fetch ──────────────────────────────────────────────────

export { fetchColekaListingHtml } from "@/providers/shared/coleka/listingFetch";

// ─── Bandai FR Série 1 détaillée ─────────────────────────────────────────

export function bandaiFrSerie1DetailleeLedger() {
  return bandaiFrSerie1DetailleeJson;
}

export function bandaiFrSerie1DetailleePrintKeys(): string[] {
  return [...new Set(bandaiFrSerie1DetailleeJson.cards.map((row) => row.printKey))].sort();
}

export function bandaiFrSerie1DetailleeHoloCount(): number {
  return bandaiFrSerie1DetailleeJson.cards.filter((row) => row.holoMarker).length;
}

const PLAIN = "normal";
const HOLO = "holo";

/**
 * FR series whose carddass.fr « liste des cartes » pages carry a usable
 * rarity (`commune` / `rare` / `holo`). S4 has none; S1 prefers Bandai
 * détailée (prerelease duals). S6 was never printed FR.
 */
const OFFICIAL_LIST_RARITY_SETS = new Set(["s2", "s3", "s5"]);

/** Bandai / official short key `ni001` from collector `ni0001` / `NI-1`. */
function carddassFrShortKey(collectorNumber: string): string | null {
  const id = parseNarutoCollector(collectorNumber);
  if (!id) return null;
  const prefix = canonicalNarutoDiskPrefix(id.printedPrefix).toLowerCase();
  return `${prefix}${String(id.number).padStart(3, "0")}`;
}

function finishesFromOfficialListRarity(
  rarity: string | null | undefined,
): readonly string[] | null {
  const r = (rarity ?? "").trim().toLowerCase();
  if (!r) return null;
  if (r === "holo" || r === "holofoil") return [HOLO];
  if (r === "commune" || r === "common" || r === "rare") return [PLAIN];
  return null;
}

/**
 * Attested finishes for FR Carddass retail series.
 *
 * - **S1** — Bandai « Série 1 détaillée ». Dual (`normal`+`holo`) = Bandai
 *   listed a non-holo alt of a holo ID (`ni019` / `ta005` / `te007` /
 *   `te036`). That plain card is the opened bag content; the still-in-bag
 *   copy lives on the `*-prerelease` printKey with finish `sealed` only.
 * - **S2 / S3 / S5** — carddass.fr listes (`carddass-card-names.json`).
 *   `holo` → foil only; `commune` / `rare` → Normale only. Missing rarity
 *   → `null` (caller keeps legacy dual — e.g. S4, or unlisted S2 stubs).
 *
 * Returns `null` when the series / number is not attested.
 */
export function attestedNarutoCarddassFinishes(
  setCode: string,
  collectorNumber: string,
): readonly string[] | null {
  const set = setCode.trim().toLowerCase();
  const short = carddassFrShortKey(collectorNumber);
  if (!short) return null;

  if (set === "s1") {
    const rows = bandaiFrSerie1DetailleeJson.cards.filter(
      (row) => row.printKey.toLowerCase() === short,
    );
    if (rows.length === 0) return null;
    const hasHolo = rows.some((row) => row.holoMarker);
    const prereleaseAlt = bandaiFrSerie1DetailleeJson.prereleaseListed.some(
      (id) => id.toLowerCase() === short,
    );
    // Non-holo prerelease alt of a holo ID → retail offers both finishes.
    if (hasHolo && prereleaseAlt) return [PLAIN, HOLO];
    if (hasHolo) return [HOLO];
    return [PLAIN];
  }

  if (!OFFICIAL_LIST_RARITY_SETS.has(set)) return null;
  const official = loadOfficialNames().get(short);
  if (!official) return null;
  const serie = official.serie;
  if (typeof serie === "number" && `s${serie}` !== set) return null;
  return finishesFromOfficialListRarity(official.rarity);
}

// ─── Mercari faces ───────────────────────────────────────────────────────

export type MercariFace = (typeof mercariLedgerJson.faces)[number];
export type MercariIngestFace = MercariFace & { ingest: true };

export function mercariLedger() {
  return mercariLedgerJson;
}

export function mercariIngestFaces(): MercariIngestFace[] {
  return mercariLedgerJson.faces.filter((row): row is MercariIngestFace => {
    if (row.ingest !== true) return false;
    const hasCurated =
      "curated" in row && typeof (row as { curated?: unknown }).curated === "string";
    const hasUrl = typeof row.url === "string" && row.url.length > 0;
    return hasCurated || hasUrl;
  });
}

// ─── Yahoo Auctions faces ────────────────────────────────────────────────

export type YahooAuctionFace = (typeof yahooAuctionsLedgerJson.faces)[number];
export type YahooIngestFace = YahooAuctionFace & { curated: string };

export function yahooAuctionLedger() {
  return yahooAuctionsLedgerJson;
}

export function yahooIngestFaces(): YahooIngestFace[] {
  return yahooAuctionsLedgerJson.faces.filter(
    (row): row is YahooIngestFace =>
      row.ingest === true &&
      "curated" in row &&
      typeof row.curated === "string",
  );
}

// ─── Slabz faces ─────────────────────────────────────────────────────────

export type SlabzFace = (typeof slabzLedgerJson.faces.cards)[number];

export function slabzFaceLedger() {
  return slabzLedgerJson;
}

export function slabzIngestFaces(): SlabzFace[] {
  return slabzLedgerJson.faces.cards;
}

/** Deterministic Wix CDN for a pasted media id. */
export function slabzFaceUrl(media: string): string {
  const id = media.trim();
  return `https://static.wixstatic.com/media/${id}~mv2.jpg`;
}

// ─── TV Tokyo faces ──────────────────────────────────────────────────────

export type NarutoCcgTvTokyoFace = (typeof tvtokyoLedgerJson.faces)[number];

export function narutoCcgTvTokyoFaceLedger() {
  return tvtokyoLedgerJson;
}

export function narutoCcgTvTokyoIngestFaces(): NarutoCcgTvTokyoFace[] {
  return tvtokyoLedgerJson.faces.filter((row) => row.ingest !== false);
}

/**
 * Suffixe de fichier TV Tokyo → source disque.
 * `s193a.jpg` / `s193b.jpg` → tvtokyo-a / tvtokyo-b ; sinon `tvtokyo`.
 */
export function tvTokyoFaceSourceFromFile(
  file: string,
): "tvtokyo" | "tvtokyo-a" | "tvtokyo-b" {
  const stem = file.trim().toLowerCase().replace(/\.[^.]+$/, "");
  if (stem.endsWith("a")) return "tvtokyo-a";
  if (stem.endsWith("b")) return "tvtokyo-b";
  return "tvtokyo";
}

export function mergeTvTokyoJaNamesIntoIndex(input: {
  prints: NarutoPrintRow[];
  titles: NarutoTitleRow[];
}): {
  prints: NarutoPrintRow[];
  titles: NarutoTitleRow[];
  addedPrints: string[];
  titled: string[];
} {
  const prints = [...input.prints];
  const titles = [...input.titles];
  const printByKey = new Map(
    prints.map((p) => [canonicalizeNarutoPrintKey(p.printKey), p]),
  );
  const titleKeys = new Set(
    titles.map(
      (t) =>
        `${canonicalizeNarutoPrintKey(t.printKey)}\0${t.lang.toLowerCase()}`,
    ),
  );
  const addedPrints: string[] = [];
  const titled: string[] = [];

  for (const row of narutoCcgTvTokyoIngestFaces()) {
    const printKey = mintNarutoPrintKey(row.diskId, "promo");
    if (!printKey) continue;
    const diskId = narutoDiskCardId(row.diskId) ?? row.diskId;
    const parsed = parseNarutoCollector(row.diskId);
    if (!printByKey.has(printKey)) {
      const print: NarutoPrintRow = {
        printKey,
        setCode: "promo",
        number: diskId,
        cardType: cardTypeFromCollectorNumber(diskId),
        family: parsed?.family ?? null,
      };
      prints.push(print);
      printByKey.set(printKey, print);
      addedPrints.push(printKey);
    }
    const titleKey = `${printKey}\0ja`;
    if (titleKeys.has(titleKey)) continue;
    const name = row.name.trim();
    if (!name) continue;
    titles.push({ printKey, lang: "ja", fullName: name });
    titleKeys.add(titleKey);
    titled.push(printKey);
  }

  prints.sort((a, b) => a.printKey.localeCompare(b.printKey));
  addedPrints.sort((a, b) => a.localeCompare(b));
  titled.sort((a, b) => a.localeCompare(b));
  return { prints, titles, addedPrints, titled };
}
