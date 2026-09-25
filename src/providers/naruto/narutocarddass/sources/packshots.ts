/**
 * Naruto Carddass packshot ledgers — thin JSON wrappers + host helpers.
 * One file for sealedProducts / install / tests; curated JSON paths unchanged.
 */

import atomicempireLedgerJson from "../curated/sources/atomicempire.json";
import cardgameclubLedgerJson from "../curated/sources/cardgameclub.json";
import ebayLedgerJson from "../curated/sources/ebay.json";
import emporiodimiloLedgerJson from "../curated/sources/emporiodimilo.json";
import goatLedgerJson from "../curated/sources/goat-en-ccg.json";
import gradedcardcenterLedgerJson from "../curated/sources/gradedcardcenter.json";
import kinkaiLedgerJson from "../curated/sources/kinkai.json";
import leboncoinLedgerJson from "../curated/sources/leboncoin.json";
import mangaNewsLedgerJson from "../curated/sources/manga-news-packshots.json";
import mangaSanctuaryLedgerJson from "../curated/sources/manga-sanctuary-packshots.json";
import martinaLedgerJson from "../curated/sources/martina.json";
import psYoyakuLedgerJson from "../curated/sources/ps-yoyaku-tokuten.json";
import rakutenLedgerJson from "../curated/sources/rakuten.json";
import sunnystoreLedgerJson from "../curated/sources/sunnystore.json";
import toywizLedgerJson from "../curated/sources/toywiz.json";
import trictracLedgerJson from "../curated/sources/trictrac.json";
import vintedLedgerJson from "../curated/sources/vinted.json";
import bandaiFrUsDriveLedgerJson from "../curated/sources/bandai-fr-us-drive.json";
import colekaEnCcgCoversLedgerJson from "../curated/sources/coleka-en-ccg-covers.json";
import scifiUniverseLedgerJson from "../curated/sources/scifi-universe.json";
import vialudibundaLedgerJson from "../curated/sources/vialudibunda.json";

// ─── shared ledger factory ─────────────────────────────────────────────────

export type PackshotIngestRow = {
  ingest?: boolean;
};

export function defineLedgerPackshots<
  TLedger extends { products: readonly TRow[] },
  TRow extends PackshotIngestRow,
>(ledger: TLedger) {
  return {
    ledger: (): TLedger => ledger,
    ingest: (): TRow[] => ledger.products.filter((row) => Boolean(row.ingest)),
  };
}

// ─── Manga Sanctuary ───────────────────────────────────────────────────────

export type MangaSanctuaryPackshot =
  (typeof mangaSanctuaryLedgerJson.products)[number];

const mangaSanctuaryApi = defineLedgerPackshots(mangaSanctuaryLedgerJson);

export function mangaSanctuaryPackshotLedger() {
  return mangaSanctuaryApi.ledger();
}

export function mangaSanctuaryIngestPackshots(): MangaSanctuaryPackshot[] {
  return mangaSanctuaryApi.ingest();
}

// ─── Martina’s Fumetti ─────────────────────────────────────────────────────

export type MartinaPackshot = (typeof martinaLedgerJson.products)[number];

const martinaApi = defineLedgerPackshots(martinaLedgerJson);

export function martinaLedger() {
  return martinaApi.ledger();
}

export function martinaIngestPackshots(): MartinaPackshot[] {
  return martinaApi.ingest();
}

// ─── ToyWiz ────────────────────────────────────────────────────────────────

export type ToywizPackshot = (typeof toywizLedgerJson.products)[number];

const toywizApi = defineLedgerPackshots(toywizLedgerJson);

export function toywizPackshotLedger() {
  return toywizApi.ledger();
}

export function toywizIngestPackshots(): ToywizPackshot[] {
  return toywizApi.ingest();
}

// ─── Atomic Empire ─────────────────────────────────────────────────────────

export type AtomicEmpirePackshot =
  (typeof atomicempireLedgerJson.products)[number];

const atomicempireApi = defineLedgerPackshots(atomicempireLedgerJson);

