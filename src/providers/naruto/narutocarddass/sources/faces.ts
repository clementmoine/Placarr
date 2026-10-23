/**
 * Naruto Carddass face / marketplace ledgers (card scans, not sealed packshots).
 */

import bandaiFrSerie1DetailleeJson from "../curated/sources/bandai-fr-serie-1-detaillee.json";
import mercariLedgerJson from "../curated/sources/mercari.json";
import s2FrPhysicalFinishesJson from "../curated/sources/s2-fr-physical-finishes.json";
import s3FrPhysicalFinishesJson from "../curated/sources/s3-fr-physical-finishes.json";
import s4FrPhysicalFinishesJson from "../curated/sources/s4-fr-physical-finishes.json";
import s5FrPhysicalFinishesJson from "../curated/sources/s5-fr-physical-finishes.json";
import s6FrPhysicalFinishesJson from "../curated/sources/s6-fr-physical-finishes.json";
import s11FrPhysicalFinishesJson from "../curated/sources/s11-fr-physical-finishes.json";
import s24FrPhysicalFinishesJson from "../curated/sources/s24-fr-physical-finishes.json";
import s28FrPhysicalFinishesJson from "../curated/sources/s28-fr-physical-finishes.json";
import slabzLedgerJson from "../curated/sources/slab-z-ja.json";
import tvtokyoLedgerJson from "../curated/sources/tvtokyo.json";
import yahooAuctionsLedgerJson from "../curated/sources/yahoo-auctions.json";
import {
  canonicalizeNarutoPrintKey,
  canonicalNarutoDiskPrefix,
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

/** Bandai / official short key `ni001` from collector `ni0001` / `NI-1`. */
function carddassFrShortKey(collectorNumber: string): string | null {
  const id = parseNarutoCollector(collectorNumber);
  if (!id) return null;
  const prefix = canonicalNarutoDiskPrefix(id.printedPrefix).toLowerCase();
  return `${prefix}${String(id.number).padStart(3, "0")}`;
}

function physicalFinishSets(ledger: {
  holoOnly: readonly string[];
  dualNormalAndHolo: readonly string[];
}): { holoOnly: Set<string>; dual: Set<string> } {
  return {
    holoOnly: new Set(ledger.holoOnly.map((id) => id.trim().toLowerCase())),
    dual: new Set(
      ledger.dualNormalAndHolo.map((id) => id.trim().toLowerCase()),
    ),
  };
}

const PHYSICAL_FR_FINISHES: Record<
  string,
  { holoOnly: Set<string>; dual: Set<string> }
> = {
  s2: physicalFinishSets(s2FrPhysicalFinishesJson),
  s3: physicalFinishSets(s3FrPhysicalFinishesJson),
  s4: physicalFinishSets(s4FrPhysicalFinishesJson),
  s5: physicalFinishSets(s5FrPhysicalFinishesJson),
  s6: physicalFinishSets(s6FrPhysicalFinishesJson),
  s11: physicalFinishSets(s11FrPhysicalFinishesJson),
  s24: physicalFinishSets(s24FrPhysicalFinishesJson),
  s28: physicalFinishSets(s28FrPhysicalFinishesJson),
};

/**
 * Physical FR finishes from a holoOnly / dual ledger.
 *
 * Any slot that is not foil-only / dual is Normale. Returning `null` would
 * fall back to legacy dual and invent foil rows in the master set.
 */
function attestedPhysicalFrFinishes(
  short: string,
  sets: { holoOnly: Set<string>; dual: Set<string> },
): readonly string[] {
  const key = short.toLowerCase();
  if (sets.dual.has(key)) return [PLAIN, HOLO];
  if (sets.holoOnly.has(key)) return [HOLO];
  return [PLAIN];
}

/**
 * S1 manga prerelease that is the non-holo alt of a retail holo
 * (`ni019` / `ta005` / `te007` / `te036`). Opened card lives on
 * `*-prerelease` (e.g. TA-005 « Kyubi ») — retail is foil-only.
 */
export function isNarutoS1PrereleaseNonHoloAltOfHolo(
  collectorNumber: string,
): boolean {
  const short = carddassFrShortKey(collectorNumber);
  if (!short) return false;
  if (
    !bandaiFrSerie1DetailleeJson.prereleaseListed.some(
      (id) => id.toLowerCase() === short,
    )
  ) {
    return false;
  }
  return bandaiFrSerie1DetailleeJson.cards.some(
    (row) => row.printKey.toLowerCase() === short && row.holoMarker,
  );
}

/**
 * Attested finishes for FR Carddass retail series.
 *
 * - **S1** — Bandai « Série 1 détaillée ». Retail holo that has a manga
 *   non-holo alt (`ni019` / `ta005` / `te007` / `te036`) stays **foil-only**
 *   on the retail key — the opened non-holo (TA-005 « Kyubi », …) and the
 *   still-sealed bag live on `*-prerelease`. Other holos → foil-only;
 *   communes → Normale.
 * - **S2–S6 / S11 / S24 / S28** — physical FR ledgers
 *   (`*-fr-physical-finishes.json`). Foil-only / dual IDs; every other slot
 *   is Normale. carddass.fr listes are often off-by-one and must not gate.
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
    // Non-holo manga alt is on `*-prerelease`, not retail Normale.
    if (hasHolo) return [HOLO];
    return [PLAIN];
  }

  const physical = PHYSICAL_FR_FINISHES[set];
  if (physical) return attestedPhysicalFrFinishes(short, physical);

  return null;
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
