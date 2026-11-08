/**
 * Dig → openable citation for Carddass print facts.
 * Only stamps URLs already curated in research digs (never invented hubs).
 */

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { sanitizePublicCitationUrl } from "@/core/enrich/citations/publicCitationUrl";

import { narutoNumbersEqual } from "../identity";
import { narutoCuratedSourcesDir } from "../install/curated";

type YoutubeChapterMap = Record<string, string>;

type YoutubeDigVideo = {
  id?: string;
  url?: string;
  chapters?: YoutubeChapterMap;
};

type YoutubeDigFile = {
  videos?: readonly YoutubeDigVideo[];
  sealedFrCarddass?: {
    attestedNow?: readonly { slug?: string; claim?: string }[];
  };
  serie6Fr?: { claim?: string };
  prerelease?: {
    claim?: string;
    fullTen?: readonly string[];
  };
  promos?: {
    shuriken?: Record<string, string>;
    lists?: Record<string, readonly string[]>;
    examples?: Record<
      string,
      { number?: string; note?: string; name?: string }
    >;
    tinInvocation?: string;
    tinHobby?: string;
  };
};

type KanaTomeRow = {
  tome?: number;
  number?: string;
  name?: string;
  kind?: string;
};

type KanaMangaDigFile = {
  kind?: string;
  verdict?: string;
  officialAnnouncement?: { wayback?: string; claim?: string };
  forumMirrors?: readonly { url?: string }[];
  tomeMapping?: readonly KanaTomeRow[];
};

type YoutubeGapsFinding = {
  id?: string;
  url?: string;
  claim?: string;
  official?: { url?: string };
  mapsTo?: string;
};

type YoutubeGapsDigFile = {
  kind?: string;
  findings?: readonly YoutubeGapsFinding[];
};

type FacebookCardVisible = {
  number?: string | null;
};

type FacebookInsertRow = {
  kind?: string;
  number?: string | null;
  nameFr?: string;
};

type FacebookPrintRow = {
  printedRef?: string;
  printKey?: string;
  number?: string;
  channelHint?: string;
};

type FacebookPackshotAttestation = {
  id?: string;
  product?: string;
  /** Packaging / sticker prose from the dig (never invent). */
  labelText?: string;
  postPermalink?: string;
  photoUrl?: string;
  photoUrlAlbum?: string;
  cardsVisible?: readonly FacebookCardVisible[];
  inserts?: readonly (string | FacebookInsertRow)[];
  prints?: readonly FacebookPrintRow[];
};

type FacebookPostThread = {
  author?: string;
  claim?: string;
};

type FacebookPost = {
  id?: string;
  permalink?: string;
  summary?: string;
  thread?: readonly FacebookPostThread[];
};

type FacebookDigFile = {
  kind?: string;
  packshotAttestations?: readonly FacebookPackshotAttestation[];
  posts?: readonly FacebookPost[];
};

type Uns3Channel = {
  promo?: string;
  printKey?: string;
  official?: string;
  press?: readonly string[];
  claim?: string;
  sku?: string;
};

type Uns3DigFile = {
  kind?: string;
  channelMap?: {
    dayOneGame?: Uns3Channel;
    kanaJapanExpo2013MangaCard?: Uns3Channel;
    retailDuopack?: {
      slug?: string;
      promoWindow?: string;
      printKey?: string;
      contents?: string;
    };
  };
  duopack?: {
    slug?: string;
    attestations?: readonly { id?: string; url?: string; note?: string }[];
  };
};

type QtyHuntDigFile = {
  kind?: string;
  sources?: readonly {
    id?: string;
    slug?: string;
    url?: string;
    finding?: string;
  }[];
};

/** Generic sealed-hunt dig shapes (ES / IT packshot + listing digs). */
type SealedHuntDigFile = {
  kind?: string;
  sources?: readonly { id?: string; url?: string }[];
  skuMapping?: Record<string, unknown>;
  listings?: readonly {
    sku?: string;
    url?: string;
    claim?: string;
    title?: string;
  }[];
  found?: readonly {
    sku?: string;
    listing?: string;
    title?: string;
    claim?: string;
  }[];
  attestations?: Record<string, { url?: string } | undefined>;
};

type S5Pass3DigFile = {
  kind?: string;
  newSourcesEvaluated?: readonly {
    id?: string;
    url?: string;
    urls?: readonly string[];
    finding?: string;
  }[];
};

export type SealedDistributionCitation = {
  label: string;
  url: string;
};

export type ProductInsertCitation = {
  /** Distinct from Distribution so multiple channels survive collapse. */
  label: string;
  value: string;
  url: string;
};

/** @deprecated alias — Insert DVD / jeu / duopack share the same shape. */
export type DvdInsertCitation = ProductInsertCitation;

let youtubeCache: YoutubeDigFile | null | undefined;
let kanaCache: KanaMangaDigFile | null | undefined;
let youtubeGapsCache: YoutubeGapsDigFile | null | undefined;
let facebookCache: FacebookDigFile | null | undefined;
let uns3Cache: Uns3DigFile | null | undefined;
let sealedHuntBySlug:
  | Map<string, SealedDistributionCitation>
  | null
  | undefined;
let sealedHuntStoryBySlug: Map<string, DigStoryFact> | null | undefined;
let s5Pass3Cache: S5Pass3DigFile | null | undefined;
let detruireKonohaCache: QtyHuntDigFile | null | undefined;