export function atomicempirePackshotLedger() {
  return atomicempireApi.ledger();
}

export function atomicempireIngestPackshots(): AtomicEmpirePackshot[] {
  return atomicempireApi.ingest();
}

// ─── Emporio di Milo ───────────────────────────────────────────────────────

export type EmporiodimiloPackshot =
  (typeof emporiodimiloLedgerJson.products)[number];

const emporiodimiloApi = defineLedgerPackshots(emporiodimiloLedgerJson);

export function emporiodimiloLedger() {
  return emporiodimiloApi.ledger();
}

export function emporiodimiloIngestPackshots(): EmporiodimiloPackshot[] {
  return emporiodimiloApi.ingest();
}

// ─── Sunny Store ───────────────────────────────────────────────────────────

export type SunnystorePackshot =
  (typeof sunnystoreLedgerJson.products)[number];

export function sunnystorePackshotLedger() {
  return sunnystoreLedgerJson;
}

export function sunnystoreIngestPackshots(): SunnystorePackshot[] {
  return sunnystoreLedgerJson.products.filter(
    (row) => row.ingest && row.role === "art",
  );
}

export function sunnystoreIngestBacks(): SunnystorePackshot[] {
  return sunnystoreLedgerJson.products.filter(
    (row) => row.ingest && row.role === "back",
  );
}

// ─── Manga-News ────────────────────────────────────────────────────────────

export type MangaNewsPackshot =
  (typeof mangaNewsLedgerJson.products)[number];

/** Listing thumbs: `.{name}_medium.jpg` → full `{name}.jpg`. */
export function mangaNewsFullGoodieUrl(url: string): string {
  return url.replace(/\/\.([^/]+)_medium\.(jpe?g|webp)$/i, "/$1.$2");
}

export function mangaNewsPackshotLedger() {
  return mangaNewsLedgerJson;
}

export function mangaNewsIngestPackshots(): MangaNewsPackshot[] {
  return mangaNewsLedgerJson.products.filter((row) => row.ingest);
}

// ─── Kinkai ────────────────────────────────────────────────────────────────

export type KinkaiPackshot = (typeof kinkaiLedgerJson.products)[number];

export function kinkaiPackshotLedger() {
  return kinkaiLedgerJson;
}

export function kinkaiIngestPackshots(): KinkaiPackshot[] {
  return kinkaiLedgerJson.products.filter(
    (row) => row.ingest && row.role === "art",
  );
}

export function kinkaiIngestBacks(): KinkaiPackshot[] {
  return kinkaiLedgerJson.products.filter(
    (row) => row.ingest && row.role === "back",
  );
}

// ─── Vinted ────────────────────────────────────────────────────────────────

export type VintedPackshot = (typeof vintedLedgerJson.products)[number];

export function vintedLedger() {
  return vintedLedgerJson;
}

export function vintedIngestPackshots(): VintedPackshot[] {
  return vintedLedgerJson.products.filter(
    (row) => row.ingest && row.role === "art",
  );
}

export function vintedIngestBacks(): VintedPackshot[] {
  return vintedLedgerJson.products.filter(
    (row) => row.ingest && row.role === "back",
  );
}

// ─── PS Yoyaku tokuten ─────────────────────────────────────────────────────

export type PsYoyakuProduct = (typeof psYoyakuLedgerJson.products)[number];

export function psYoyakuLedger() {
  return psYoyakuLedgerJson;
}

export function psYoyakuIngestPackshots(): PsYoyakuProduct[] {
  return psYoyakuLedgerJson.products.filter((row) => row.ingest);
}

// ─── Graded Card Center ────────────────────────────────────────────────────

export type GradedcardcenterPackshot =
  (typeof gradedcardcenterLedgerJson.products)[number];

export function gradedcardcenterLedger() {
  return gradedcardcenterLedgerJson;
}

export function gradedcardcenterIngestPackshots(): GradedcardcenterPackshot[] {
  return gradedcardcenterLedgerJson.products.filter((row) => row.ingest);
}