export function resetNarutoDigCitationCaches(): void {
  youtubeCache = undefined;
  kanaCache = undefined;
  youtubeGapsCache = undefined;
  facebookCache = undefined;
  uns3Cache = undefined;
  sealedHuntBySlug = undefined;
  sealedHuntStoryBySlug = undefined;
  s5Pass3Cache = undefined;
  detruireKonohaCache = undefined;
}

function youtubeDigPath(): string {
  return path.join(
    narutoCuratedSourcesDir(),
    "collection-naruto-youtube-2026-08-29.json",
  );
}

function kanaDigPath(): string {
  return path.join(narutoCuratedSourcesDir(), "kana-manga-blister-2008.json");
}

function youtubeGapsDigPath(): string {
  return path.join(
    narutoCuratedSourcesDir(),
    "youtube-gaps-web-hunt-2026-08-29.json",
  );
}

function facebookDigPath(): string {
  return path.join(
    narutoCuratedSourcesDir(),
    "facebook-naruto-collection-france-2026-09-02.json",
  );
}

function uns3DigPath(): string {
  return path.join(narutoCuratedSourcesDir(), "uns3-eu-promos-hunt.json");
}

function s5Pass3DigPath(): string {
  return path.join(
    narutoCuratedSourcesDir(),
    "s5-starter-qty-web-hunt-pass3-2026-10-01.json",
  );
}

function detruireKonohaDigPath(): string {
  return path.join(
    narutoCuratedSourcesDir(),
    "detruire-konoha-qty-web-hunt-2026-09-13.json",
  );
}

function loadDetruireKonohaDig(): QtyHuntDigFile | null {
  if (detruireKonohaCache !== undefined) return detruireKonohaCache;
  try {
    if (!existsSync(detruireKonohaDigPath())) {
      detruireKonohaCache = null;
      return null;
    }
    const raw = JSON.parse(
      readFileSync(detruireKonohaDigPath(), "utf8"),
    ) as QtyHuntDigFile;
    detruireKonohaCache = raw?.kind === "research-dig" ? raw : null;
  } catch {
    detruireKonohaCache = null;
  }
  return detruireKonohaCache;
}

function detruireKonohaUltrajeuxSource(slug: string): {
  url: string;
  finding: string;
} | null {
  const dig = loadDetruireKonohaDig();
  const key = slug.trim().toLowerCase();
  const row =
    dig?.sources?.find(
      (entry) => entry.slug?.trim().toLowerCase() === key,
    ) ??
    (key === "starter-detruire-konoha"
      ? dig?.sources?.find((entry) => entry.id === "ultrajeux-fiche")
      : undefined);
  const url = sanitizePublicCitationUrl(row?.url);
  const finding = row?.finding?.trim() || "";
  if (!url || !finding) return null;
  return { url, finding };
}

function uns3DuopackAttestationUrl(): string | null {
  const dig = loadUns3Dig();
  const rows = dig?.duopack?.attestations ?? [];
  const preferred = [
    rows.find((row) => /kinkai/i.test(row.id ?? "")),
    rows.find((row) => /ebay-alexma-287499390775/i.test(row.id ?? "")),
    ...rows,
  ];
  for (const row of preferred) {
    const url = sanitizePublicCitationUrl(row?.url);
    if (url) return url;
  }
  return null;
}

function loadS5Pass3Dig(): S5Pass3DigFile | null {
  if (s5Pass3Cache !== undefined) return s5Pass3Cache;
  try {
    if (!existsSync(s5Pass3DigPath())) {
      s5Pass3Cache = null;
      return null;
    }
    const raw = JSON.parse(
      readFileSync(s5Pass3DigPath(), "utf8"),
    ) as S5Pass3DigFile;
    s5Pass3Cache = raw?.kind === "research-dig" ? raw : null;
  } catch {
    s5Pass3Cache = null;
  }
  return s5Pass3Cache;
}

/**
 * FR S5 sealed — joueur.ch / Parence dig URLs, then official checklist PDF.
 */
function s5FrSealedDistributionCitation(
  key: string,
): SealedDistributionCitation | null {
  const dig = loadS5Pass3Dig();
  const sources = dig?.newSourcesEvaluated ?? [];

  if (key === "starter-la-quete" || key === "starter-un-nouveau-depart") {
    const joueur = sources.find((row) => row.id === "joueur-ch-2026-10-recheck");
    const urls = joueur?.urls ?? [];
    const pick =
      key === "starter-la-quete"
        ? urls.find((u) => /la-quete/i.test(u))
        : urls.find((u) => /nouveau-depart/i.test(u));
    const url = sanitizePublicCitationUrl(pick);
    if (url) {
      return { label: canalLabelForCitationUrl(url, "Canal — joueur.ch"), url };
    }
  }

  if (key === "booster-s5") {
    const parence = sources.find((row) => row.id === "parence-sku-map-s5");
    const pick = parence?.urls?.find((u) => /booster-naruto-serie-5/i.test(u));
    const url = sanitizePublicCitationUrl(pick);
    if (url) {
      return { label: canalLabelForCitationUrl(url, "Canal — Parence"), url };
    }
  }

  if (
    key === "starter-la-quete" ||
    key === "starter-un-nouveau-depart" ||
    key === "booster-s5"
  ) {
    const url = sanitizePublicCitationUrl(
      "http://www.carddass.fr/naruto/pdf/checklist_naruto_S5.pdf",
    );
    if (url) {
      return { label: "Checklist Série 5 (carddass.fr)", url };
    }
  }

  return null;
}

const SEALED_HUNT_DIG_FILES = [
  "es-carddass-s3-hunt-2026-08-29.json",
  "en-ccg-tp3-hunt-2026-08-29.json",
  "en-ccg-s5-dream-legacy-hunt-2026-08-29.json",
  "s6-it-sealed-hunt-2026-08-29.json",
  "it-s7-s8-packshot-hunt-2026-08-29.json",
  "it-sealed-sku-hunt-2026-09-03.json",
  "ebay-tin-metal-hunt-2026-08-29.json",
] as const;

function canalLabelForCitationUrl(url: string, fallback: string): string {
  try {
    const host = new URL(url).hostname.replace(/^www\./i, "").toLowerCase();
    if (host.includes("sunnystore")) return "Canal — Sunny Store (ES)";
    if (host.includes("ebay.")) return "Canal — eBay (packshot attesté)";
    if (host.includes("vinted.")) return "Canal — Vinted (scellé attesté)";
    if (host.includes("madhouse.")) return "Canal — Madhouse (IT)";
    if (host.includes("emporiodimilo")) return "Canal — Emporio Di Milo (IT)";
    if (host.includes("joueur.ch")) return "Canal — joueur.ch (scellé FR)";
    if (host.includes("parence.")) return "Canal — Parence (Wayback)";
    if (host.includes("ultrajeux.")) return "Canal — UltraJeux";
    if (host.includes("kinkai.")) return "Canal — Kinkai";
  } catch {
    /* fall through */
  }
  return fallback;
}

function rememberSealedHunt(
  map: Map<string, SealedDistributionCitation>,
  slug: string | null | undefined,
  urlRaw: string | null | undefined,
  fallbackLabel: string,
): void {
  const key = slug?.trim().toLowerCase() || "";
  const url = sanitizePublicCitationUrl(urlRaw);
  if (!key || !url || map.has(key)) return;
  map.set(key, {
    label: canalLabelForCitationUrl(url, fallbackLabel),
    url,
  });
}

function loadSealedHuntMaps(): {
  citations: Map<string, SealedDistributionCitation>;
  stories: Map<string, DigStoryFact>;
} {
  if (sealedHuntBySlug && sealedHuntStoryBySlug) {
    return { citations: sealedHuntBySlug, stories: sealedHuntStoryBySlug };
  }
  const map = new Map<string, SealedDistributionCitation>();
  const stories = new Map<string, DigStoryFact>();
  for (const file of SEALED_HUNT_DIG_FILES) {
    const digPath = path.join(narutoCuratedSourcesDir(), file);
    try {
      if (!existsSync(digPath)) continue;
      const raw = JSON.parse(
        readFileSync(digPath, "utf8"),
      ) as SealedHuntDigFile;
      if (raw?.kind !== "research-dig") continue;

      for (const [sku] of Object.entries(raw.skuMapping ?? {})) {
        const source = raw.sources?.find(
          (row) =>
            row.id?.toLowerCase().includes(sku.toLowerCase()) ||
            row.id?.toLowerCase().endsWith(sku.toLowerCase()),
        );
        rememberSealedHunt(
          map,
          sku,
          source?.url,
          `Canal — dig ${sku}`,
        );
      }

      for (const listing of raw.listings ?? []) {
        rememberSealedHunt(
          map,
          listing.sku,
          listing.url,
          listing.title?.trim()
            ? `Canal — ${listing.title.trim()}`
            : `Canal — dig ${listing.sku ?? "sealed"}`,
        );
        const key = listing.sku?.trim().toLowerCase() || "";
        const claim = listing.claim?.trim() || "";
        const url = sanitizePublicCitationUrl(listing.url);
        if (key && claim && url && !stories.has(key)) {
          stories.set(key, makeStoryFact(claim, url, 26));
        }
      }

      for (const row of raw.found ?? []) {
        rememberSealedHunt(
          map,
          row.sku,
          row.listing,
          row.title?.trim()
            ? `Canal — ${row.title.trim()}`
            : `Canal — dig ${row.sku ?? "sealed"}`,
        );
        const key = row.sku?.trim().toLowerCase() || "";
        const claim = row.claim?.trim() || "";
        const url = sanitizePublicCitationUrl(row.listing);
        if (key && claim && url && !stories.has(key)) {
          stories.set(key, makeStoryFact(claim, url, 26));
        }
      }

      const madhouse = raw.attestations?.madhouseS7?.url;
      rememberSealedHunt(
        map,
        "booster-s7-it",
        madhouse,
        "Canal — Madhouse (IT)",
      );
    } catch {
      /* skip bad dig */
    }
  }
  sealedHuntBySlug = map;
  sealedHuntStoryBySlug = stories;
  return { citations: map, stories };
}

function loadSealedHuntBySlug(): Map<string, SealedDistributionCitation> {
  return loadSealedHuntMaps().citations;
}

function loadSealedHuntStoryBySlug(): Map<string, DigStoryFact> {
  return loadSealedHuntMaps().stories;
}

function loadYoutubeDig(): YoutubeDigFile | null {
  if (youtubeCache !== undefined) return youtubeCache;
  try {
    if (!existsSync(youtubeDigPath())) {
      youtubeCache = null;
      return null;
    }
    youtubeCache = JSON.parse(
      readFileSync(youtubeDigPath(), "utf8"),
    ) as YoutubeDigFile;
  } catch {
    youtubeCache = null;
  }
  return youtubeCache;
}