/** Drop Cloudflare image transforms; keep the original JPEG object. */
export function gradedcardcenterOriginalUrl(url: string): string {
  return url.replace(/\/cdn-cgi\/image\/[^/]+\//, "/");
}

// ─── eBay ──────────────────────────────────────────────────────────────────

export type EbayPackshot = (typeof ebayLedgerJson.products)[number];
export type EbayFace = (typeof ebayLedgerJson.faces)[number];

export function ebayListingImageFull(url: string): string {
  return url.replace(/\/s-l\d+\.(webp|jpe?g)$/i, "/s-l1600.$1");
}

export function ebayPackshotLedger() {
  return ebayLedgerJson;
}

export function ebayIngestPackshots(): EbayPackshot[] {
  return ebayLedgerJson.products.filter((row) => row.ingest);
}

export function ebayIngestFaces(): EbayFace[] {
  return ebayLedgerJson.faces.filter((row) => row.ingest);
}

// ─── CardGameClub ──────────────────────────────────────────────────────────

export type CardgameclubPackshot =
  (typeof cardgameclubLedgerJson.products)[number];

export function cardgameclubLedger() {
  return cardgameclubLedgerJson;
}

export function cardgameclubIngestPackshots(): CardgameclubPackshot[] {
  return cardgameclubLedgerJson.products.filter((row) => row.ingest);
}

/** Shopify file URLs keep `?v=`; the path without query is the bytes. */
export function cardgameclubImageUrl(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.search = "";
    return parsed.toString();
  } catch {
    return url.split("?")[0] ?? url;
  }
}

// ─── Rakuten ───────────────────────────────────────────────────────────────

export type RakutenPackshot = (typeof rakutenLedgerJson.products)[number];
export type RakutenFace = (typeof rakutenLedgerJson.faces)[number];

export function rakutenPackshotLedger() {
  return rakutenLedgerJson;
}

export function rakutenFaceLedger() {
  return rakutenLedgerJson;
}

export function rakutenIngestPackshots(): RakutenPackshot[] {
  return rakutenLedgerJson.products.filter(
    (row) => row.ingest && row.role === "art",
  );
}

export function rakutenIngestFaces(): RakutenFace[] {
  return (rakutenLedgerJson.faces ?? []).filter((row) => row.ingest);
}

// ─── Tric Trac ─────────────────────────────────────────────────────────────

export type TrictracPackshot = (typeof trictracLedgerJson.products)[number];

export function trictracCdnOriginal(url: string): string {
  try {
    const parsed = new URL(url, "https://trictrac.net");
    if (parsed.pathname === "/_next/image") {
      const inner = parsed.searchParams.get("url");
      if (inner) return inner;
    }
  } catch {
    /* keep */
  }
  return url;
}

export function trictracLedger() {
  return trictracLedgerJson;
}

export function trictracIngestPackshots(): TrictracPackshot[] {
  return trictracLedgerJson.products.filter((row) => row.ingest);
}

// ─── Leboncoin ─────────────────────────────────────────────────────────────

export type LeboncoinPackshot =
  (typeof leboncoinLedgerJson.products)[number];

export function leboncoinPackshotLedger() {
  return leboncoinLedgerJson;
}

export function leboncoinIngestPackshots(): LeboncoinPackshot[] {
  return leboncoinLedgerJson.products.filter(
    (row) => row.ingest && row.role === "art",
  );
}

export function leboncoinIngestBacks(): LeboncoinPackshot[] {
  return leboncoinLedgerJson.products.filter(
    (row) => row.ingest && row.role === "back",
  );
}

/** Prefer classified 1200×800 for tin / packaging (ad-large is smaller). */
export function leboncoinPackshotImageFull(url: string): string {
  if (/[?&]rule=/.test(url)) {
    return url.replace(/([?&]rule=)[^&]+/, "$1classified-1200x800-jpg");
  }
  const join = url.includes("?") ? "&" : "?";
  return `${url}${join}rule=classified-1200x800-jpg`;
}