function loadKanaDig(): KanaMangaDigFile | null {
  if (kanaCache !== undefined) return kanaCache;
  try {
    if (!existsSync(kanaDigPath())) {
      kanaCache = null;
      return null;
    }
    const raw = JSON.parse(
      readFileSync(kanaDigPath(), "utf8"),
    ) as KanaMangaDigFile;
    kanaCache =
      raw?.kind === "research-dig" && raw.verdict === "confirmed" ? raw : null;
  } catch {
    kanaCache = null;
  }
  return kanaCache;
}

function loadYoutubeGapsDig(): YoutubeGapsDigFile | null {
  if (youtubeGapsCache !== undefined) return youtubeGapsCache;
  try {
    if (!existsSync(youtubeGapsDigPath())) {
      youtubeGapsCache = null;
      return null;
    }
    youtubeGapsCache = JSON.parse(
      readFileSync(youtubeGapsDigPath(), "utf8"),
    ) as YoutubeGapsDigFile;
  } catch {
    youtubeGapsCache = null;
  }
  return youtubeGapsCache;
}

function findingById(id: string): YoutubeGapsFinding | null {
  const dig = loadYoutubeGapsDig();
  return dig?.findings?.find((row) => row.id === id) ?? null;
}

function loadFacebookDig(): FacebookDigFile | null {
  if (facebookCache !== undefined) return facebookCache;
  try {
    if (!existsSync(facebookDigPath())) {
      facebookCache = null;
      return null;
    }
    const raw = JSON.parse(
      readFileSync(facebookDigPath(), "utf8"),
    ) as FacebookDigFile;
    facebookCache = raw?.kind === "research-dig" ? raw : null;
  } catch {
    facebookCache = null;
  }
  return facebookCache;
}

function loadUns3Dig(): Uns3DigFile | null {
  if (uns3Cache !== undefined) return uns3Cache;
  try {
    if (!existsSync(uns3DigPath())) {
      uns3Cache = null;
      return null;
    }
    const raw = JSON.parse(readFileSync(uns3DigPath(), "utf8")) as Uns3DigFile;
    uns3Cache = raw?.kind === "research-dig" ? raw : null;
  } catch {
    uns3Cache = null;
  }
  return uns3Cache;
}

function firstOpenable(...candidates: Array<string | null | undefined>): string | null {
  for (const candidate of candidates) {
    const url = sanitizePublicCitationUrl(candidate);
    if (url) return url;
  }
  return null;
}

function uns3PromoMatchesNumber(
  channel: Uns3Channel | undefined,
  needle: string,
): boolean {
  if (!channel) return false;
  if (channel.promo && narutoNumbersEqual(channel.promo, needle)) return true;
  const pk = channel.printKey?.trim().toLowerCase() || "";
  if (!pk) return false;
  const tail = pk.split(":").pop() ?? "";
  const collector = tail.replace(/^promo-/, "").replace(/^pr-?/, "pr");
  return (
    narutoNumbersEqual(collector, needle) ||
    narutoNumbersEqual(tail.replace(/[^a-z0-9]/gi, ""), needle)
  );
}

/**
 * UNS3 EU promo dig — official / press Distribution (Kana JE 2013, Day One).
 * Prefer these over FB binder alone when the dig stamps an openable URL.
 */
export function uns3PromoDistributionCitationForNumber(
  number: string | null | undefined,
): SealedDistributionCitation | null {
  const needle = number?.trim();
  if (!needle) return null;
  const dig = loadUns3Dig();
  const map = dig?.channelMap;
  if (!map) return null;

  if (uns3PromoMatchesNumber(map.kanaJapanExpo2013MangaCard, needle)) {
    const url = firstOpenable(
      map.kanaJapanExpo2013MangaCard?.official,
      ...(map.kanaJapanExpo2013MangaCard?.press ?? []),
    );
    if (!url) return null;
    return {
      label: "Canal — Kana Japan Expo 2013 (tome → carte)",
      url,
    };
  }

  if (uns3PromoMatchesNumber(map.dayOneGame, needle)) {
    const url = firstOpenable(...(map.dayOneGame?.press ?? []));
    if (!url) return null;
    return {
      label: "Canal — UNS3 Day One Edition (EU)",
      url,
    };
  }

  return null;
}

/** Dig-attested storytelling body — never invent prose beyond the dig claim. */
export const STORY_FACT_KIND = "story";
export const STORY_FACT_LABEL = "Le saviez-vous ?";

export type DigStoryFact = {
  kind: typeof STORY_FACT_KIND;
  label: typeof STORY_FACT_LABEL;
  value: string;
  url: string;
  confidence: number;
  priority: number;
};

function makeStoryFact(
  value: string,
  url: string,
  priority = 28,
): DigStoryFact {
  return {
    kind: STORY_FACT_KIND,
    label: STORY_FACT_LABEL,
    value,
    url,
    confidence: 0.85,
    priority,
  };
}

/**
 * UNS3 dig → shelf storytelling (PR-093 claim ; PR-095 packshot label ;
 * PR-096 retail duopack contents). Dig prose only.
 */
export function uns3StoryFactForNumber(
  number: string | null | undefined,
): DigStoryFact | null {
  const needle = number?.trim();
  if (!needle) return null;
  const map = loadUns3Dig()?.channelMap;
  if (!map) return null;

  const kana = map.kanaJapanExpo2013MangaCard;
  if (uns3PromoMatchesNumber(kana, needle)) {
    const claim = kana?.claim?.trim();
    const url = firstOpenable(kana?.official, ...(kana?.press ?? []));
    if (claim && url) return makeStoryFact(claim, url, 28);
  }

  if (uns3PromoMatchesNumber(map.dayOneGame, needle)) {
    const xbox = facebookAttestationForSealedSlug("xbox360-uns3");
    const claim = xbox?.labelText?.trim() || "";
    const url =
      firstOpenable(...(map.dayOneGame?.press ?? [])) ??
      (xbox ? facebookAttestationProofUrlOrAlbum(xbox) : null) ??
      facebookDigFallbackPermalink();
    if (claim && url) return makeStoryFact(claim, url, 27);
  }

  const retail = map.retailDuopack;
  if (
    retail?.promoWindow &&
    narutoNumbersEqual(retail.promoWindow, needle)
  ) {
    const claim = retail.contents?.trim() || "";
    const url =
      uns3DuopackAttestationUrl() ??
      facebookDigFallbackPermalink() ??
      (retail.slug
        ? narutoSealedDistributionCitation(retail.slug)?.url ?? null
        : null);
    if (claim && url) return makeStoryFact(claim, url, 27);
  }

  return null;
}

function youtubeInventoryUrlAtStamp(stamp: string): string | null {
  return youtubeUrlAtChapter(
    "https://www.youtube.com/watch?v=JYwlXQQlooI",
    stamp,
  );
}

/**
 * Sealed SKU dig claims (Pack Découverte, Tin Box Hobby / Collector…) —
 * dig prose only.
 */
export function narutoStoryFactsForSealedSlug(
  slug: string | null | undefined,
): DigStoryFact[] {
  const key = slug?.trim().toLowerCase() || "";
  if (!key) return [];
  const dig = loadYoutubeDig();
  const row = dig?.sealedFrCarddass?.attestedNow?.find(
    (entry) => entry.slug?.trim().toLowerCase() === key,
  );
  let claim = row?.claim?.trim() || "";
  let url =
    narutoSealedDistributionCitation(key)?.url ??
    (key === "pack-decouverte"
      ? youtubeInventoryUrlAtStamp("01:05")
      : key === "tin-box-hobby"
        ? youtubeInventoryUrlAtStamp("11:20")
        : null);

  if (!claim && key === "tin-box") {
    const finding = findingById("tin-box-sfu-noel-2007");
    claim = finding?.claim?.trim() || "";
    url =
      firstOpenable(finding?.url) ??
      narutoSealedDistributionCitation(key)?.url ??
      null;
  }

  if (!claim && key === "duopack-s28") {
    const retail = loadUns3Dig()?.channelMap?.retailDuopack;
    const contents = retail?.contents?.trim() || "";
    const proof =
      uns3DuopackAttestationUrl() ??
      facebookDigFallbackPermalink() ??
      narutoSealedDistributionCitation(key)?.url ??
      null;
    if (contents && proof) return [makeStoryFact(contents, proof, 26)];
  }

  if (
    !claim &&
    (key === "starter-detruire-konoha" || key === "starter-sceller-le-malefice")
  ) {
    const ultra = detruireKonohaUltrajeuxSource(key);
    if (ultra) return [makeStoryFact(ultra.finding, ultra.url, 26)];
  }

  if (!claim && key === "kana-manga-pack-1-2-3") {
    const prereleaseClaim = dig?.prerelease?.claim?.trim() || "";
    const proof =
      narutoPrereleaseDistributionCitationUrl() ??
      narutoSealedDistributionCitation(key)?.url ??
      null;
    if (prereleaseClaim && proof) {
      return [makeStoryFact(prereleaseClaim, proof, 26)];
    }
  }

  if (!claim && key === "kana-dvd-shippuden-vol21") {
    const fb = facebookDvdStoryForNumber("pr100");
    if (fb) return [fb];
  }
  if (!claim && key === "kana-dvd-naruto-vol15") {
    const fb = facebookDvdStoryForNumber("ni236");
    if (fb) return [fb];
  }

  if (!claim) {
    const packshot = facebookPackshotLabelStoryForSlug(key);
    if (packshot) return [packshot];
  }

  if (!claim) {
    const huntStory = loadSealedHuntStoryBySlug().get(key);
    if (huntStory) return [huntStory];
  }

  if (!claim || !url) return [];
  return [makeStoryFact(claim, url, 27)];
}

/**
 * Facebook packshot dig `labelText` → sealed storytelling (DVD / jeu inserts).
 */
function facebookPackshotLabelStoryForSlug(
  slug: string,
): DigStoryFact | null {
  const row = facebookAttestationForSealedSlug(slug);
  const claim = row?.labelText?.trim() || "";
  if (!claim || !row) return null;
  const url =
    facebookAttestationProofUrlOrAlbum(row) ??
    (slug.startsWith("kana-dvd-")
      ? youtubeInventoryUrlAtStamp("10:02")
      : null);
  if (!url) return null;
  return makeStoryFact(claim, url, 26);
}

/**
 * Facebook dig posts — DVD insert storytelling (PR-100 vol.21, NI-236 vol.15).
 * Dig summary / Victor claim only — never invent.
 */