// ─── Goat EN CCG display boxes ─────────────────────────────────────────────

const GOAT_COLEKA_GAPS = ["s16", "s19", "s21", "s22", "s23", "s27"] as const;

const GOAT_GAP_TITLES: Record<(typeof GOAT_COLEKA_GAPS)[number], string> = {
  s16: "Broken Promises",
  s19: "Path of Pain",
  s21: "Shattered Truth",
  s22: "Weapons of War",
  s23: "Invasion",
  s27: "Hero's Ascension",
};

type GoatLedgerProduct =
  (typeof goatLedgerJson.sealed.boosterBoxes.products)[number];

export type GoatDisplayPackshot = {
  slug: string;
  staging: string;
  url: string;
  setCode: string;
  title: string;
};

/** @deprecated Prefer {@link GoatDisplayPackshot}. */
export type GoatGapPackshot = GoatDisplayPackshot;

export function goatPackshotLedger() {
  return goatLedgerJson;
}

/** Shop listing thumbs insert `/medium/`; the catalogue wants the original. */
export function goatCdnOriginal(url: string): string {
  return url.replace(/\/medium\//, "/");
}

function goatStagingExt(row: GoatLedgerProduct): string {
  if ("bytes" in row && row.bytes === "gif89a") return "gif";
  const img = typeof row.img === "string" ? row.img : "";
  const match = /\.(jpe?g|png|gif|webp)$/i.exec(img);
  if (!match) return "jpg";
  const ext = match[1]!.toLowerCase();
  return ext === "jpeg" ? "jpg" : ext;
}

function goatDisplayTitle(row: GoatLedgerProduct, setCode: string): string {
  const gapTitle =
    GOAT_GAP_TITLES[setCode as (typeof GOAT_COLEKA_GAPS)[number]];
  if (gapTitle) return gapTitle;
  const raw = typeof row.title === "string" ? row.title : "";
  return raw.replace(/\s+Booster Box$/i, "").trim() || setCode;
}

/** Tous les display-box Goat avec photo CDN — dump `art.goat`, moteur choisit. */
export function goatIngestPackshots(): GoatDisplayPackshot[] {
  const rows: GoatDisplayPackshot[] = [];
  const seen = new Set<string>();
  for (const row of goatLedgerJson.sealed.boosterBoxes.products) {
    if (row.kind !== "display-box") continue;
    if (row.photo !== "cdn") continue;
    const setCode = row.setCode;
    if (!setCode || typeof setCode !== "string") continue;
    if (typeof row.img !== "string" || !row.img.trim()) continue;
    if (seen.has(setCode)) continue;
    seen.add(setCode);
    const ext = goatStagingExt(row);
    rows.push({
      slug: `display-${setCode}`,
      staging: `staging/goat-en-boxes/${setCode}.${ext}`,
      url: row.img,
      setCode,
      title: goatDisplayTitle(row, setCode),
    });
  }
  return rows.sort((a, b) =>
    a.setCode.localeCompare(b.setCode, undefined, { numeric: true }),
  );
}

/** SKU display à minter faute de cover Coleka — pas un filtre d'archive. */
export function goatMintDisplayPackshots(): GoatDisplayPackshot[] {
  const gaps = new Set<string>(GOAT_COLEKA_GAPS);
  return goatIngestPackshots().filter((row) => gaps.has(row.setCode));
}

// ─── Via Ludibunda Magento packshots ─────────────────────────────────────

export type VialudibundaProduct = (typeof vialudibundaLedgerJson.products)[number];

const MAGENTO_CACHE =
  /\/media\/catalog\/product\/cache\/[^/]+\/[^/]+\/\d+x\d+\/[a-f0-9]+(\/.+)$/i;

export function magentoCatalogOriginal(url: string): string {
  const match = MAGENTO_CACHE.exec(url);
  if (!match) return url;
  return url.replace(MAGENTO_CACHE, "/media/catalog/product$1");
}

export function vialudibundaLedger() {
  return vialudibundaLedgerJson;
}

export function vialudibundaIngestPackshots(): VialudibundaProduct[] {
  return vialudibundaLedgerJson.products.filter((row) => row.ingest);
}

// ─── SciFi-Universe packshots ────────────────────────────────────────────

export type ScifiUniverseProduct = (typeof scifiUniverseLedgerJson.products)[number];

export type ScifiUniversePackshot = ScifiUniverseProduct & {
  ingest: true;
  staging: string;
};

export function scifiUniverseLedger() {
  return scifiUniverseLedgerJson;
}

export function scifiUniverseIngestPackshots(): ScifiUniversePackshot[] {
  return scifiUniverseLedgerJson.products.filter(
    (row): row is ScifiUniversePackshot =>
      row.ingest === true &&
      "staging" in row &&
      typeof row.staging === "string",
  );
}

// ─── Coleka EN CCG covers ────────────────────────────────────────────────

export type ColekaEnCcgCover = (typeof colekaEnCcgCoversLedgerJson.covers)[number];

/** Coleka serves `_120x120` / `_300x300` thumbs; the catalogue wants the full webp. */
export function colekaThumbToFull(url: string): string {
  return url.replace(/_\d+x\d+\.webp$/i, ".webp");
}

/** Covers that become a display SKU, excluding s28 (already coleka-s28). */
export function colekaEnCcgNewDisplays(): ColekaEnCcgCover[] {
  return colekaEnCcgCoversLedgerJson.covers.filter(
    (row) => row.sku.startsWith("display-") && row.set !== "s28",
  );
}

export function colekaEnCcgCoverLedger() {
  return colekaEnCcgCoversLedgerJson;
}

/** Full Coleka webp for the Carddass FR branch — never the `_300x300` thumb. */
export function colekaCarddassFrBranchCoverUrl(): string {
  const row = colekaEnCcgCoversLedgerJson.skip.find(
    (item) => item.kind === "carddass-fr-branch",
  );
  const raw = row && "url" in row && typeof row.url === "string" ? row.url : "";
  return colekaThumbToFull(raw);
}

// ─── Bandai FR/US Drive packshots ────────────────────────────────────────

export type BandaiFrUsDriveProduct =
  (typeof bandaiFrUsDriveLedgerJson.products)[number];

const DRIVE_NEW_EN_DISPLAYS = [
  "s7",
  "s8",
  "s9",
  "s10",
  "s11",
  "s12",
] as const;

const DRIVE_DISPLAY_TITLES: Record<
  (typeof DRIVE_NEW_EN_DISPLAYS)[number],
  string
> = {
  s7: "Quest for Power",
  s8: "Battle of Destiny",
  s9: "The Chosen",
  s10: "Lineage of the Legends",
  s11: "Approching Wind",
  s12: "A New Chronicle",
};

export function bandaiFrUsDriveLedger() {
  return bandaiFrUsDriveLedgerJson;
}

export function bandaiFrUsDriveIngestPackshots(): BandaiFrUsDriveProduct[] {
  return bandaiFrUsDriveLedgerJson.products.filter(
    (row) => row.ingest && typeof row.slug === "string" && Boolean(row.staging),
  );
}

/**
 * EN display boxes s7–s12 attested by the Drive album — Coleka/Goat start at
 * s13 / Coleka-gap fills. Packshots live under staging; no CDN URL.
 */
export function bandaiFrUsDriveNewEnDisplays(): Array<{
  set: (typeof DRIVE_NEW_EN_DISPLAYS)[number];
  title: string;
}> {
  const held = new Set(
    bandaiFrUsDriveIngestPackshots()
      .filter((row) => row.kind === "display" && row.slug?.startsWith("display-"))
      .map((row) => row.setCode)
      .filter(Boolean),
  );
  return DRIVE_NEW_EN_DISPLAYS.filter((set) => held.has(set)).map((set) => ({
    set,
    title: DRIVE_DISPLAY_TITLES[set],
  }));
}