function facebookDvdStoryForNumber(number: string): DigStoryFact | null {
  const dig = loadFacebookDig();
  if (!dig?.posts?.length) return null;

  if (narutoNumbersEqual(number, "pr100")) {
    const post = dig.posts.find(
      (row) => row.id === "cyrielle-promo-shippuden-vol21",
    );
    const claim =
      post?.thread?.find((row) => row.claim?.trim())?.claim?.trim() || "";
    const url = firstOpenable(post?.permalink);
    if (claim && url) return makeStoryFact(claim, url, 27);
  }

  if (narutoNumbersEqual(number, "ni236")) {
    const post = dig.posts.find((row) => row.id === "victor-ni236-dvd-vol15");
    const claim = post?.summary?.trim() || "";
    const url = firstOpenable(post?.permalink);
    if (claim && url) return makeStoryFact(claim, url, 26);
  }

  return null;
}

/**
 * Facebook dig — S6 FR MIJ / DVD commons (jordan-blue-back thread).
 * Prefer over YT serie6Fr when permalink + Victor claim are present.
 */
function facebookSerie6MijStoryFact(): DigStoryFact | null {
  const dig = loadFacebookDig();
  const post = dig?.posts?.find(
    (row) => row.id === "jordan-blue-back-made-in-japan",
  );
  const claim =
    post?.thread?.find((row) => row.claim?.trim())?.claim?.trim() || "";
  const url = firstOpenable(post?.permalink);
  if (!claim || !url) return null;
  return makeStoryFact(claim, url, 25);
}

function binderWalkthroughUrl(): string | null {
  const dig = loadYoutubeDig();
  const video = dig?.videos?.find((row) => row.id === "7r7LwtIENKs");
  return (
    sanitizePublicCitationUrl(video?.url) ??
    sanitizePublicCitationUrl("https://www.youtube.com/watch?v=7r7LwtIENKs")
  );
}

/**
 * Tournament shuriken / tin promo dig notes (Collection Naruto 7r7 lists).
 */
function tournamentOrTinPromoStoryFact(
  number: string,
): DigStoryFact | null {
  const dig = loadYoutubeDig();
  const promos = dig?.promos;
  if (!promos) return null;
  const url = binderWalkthroughUrl();
  if (!url) return null;

  if (narutoNumbersEqual(number, "pr016") || /pr0*16\b/i.test(number)) {
    const claim = promos.tinInvocation?.trim();
    if (claim) return makeStoryFact(claim, url, 27);
  }
  if (narutoNumbersEqual(number, "pr011") || /pr0*11\b/i.test(number)) {
    const claim = promos.tinHobby?.trim();
    if (claim) return makeStoryFact(claim, url, 27);
  }

  for (const [id, example] of Object.entries(promos.examples ?? {})) {
    const needle = example.number?.trim() || id;
    if (!narutoNumbersEqual(needle, number)) continue;
    const note = example.note?.trim();
    if (note) return makeStoryFact(note, url, 27);
  }

  for (const tier of ["1", "2", "3"] as const) {
    const list = promos.lists?.[tier] ?? [];
    if (!list.some((entry) => narutoNumbersEqual(entry, number))) continue;
    const claim = promos.shuriken?.[tier]?.trim();
    if (claim) return makeStoryFact(claim, url, 26);
  }

  return null;
}

/**
 * Print dig claims — at most one story (strongest canal first).
 * Sources: UNS3 / tournoi shuriken / Kana manga / S1 prerelease / S6 FR.
 */
export function narutoStoryFactsForPrint(input: {
  number: string | null | undefined;
  setCode?: string | null;
  grouping?: string | null;
}): DigStoryFact[] {
  const number = input.number?.trim() || "";
  if (!number) return [];

  const uns3 = uns3StoryFactForNumber(number);
  if (uns3) return [uns3];

  const tournament = tournamentOrTinPromoStoryFact(number);
  if (tournament) return [tournament];

  const dvdFb = facebookDvdStoryForNumber(number);
  // Prefer DVD-specific FB claim for PR-100; NI-236 may still yield to Kana.
  if (dvdFb && narutoNumbersEqual(number, "pr100")) return [dvdFb];

  const kanaHit = kanaMangaInsertCitationForNumber(number);
  if (kanaHit) {
    const claim = loadKanaDig()?.officialAnnouncement?.claim?.trim();
    if (claim) return [makeStoryFact(claim, kanaHit.url, 27)];
  }

  if (dvdFb) return [dvdFb];

  const grouping = input.grouping?.trim().toLowerCase() || "";
  const isPrerelease =
    grouping === "prerelease" || /prerelease/i.test(number);
  if (isPrerelease) {
    const dig = loadYoutubeDig();
    const fullTen = dig?.prerelease?.fullTen ?? [];
    const retailNeedle = number.replace(/-prerelease$/i, "");
    const inTen =
      fullTen.length === 0 ||
      fullTen.some((entry) => narutoNumbersEqual(entry, retailNeedle));
    const claim = dig?.prerelease?.claim?.trim();
    const url = narutoPrereleaseDistributionCitationUrl();
    if (inTen && claim && url) return [makeStoryFact(claim, url, 26)];
  }

  const set = input.setCode?.trim().toLowerCase() || "";
  if (set === "s6" || set.startsWith("s6-")) {
    const fbS6 = facebookSerie6MijStoryFact();
    if (fbS6) return [fbS6];
    const claim = loadYoutubeDig()?.serie6Fr?.claim?.trim();
    const url = youtubeInventoryUrlAtStamp("12:18");
    if (claim && url) return [makeStoryFact(claim, url, 25)];
  }

  return [];
}

function facebookAttestationProofUrl(
  row: FacebookPackshotAttestation,
): string | null {
  return (
    sanitizePublicCitationUrl(row.postPermalink) ??
    sanitizePublicCitationUrl(row.photoUrl) ??
    sanitizePublicCitationUrl(row.photoUrlAlbum)
  );
}

/** Shared album post when a packshot row omitted its own permalink. */
function facebookDigFallbackPermalink(): string | null {
  const dig = loadFacebookDig();
  for (const row of dig?.packshotAttestations ?? []) {
    const url = sanitizePublicCitationUrl(row.postPermalink);
    if (url) return url;
  }
  return null;
}

function facebookAttestationProofUrlOrAlbum(
  row: FacebookPackshotAttestation,
): string | null {
  return facebookAttestationProofUrl(row) ?? facebookDigFallbackPermalink();
}

function compactAttestationId(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/-packshot$/i, "")
    .replace(/-fr-/g, "-")
    .replace(/-fr$/i, "")
    .replace(/^game-/, "");
}

function slugMatchesAttestationId(slug: string, id: string): boolean {
  const key = slug.trim().toLowerCase();
  const rowId = id.trim().toLowerCase();
  if (!key || !rowId) return false;
  if (rowId === key || rowId === `${key}-packshot` || rowId.startsWith(`${key}-`)) {
    return true;
  }
  if (rowId.includes(key)) return true;
  const compactKey = compactAttestationId(key);
  const compactId = compactAttestationId(rowId);
  return (
    compactId === compactKey ||
    compactId.startsWith(`${compactKey}-`) ||
    compactId.includes(compactKey)
  );
}

function facebookAttestationForSealedSlug(
  slug: string,
): FacebookPackshotAttestation | null {
  const dig = loadFacebookDig();
  if (!dig?.packshotAttestations?.length) return null;
  return (
    dig.packshotAttestations.find((row) =>
      slugMatchesAttestationId(slug, row.id ?? ""),
    ) ?? null
  );
}

function insertLabelForAttestationId(id: string): string {
  if (id.includes("dvd")) return "Insert DVD";
  if (id.startsWith("game-") || id.includes("xbox") || id.includes("ps2")) {
    return "Insert jeu";
  }
  if (id.includes("duopack") || id.includes("duo-pack")) return "Insert duopack";
  if (id.includes("promo") || id.includes("uns3")) return "Insert promo";
  return "Insert produit";
}

function attestationMentionsNumber(
  row: FacebookPackshotAttestation,
  needle: string,
): boolean {
  if (
    row.cardsVisible?.some(
      (card) =>
        typeof card.number === "string" &&
        narutoNumbersEqual(card.number, needle),
    )
  ) {
    return true;
  }
  for (const entry of row.inserts ?? []) {
    if (typeof entry === "string") continue;
    if (
      typeof entry.number === "string" &&
      narutoNumbersEqual(entry.number, needle)
    ) {
      return true;
    }
  }
  for (const print of row.prints ?? []) {
    if (print.number && narutoNumbersEqual(print.number, needle)) return true;
    if (print.printedRef) {
      const ref = print.printedRef.replace(/[^a-z0-9]/gi, "").toLowerCase();
      const bare = needle.replace(/[^a-z0-9]/gi, "").toLowerCase();
      if (ref && bare && (ref === bare || narutoNumbersEqual(ref, bare))) {
        return true;
      }
    }
    if (print.printKey) {
      const parsed = print.printKey.split(":").pop() ?? "";
      const collector = parsed.replace(/^[a-z]+-/, "");
      if (collector && narutoNumbersEqual(collector, needle)) return true;
    }
  }
  return false;
}

function chapterOffsetSeconds(stamp: string): number | null {
  const match = stamp.trim().match(/^(\d+):(\d{2})$/);
  if (!match) return null;
  const minutes = Number(match[1]);
  const seconds = Number(match[2]);
  if (!Number.isFinite(minutes) || !Number.isFinite(seconds)) return null;
  return minutes * 60 + seconds;
}

function youtubeUrlAtChapter(
  videoUrl: string,
  stamp: string,
): string | null {
  const base = sanitizePublicCitationUrl(videoUrl);
  if (!base) return null;
  const offset = chapterOffsetSeconds(stamp);
  if (offset == null || offset <= 0) return base;
  try {
    const parsed = new URL(base);
    parsed.searchParams.set("t", String(offset));
    return sanitizePublicCitationUrl(parsed.toString()) ?? base;
  } catch {
    return base;
  }
}

/**
 * S1 manga prerelease Distribution — Collection Naruto dig chapter « Pré-release ».
 */
export function narutoPrereleaseDistributionCitationUrl(): string | null {
  const dig = loadYoutubeDig();
  if (!dig?.videos?.length) return null;
  for (const video of dig.videos) {
    const chapters = video.chapters;
    if (!chapters || !video.url) continue;
    for (const [stamp, title] of Object.entries(chapters)) {
      if (!/pr[eé]-?release/i.test(title)) continue;
      const href = youtubeUrlAtChapter(video.url, stamp);
      if (href) return href;
    }
  }
  return null;
}

export type KanaMangaInsertCitation = {
  label: string;
  url: string;
};

/**
 * 2008 Kana tome→carte dig — Distribution + Wayback (or forum mirror) proof.
 */
export function kanaMangaInsertCitationForNumber(
  number: string | null | undefined,
): KanaMangaInsertCitation | null {
  const dig = loadKanaDig();
  if (!dig?.tomeMapping?.length) return null;
  const needle = number?.trim();
  if (!needle) return null;
  const row = dig.tomeMapping.find(
    (entry) =>
      typeof entry.number === "string" &&
      narutoNumbersEqual(entry.number, needle),
  );
  if (!row || typeof row.tome !== "number") return null;

  const candidates = [
    dig.officialAnnouncement?.wayback,
    ...(dig.forumMirrors?.map((m) => m.url) ?? []),
  ];
  let url: string | null = null;
  for (const candidate of candidates) {
    url = sanitizePublicCitationUrl(candidate);
    if (url) break;
  }
  if (!url) return null;

  return {
    label: `Insert manga — tome ${row.tome} (Kana)`,
    url,
  };
}

/**
 * Attested sealed SKUs with dig proof (presse / Wayback / YT chapter).
 * Unknown slug → null (no invented channel).
 */
export function narutoSealedDistributionCitation(
  slug: string | null | undefined,
): SealedDistributionCitation | null {
  const key = slug?.trim().toLowerCase() || "";
  if (!key) return null;

  if (key === "pack-decouverte") {
    const press = findingById("pack-decouverte-press-text");
    const pressUrl = sanitizePublicCitationUrl(press?.url);
    if (pressUrl) {
      return { label: "Canal — presse Manga Sanctuary", url: pressUrl };
    }
    const yt = youtubeUrlAtChapter(
      "https://www.youtube.com/watch?v=JYwlXQQlooI",
      "01:05",
    );
    if (yt) return { label: "Canal — inventaire Collection Naruto", url: yt };
    return null;
  }

  if (key === "tin-box-hobby") {
    const row = findingById("tin-box-hobby");
    const official = sanitizePublicCitationUrl(row?.official?.url);
    if (official) {
      return { label: "Canal — Tin Box Hobby (carddass.fr)", url: official };
    }
    return null;
  }

  if (key === "tin-box") {
    const row = findingById("tin-box-sfu-noel-2007");
    const url = sanitizePublicCitationUrl(row?.url);
    if (url) {
      return { label: "Canal — Tin Box Collector (SciFi-Universe)", url };
    }
    return null;
  }

  if (key === "kana-manga-pack-1-2-3") {
    const url = narutoPrereleaseDistributionCitationUrl();
    if (url) {
      return {
        label: "Canal — avant-première manga S1 (Collection Naruto)",
        url,
      };
    }
    return null;
  }

  if (key === "duopack-s28") {
    const url = uns3DuopackAttestationUrl();
    if (url) {
      return {
        label: canalLabelForCitationUrl(url, "Canal — duopack S28"),
        url,
      };
    }
  }

  if (
    key === "starter-detruire-konoha" ||
    key === "starter-sceller-le-malefice"
  ) {
    const ultra = detruireKonohaUltrajeuxSource(key);
    if (ultra) {
      return {
        label: canalLabelForCitationUrl(ultra.url, "Canal — UltraJeux"),
        url: ultra.url,
      };
    }
  }

  const s5Fr = s5FrSealedDistributionCitation(key);
  if (s5Fr) return s5Fr;

  const dvd = facebookAttestationForSealedSlug(key);
  if (dvd) {
    const url = facebookAttestationProofUrlOrAlbum(dvd);
    if (!url) return null;
    const product = dvd.product?.trim() || key;
    return { label: `Canal — ${product}`, url };
  }

  return loadSealedHuntBySlug().get(key) ?? null;
}

/**
 * Facebook dig packshot / inserts / prints → product-insert citation.
 * Prefers DVD rows, then jeu / duopack / promo (first openable proof wins).
 */
export function facebookProductInsertCitationForNumber(
  number: string | null | undefined,
): ProductInsertCitation | null {
  const needle = number?.trim();
  if (!needle) return null;
  const dig = loadFacebookDig();
  if (!dig?.packshotAttestations?.length) return null;

  const ranked = [...dig.packshotAttestations].sort((a, b) => {
    const score = (id: string) => {
      if (id.includes("dvd")) return 0;
      if (id.startsWith("game-")) return 1;
      if (id.includes("duopack")) return 2;
      return 3;
    };
    return score(a.id?.toLowerCase() ?? "") - score(b.id?.toLowerCase() ?? "");
  });

  for (const row of ranked) {
    const id = row.id?.trim().toLowerCase() || "";
    if (!attestationMentionsNumber(row, needle)) continue;
    const url = facebookAttestationProofUrlOrAlbum(row);
    if (!url) continue;
    const product = row.product?.trim() || id || "produit attesté";
    return {
      label: insertLabelForAttestationId(id),
      value: product,
      url,
    };
  }
  return null;
}

/** DVD-only alias — prefer {@link facebookProductInsertCitationForNumber}. */
export function kanaDvdInsertCitationForNumber(
  number: string | null | undefined,
): ProductInsertCitation | null {
  const hit = facebookProductInsertCitationForNumber(number);
  return hit?.label === "Insert DVD" ? hit : null;
}
