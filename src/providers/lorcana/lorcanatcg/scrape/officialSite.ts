/**
 * Site marketing officiel Disney Lorcana (`www.disneylorcana.com`).
 *
 * Menu `/fr-FR/product/{slug}` + pages produit : logos wordmark sur fond
 * transparent (meilleure qualité que les thumbs API 512×288) et packshots
 * absents de lorcards (Hyperia, Quête Miel, Inkdark, Cosmic Quest, …).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { httpGet } from "@/lib/http/httpClient";
import { packLogsDir, packStagingDir } from "@/lib/packPaths";
import type { SealedKind } from "@/providers/shared/sealedProducts/kinds";
import {
  catalogArtefactIsFresh,
  catalogArtefactIsFreshWithin,
  hashCatalogArtefactBytes,
  packCatalogIngestLedgerPath,
  readCatalogIngestLedger,
  recordCatalogPromoteAndPurgeStaging,
} from "@/providers/shared/catalogIngestLedger";
import { TCG_CARDS_PRODUCTS_MAX_AGE_MS } from "@/providers/shared/tcgcards/productsStagingLifecycle";

export const OFFICIAL_SITE_ORIGIN = "https://www.disneylorcana.com";
/** Default locale (legacy FR harvest paths). */
export const OFFICIAL_SITE_LOCALE = "fr-FR";
/** Locales whose card catalogues we also want sealed SKUs for. */
export const OFFICIAL_SITE_LOCALES = [
  "fr-FR",
  "en-US",
  "de-DE",
  "it-IT",
] as const;
export type OfficialSiteLocale = (typeof OFFICIAL_SITE_LOCALES)[number];
export const OFFICIAL_SITE_UA = "Placarr-lorcana-official/1.0";
const STAGING_FOLDER = "official-site";
const OFFICIAL_SITE_ARTEFACT_ID = "lorcana:official-site";

const LOCALE_TO_LANG: Readonly<Record<string, string>> = {
  "fr-FR": "fr",
  "en-US": "en",
  "de-DE": "de",
  "it-IT": "it",
};

export function officialSiteLocaleToLang(locale: string): string {
  return LOCALE_TO_LANG[locale] ?? locale.slice(0, 2).toLowerCase();
}

/** CDN filenames often start with `fr_trove.png` / `en_box.png`. */
export function inferLangFromPackshotUrl(url: string): string | null {
  const file = (url.split("/").pop() ?? "").toLowerCase();
  const prefix = /^(fr|en|de|it)[_-]/.exec(file);
  if (prefix) return prefix[1]!;
  // Flat stems: `svvuwbf6ph_de.png`, `dlc_s10_boosterdisplay-it.png`.
  const suffix = /[_-](fr|en|de|it)(?:\.[a-z0-9]+)+$/i.exec(file);
  if (suffix) return suffix[1]!.toLowerCase();
  if (/\/(fr|en|de|it)\//i.test(url)) {
    return /\/(fr|en|de|it)\//i.exec(url)![1]!.toLowerCase();
  }
  return null;
}

export type OfficialMenuEntry = {
  slug: string;
  title: string;
};

export type OfficialPackshot = {
  url: string;
  alt: string;
  kind: SealedKind | null;
};

/**
 * Carte spoilée sur la page marketing (first-look / D23 / carousel), distincte
 * des packshots scellés. Pas de numéro collection dans l'URL — l'ancrage se
 * fait ensuite par set + titre normalisé.
 */
export type OfficialSpoilerCard = {
  url: string;
  /** Alt nettoyé (`Miguel Rivera - Musicien de rue`). */
  title: string;
  /** `first-look` | `d23` | `reveal` — provenance CDN. */
  kind: "first-look" | "d23" | "reveal";
};

/** Contenu déclaré sous « Contents Include » (ou corps de page). */
export type OfficialProductContents = {
  packsContained: number | null;
  cardsPerPack: number | null;
  bullets: string[];
  /** false si le CMS a collé la fiche d'un autre produit (ex. Mickey sur /elsa-gift-box). */
  trusted: boolean;
  /** Decks / reward packs annoncés (Gateway, 2-Player Starter) — pas des boosters. */
  declaredCardCount?: number | null;
};

export type OfficialProductPage = {
  slug: string;
  title: string | null;
  /** Wordmark d'extension (alt contient « Logo », hors chrome site). */
  logoUrl: string | null;
  logoAlt: string | null;
  /** `set14` / `quest3` / `gateway1` — null si non résolu. */
  setId: string | null;
  packshots: OfficialPackshot[];
  /** Cartes spoilées (ignorées des packshots à dessein). */
  spoilers: OfficialSpoilerCard[];
  /** Packs / cartes annoncés sur la page marketing (null si absent). */
  contents: OfficialProductContents | null;
  sourceUrl: string;
  /** Print language for sealed SKUs (`fr`, `en`, …). */
  lang: string;
};

const SKIP_MENU_SLUGS = new Set(["books"]);

/** Pages historiques dont le CDN ne porte pas `sN-`. */
const SLUG_SET_IDS: Record<string, string> = {
  "the-first-chapter": "set1",
  "rise-of-the-floodborn": "set2",
  "into-the-inklands": "set3",
  "ursulas-return": "set4",
  "shimmering-skies": "set5",
  "azurite-sea": "set6",
  "archazias-island": "set7",
  "reign-of-jafar": "set8",
  fabled: "set9",
  whispers: "set10",
  winterspell: "set11",
  "wilds-unknown": "set12",
  "attack-of-the-vine": "set13",
  "hyperia-city": "set14",
  "into-the-inkdark": "set15",
  "cosmic-quest": "set16",
  "deep-trouble": "quest1",
  "palace-heist": "quest2",
  "great-hunny-rescue": "quest3",
  gateway: "gateway1",
};

export function officialSiteHomeUrl(
  locale = OFFICIAL_SITE_LOCALE,
): string {
  return `${OFFICIAL_SITE_ORIGIN}/${locale}/`;
}

export function officialSiteProductUrl(
  slug: string,
  locale = OFFICIAL_SITE_LOCALE,
): string {
  return `${OFFICIAL_SITE_ORIGIN}/${locale}/product/${slug}`;
}

export function officialSiteStagingDir(packId = "lorcana"): string {
  return path.join(packStagingDir(packId), STAGING_FOLDER);
}

/** Durable pages ledger — outside staging so purge does not erase it. */
export function officialSiteDurablePagesPath(packId = "lorcana"): string {
  return path.join(packLogsDir(packId), "official-site-pages.json");
}

export function officialSiteContentHashFromPages(
  pages: readonly OfficialProductPage[],
): string {
  const lines: string[] = ["schema|spoilers-v1"];
  for (const page of pages) {
    if (page.logoUrl) lines.push(`logo|${page.slug}|${page.logoUrl}`);
    for (const shot of page.packshots) {
      lines.push(`shot|${page.slug}|${shot.kind ?? "?"}|${shot.url}`);
    }
    for (const spoiler of page.spoilers ?? []) {
      lines.push(`spoiler|${page.slug}|${spoiler.kind}|${spoiler.url}`);
    }
  }
  lines.sort();
  return hashCatalogArtefactBytes(lines.join("\n"));
}

/** `set14` → `14`, `quest3` → `Q3`, `gateway1` → `G1`. */
export function officialSetIdToSetCode(setId: string | null): string | null {
  if (!setId) return null;
  const m = /^(set|quest|gateway)(\d+)$/i.exec(setId.trim());
  if (!m) return null;
  const kind = m[1]!.toLowerCase();
  const n = m[2]!;
  if (kind === "set") return n;
  if (kind === "quest") return `Q${n}`;
  return `G${n}`;
}

/**
 * Alt marketing → titre imprimable.
 * `Disney Lorcana Miguel Rivera - Musicien de rue` → `Miguel Rivera - Musicien de rue`.
 */
export function parseOfficialSpoilerTitle(alt: string): string | null {
  let title = decodeEntities(alt)
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!title) return null;
  title = title
    .replace(/^disney\s+lorcana(?:\s+tcg)?\s*[–—:-]?\s*/i, "")
    .replace(/^lorcana\s*[–—:-]?\s*/i, "")
    .trim();
  // Refuse chrome / produits / playmats.
  if (
    /^(logo|hyperia city|playmat|trove|booster|prerelease|illumineer|companion\s*app|teaser)/i.test(
      title,
    )
  ) {
    return null;
  }
  if (/playmat|product image|header|map_|teaser-double|banner/i.test(title)) {
    return null;
  }
  // Une vraie carte spoile un personnage / sort : tiret version ou nom composé.
  if (!/[–—-]/.test(title) && title.split(/\s+/).length < 2) return null;
  // Collage fréquent `Aurora -Delightful` → espace après tiret.
  title = title.replace(/\s*([–—-])\s*/g, " - ").replace(/\s+/g, " ").trim();
  if (title.length < 4 || title.length > 120) return null;
  return title;
}

export function classifyOfficialSpoilerUrl(
  url: string,
): OfficialSpoilerCard["kind"] | null {
  if (/\/first-look\//i.test(url)) return "first-look";
  if (/\/d23-card-reveal\/|\/card-reveal\//i.test(url)) return "d23";
  // PNG carte hors packshots scellés. Le CMS range tout sous
  // `…/products/s14-…/` ; les scellés sont en `…/products/s14-…/products/…`.
  if (
    /ravensburger\.cloud/i.test(url) &&
    /\.png(?:\.png)?$/i.test(url) &&
    !/\/products\/[^/]+\/products\//i.test(url) &&
    !/\/products\/(?:trove|booster|pre-release|iq)\//i.test(url) &&
    !/logo|header|map_|teaser-double|playmat|1920x1080|1080x1920/i.test(url)
  ) {
    return "reveal";
  }
  return null;
}

export function isOfficialSpoilerImage(alt: string, url: string): boolean {
  if (!/ravensburger\.cloud/i.test(url)) return false;
  if (/\/cards\/|\/glimmers\/|\/vinelings\//i.test(url)) return true;
  if (/\/encounter-cards\//i.test(url) || /encounter[-_\s]?card/i.test(alt)) {
    return true;
  }
  /*
    Flat CMS paths (`…/s12-…/svvuw….png`) look like card reveals, but alts /
    filenames for displays / troves / booster boxes are sealed packshots —
    never spoilers. Check before the reveal heuristic.
  */
  if (inferPackshotKind(alt, url)) return false;
  const kind = classifyOfficialSpoilerUrl(url);
  if (!kind) return false;
  return Boolean(parseOfficialSpoilerTitle(alt));
}

export function persistOfficialSitePagesDurable(
  payload: unknown,
  packId = "lorcana",
): string {
  const dest = officialSiteDurablePagesPath(packId);
  mkdirSync(path.dirname(dest), { recursive: true });
  writeFileSync(dest, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  return dest;
}

export function promoteOfficialSiteAndPurgeStaging(opts: {
  packId?: string;
  pages?: readonly OfficialProductPage[];
  force?: boolean;
} = {}): boolean {
  const packId = opts.packId ?? "lorcana";
  const staging = officialSiteStagingDir(packId);
  const pages =
    opts.pages ??
    readOfficialSiteLedger(staging)?.pages ??
    readOfficialSiteLedger(undefined, packId)?.pages ??
    [];
  if (!pages.length) return false;
  const contentHash = officialSiteContentHashFromPages(pages);
  if (
    !opts.force &&
    catalogArtefactIsFresh(
      readCatalogIngestLedger(packCatalogIngestLedgerPath(packId)),
      OFFICIAL_SITE_ARTEFACT_ID,
      contentHash,
    ) &&
    !existsSync(staging)
  ) {
    return false;
  }
  recordCatalogPromoteAndPurgeStaging({
    ledgerPath: packCatalogIngestLedgerPath(packId),
    artefactId: OFFICIAL_SITE_ARTEFACT_ID,
    contentHash,
    stagingPath: staging,
  });
  return true;
}

function decodeEntities(value: string): string {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&#x([0-9a-f]+);/gi, (_, h: string) =>
      String.fromCharCode(parseInt(h, 16)),
    )
    .replace(/&#(\d+);/g, (_, n: string) =>
      String.fromCharCode(Number(n)),
    )
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Meta `content` — keep the opening quote so `Illumineer's Quest` is not cut
 * at the apostrophe (`([^"']+)` was the old trap).
 */
export function metaPropertyContent(
  html: string,
  property: string,
): string | null {
  const esc = property.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const tag =
    html.match(
      new RegExp(`<meta\\b[^>]*\\bproperty=["']${esc}["'][^>]*>`, "i"),
    )?.[0] ??
    html.match(
      new RegExp(`<meta\\b[^>]*\\bcontent=(["']).*?\\1[^>]*\\bproperty=["']${esc}["'][^>]*>`, "i"),
    )?.[0];
  if (!tag) return null;
  const m = /\bcontent=(["'])([\s\S]*?)\1/i.exec(tag);
  if (!m) return null;
  const text = decodeEntities(m[2] ?? "");
  return text || null;
}

export function cleanOfficialProductTitle(raw: string | null): string | null {
  if (!raw) return null;
  const title = decodeEntities(raw)
    .replace(/\s*[|–-]\s*Disney Lorcana.*$/i, "")
    .replace(/\s+by Ravensburger.*$/i, "")
    .trim();
  return title || null;
}

function absUrl(src: string): string | null {
  const t = src.trim();
  if (!t || t.startsWith("data:")) return null;
  if (t.startsWith("//")) return `https:${t}`;
  if (/^https?:\/\//i.test(t)) return t.split(")")[0]!.replace(/[);]+$/, "");
  if (t.startsWith("/")) return `${OFFICIAL_SITE_ORIGIN}${t}`;
  return null;
}

/**
 * Entrées du sous-menu Produits (home).
 */
const MENU_LOCALE_RE = "(?:fr-FR|en-US|en-GB|de-DE|it-IT)";

export function parseOfficialProductMenu(html: string): OfficialMenuEntry[] {
  const out: OfficialMenuEntry[] = [];
  const seen = new Set<string>();
  const re = new RegExp(
    `href="(\\/${MENU_LOCALE_RE}\\/product\\/([a-z0-9-]+))"[^>]*>\\s*<h1[^>]*>(.*?)<\\/h1>`,
    "gis",
  );
  for (const match of html.matchAll(re)) {
    const slug = match[2]!.toLowerCase();
    if (SKIP_MENU_SLUGS.has(slug) || seen.has(slug)) continue;
    const title = decodeEntities(match[3]!.replace(/<[^>]+>/g, ""));
    if (!title) continue;
    seen.add(slug);
    out.push({ slug, title });
  }
  // Fallback : liens seuls si le markup change.
  if (out.length === 0) {
    for (const match of html.matchAll(
      new RegExp(`\\/${MENU_LOCALE_RE}\\/product\\/([a-z0-9-]+)`, "gi"),
    )) {
      const slug = match[1]!.toLowerCase();
      if (SKIP_MENU_SLUGS.has(slug) || seen.has(slug)) continue;
      seen.add(slug);
      out.push({ slug, title: slug });
    }
  }
  return out;
}

/**
 * Heroes / banners CMS — never sealed packshots. Gift-box pages nest real
 * product shots under the same folder as a 1920×1080 header.
 */
export function isDecorativeHeroImage(alt: string, url: string): boolean {
  const hay = `${alt} ${url}`.toLowerCase();
  // Keep true sealed packshots even when the CDN folder is noisy.
  if (
    /product[-_]?shot|components|product\s*image|packshot|box\s*shot|gift[-_]?set|booster[-_]?display|booster[-_]?box/i.test(
      hay,
    )
  ) {
    return false;
  }
  if (
    /website\s*header|en-t[eê]te\s*web|key\s*art|banner|spill-photo|pack-rush|double[-_]?teaser/i.test(
      hay,
    )
  ) {
    return true;
  }
  if (
    /giftbox_headers?|_1920x1080|_1080x1375|_1080x1350|\/headers?\//i.test(
      url,
    )
  ) {
    return true;
  }
  if (/thumbnail-\d/i.test(url) && !/product[-_]?shot/i.test(url)) {
    return true;
  }
  return false;
}

/** Higher = prefer when several candidates share kind×lang. */
export function packshotQuality(alt: string, url: string): number {
  if (isDecorativeHeroImage(alt, url)) return -1;
  if (isNonCardOfficialAccessory(alt, url)) return -1;
  const hay = `${alt} ${url}`.toLowerCase();
  let score = 1;
  if (/product[-_]?shot|components|product\s*image|packshot/i.test(hay)) {
    score += 50;
  }
  if (/gift\s*box|coffret|gift[-_]?set/i.test(hay)) score += 20;
  if (/trove|display|booster/i.test(hay)) score += 10;
  /*
    Penalize wordmarks / teasers — but IQ3 box art lives under `…/logo/en_….png`
    with alt « great hunny rescue », so only punish when alt/filename say logo.
  */
  if (/\blogo\b/i.test(alt) || /(?:^|[_/-])logo(?:[_./-]|$)/i.test(url.split("/").pop() ?? "")) {
    score -= 40;
  }
  if (/teaser|double[-_]?teaser/i.test(hay)) score -= 40;
  if (/encounter[-_\s]?card|\/encounter-cards\//i.test(hay)) score -= 50;
  return score;
}

/**
 * « Contents Include » + filet corps de page. Détecte les fiches CMS collées
 * (Elsa FR annonçait Mickey / Tinker Bell / 4 Fabled).
 */
export function parseOfficialProductContents(
  html: string,
  opts: { slug: string; title: string | null },
): OfficialProductContents | null {
  const plain = decodeEntities(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/gi, " ")
      .replace(/\s+/g, " "),
  );
  const section =
    /(?:Contents Include|Gateway Includes|Here'?s what you'?ll find inside):\s*(.+?)(?=Welcome to the story|Bienvenue dans l'histoire|How To Play|Store Locator|$)/i.exec(
      plain,
    )?.[1] ?? null;
  const bullets: string[] = [];
  if (section) {
    for (const m of section.matchAll(
      /(?:^|\s)(?:\((\d+)\)|(\d+))\s+([^0-9].+?)(?=(?:\s+\((\d+)\)|\s+\d+\s+[A-Z«"“])|$)/gi,
    )) {
      const n = m[1] || m[2];
      const text = `${n} ${m[3]!.trim()}`.replace(/\s+/g, " ").trim();
      if (text.length > 3 && text.length < 200) bullets.push(text);
    }
    // Fallback: split on list-ish separators when markup was flat.
    if (!bullets.length) {
      for (const part of section.split(/\s{2,}|\s*[•·]\s*/)) {
        const t = part.trim();
        if (/^\(?\d+\)?\s+\S/.test(t) && t.length < 200) bullets.push(t);
      }
    }
  }

  const identity = `${opts.slug} ${opts.title ?? ""}`.toLowerCase();
  const blob = bullets.join(" ").toLowerCase();
  let trusted = bullets.length > 0;
  if (trusted && /elsa/.test(identity) && /mickey|tinker\s*bell/.test(blob) && !/elsa/.test(blob)) {
    trusted = false;
  }
  if (
    trusted &&
    /scrooge|picsou/.test(identity) &&
    /mickey|tinker|elsa/.test(blob) &&
    !/scrooge|picsou/.test(blob)
  ) {
    trusted = false;
  }

  let packsContained: number | null = null;
  let cardsPerPack: number | null = null;
  if (trusted) {
    const packs =
      /(\d+)\s*(?:fabled\s+)?booster packs/i.exec(blob) ||
      /\((\d+)\)\s*Booster packs/i.exec(blob) ||
      /contient\s+(\d+)\s+boosters?/i.exec(plain) ||
      /contains\s+(\d+)\s+booster packs/i.exec(plain);
    if (packs) packsContained = Number(packs[1]);
  } else {
    // Prefer narrative body — Contents Include may still sit in `plain`.
    const packs =
      /contient\s+(\d+)\s+boosters?/i.exec(plain) ||
      /(?:box\s+)?contains\s+(\d+)\s+booster packs/i.exec(plain) ||
      /this box contains\s+(\d+)\s+booster/i.exec(plain);
    if (packs) packsContained = Number(packs[1]);
  }
  const cards =
    /each with\s+(\d+)\s+randomized cards/i.exec(trusted ? blob : plain) ||
    /(\d+)\s+cartes\s+al[eé]atoires/i.exec(plain);
  if (cards) cardsPerPack = Number(cards[1]);

  // 2-player starter / Gateway: fixed decks, no boosters — surface size only.
  let declaredFromDecks: number | null = null;
  const ready =
    /(\d+)\s+ready-to-play decks?\s*\((\d+)\s+cards?\s+each\)/i.exec(
      trusted ? blob : plain,
    ) ||
    /(\d+)\s+starter decks?\s*\((\d+)\s+cards?\s+each\)/i.exec(
      trusted ? blob : plain,
    ) ||
    /(\d+)\s+starting decks?\s*\((\d+)\s+cards?\s+each\)/i.exec(
      trusted ? blob : plain,
    );
  if (ready) {
    declaredFromDecks = Number(ready[1]) * Number(ready[2]);
  }
  const reward =
    /(\d+)\s+reward packs?\s*\((\d+)\s+cards?\s+each\)/i.exec(
      trusted ? blob : plain,
    );
  if (reward) {
    declaredFromDecks =
      (declaredFromDecks ?? 0) + Number(reward[1]) * Number(reward[2]);
  }

  if (
    packsContained == null &&
    !bullets.length &&
    declaredFromDecks == null
  ) {
    return null;
  }
  return {
    packsContained,
    cardsPerPack,
    bullets,
    trusted,
    ...(declaredFromDecks != null
      ? { declaredCardCount: declaredFromDecks }
      : {}),
  };
}

function isSiteChromeLogo(alt: string, url: string): boolean {
  if (/\/_nuxt\//i.test(url)) return true;
  if (/^lorcana logo$/i.test(alt.trim())) return true;
  if (/rph logo/i.test(alt)) return true;
  return false;
}

function isSetWordmark(alt: string, url: string): boolean {
  if (isSiteChromeLogo(alt, url)) return false;
  if (!/\.png(?:\.png)?$/i.test(url) && !/\.webp$/i.test(url)) return false;
  if (!/ravensburger\.cloud/i.test(url)) return false;

  // Headers décoratifs (souvent « … and a logo that says … » dans l'alt).
  if (
    /header|d[ée]corative|en-t[eê]te|key\s*art|thumbnail|stub-page|teaser|banner/i.test(
      alt,
    )
  ) {
    return false;
  }
  if (
    /\/(?:header|backgrounds?|key-art|stub-page|teaser-double)\//i.test(url) ||
    /_header_|products_header|_1920|\/product-s\d+\//i.test(url) ||
    /stub-page|double_teaser|teaser/i.test(url)
  ) {
    return false;
  }

  const altHasLogo = /logo/i.test(alt);
  const file = url.split("/").pop() ?? "";
  /*
    Inkdark : alt sans « logo », chemin `/s15-logo/` ; Azurite : `dlc_s6_logo_fr.png`.
    Bare folder `…/logo/en_….png` (IQ3 box art) is NOT a wordmark — require
    `/logos/`, `/sN-logo/`, or logo in the filename.
  */
  const urlHasLogo =
    /\/logos\//i.test(url) ||
    /\/s\d+-logo\//i.test(url) ||
    /(?:^|[_/-])logo(?:[_./-]|$)/i.test(file);
  if (!altHasLogo && !urlHasLogo) return false;
  return true;
}

export function inferOfficialSetId(
  slug: string,
  urls: readonly string[],
): string | null {
  const mapped = SLUG_SET_IDS[slug.trim().toLowerCase()];
  if (mapped) return mapped;
  const blob = urls.join(" ");
  const set = blob.match(/\/s(\d+)(?:-|\/|_|$)/i);
  if (set) return `set${Number(set[1])}`;
  const quest = blob.match(/\/iq(\d+)(?:-|\/|_)/i);
  if (quest) return `quest${Number(quest[1])}`;
  if (/\/gateway\//i.test(blob)) return "gateway1";
  return null;
}

/**
 * Accessoires CMS sans cartes (tapis, deck boxes) — ne pas minter un SKU scellé.
 * Le catch-all `product-photography` les classait sinon en `collector_box`.
 */
export function isNonCardOfficialAccessory(alt: string, url: string): boolean {
  const hay = `${alt} ${url}`.toLowerCase();
  if (
    /playmat|tapis\s*de\s*jeu|spielmatte|tappetini|game\s*mat|\/playmats?[/_-]/i.test(
      hay,
    )
  ) {
    return true;
  }
  if (
    /deck\s*box(?:es)?|bo[iî]tes?\s*(?:[àa]\s*)?deck|\/deck[-_]?box/i.test(hay)
  ) {
    return true;
  }
  return false;
}

/**
 * Titre produit pour un packshot official-site.
 * Sur une page set, le CMS colle souvent le titre du chapitre alors que le
 * shot est le starter 2 joueurs (« Two Player Starter Decks »).
 */
export function officialProductDisplayName(input: {
  pageTitle: string | null | undefined;
  packshotAlt: string | null | undefined;
  pageSlug: string;
}): string {
  const title = input.pageTitle?.trim() || "";
  const alt = input.packshotAlt?.trim() || "";
  const slug = input.pageSlug.trim().toLowerCase();

  if (
    slug !== "2-player-starter-set" &&
    /(?:two|2)[- ]?player\s+starter/i.test(alt)
  ) {
    const setName = title || slug.replace(/-/g, " ");
    return `${setName} 2-Player Starter Set`;
  }

  if (
    slug !== "2-player-starter-set" &&
    /starter\s+decks?/i.test(alt) &&
    !/gift|collection\s*starter|components/i.test(alt)
  ) {
    const setName = title || slug.replace(/-/g, " ");
    return `${setName} Starter Decks`;
  }

  return title || alt || slug.replace(/-/g, " ");
}

export function inferPackshotKind(
  alt: string,
  url: string,
  opts: { setId?: string | null } = {},
): SealedKind | null {
  const hay = `${alt} ${url}`.toLowerCase();
  const setId = (opts.setId ?? "").toLowerCase();
  if (isNonCardOfficialAccessory(alt, url)) return null;
  /*
    Quest product pages: lifestyle alts often say « trove » / spill-photo for
    the IQ box itself — never mint a parallel Illumineer's Trove SKU.
  */
  if (setId.startsWith("quest")) {
    if (
      /key\s*art|hero_|-hero|spill-photo|pack-rush|double[-_]?teaser|background|encounter[-_\s]?card|\/encounter-cards\//i.test(
        hay,
      )
    ) {
      return null;
    }
    // Card spoilers (Name - Title) — never the sealed SKU.
    if (/^\s*[A-Z][A-Za-z0-9' .]{1,40}\s*[-–—]\s*\S/.test(alt.trim())) {
      return null;
    }
    if (
      /quest|rescue|heist|trouble|hunny|miel|palais|profondeur|illumineer|\/iq\d/i.test(
        hay,
      )
    ) {
      return "quest";
    }
  }
  // Quest before trove — CMS packshots often live under …/trove/ for IQ boxes.
  if (
    /illumineer'?s?\s*quest|qu[eê]te\s+des\s+illumineurs|\/iq\d|\/products\/iq/i.test(
      hay,
    )
  ) {
    return "quest";
  }
  if (/trove|tr[eé]sor/.test(hay)) return "trove";
  if (/gift\s*box|coffret\s*cadeau|gift-set|giftset/.test(hay)) {
    return "collector_box";
  }
  /*
    Display / booster box before bare « booster » — otherwise
    « Booster Box » / « Box of 24 booster packs » become random_pack SKUs.
  */
  if (
    /booster\s*display|boosterdisplay|booster[-_ ]?box/.test(hay) ||
    /\bdisplay\s*packs?\b|\bdisplay\b/.test(hay) ||
    /box\s+of\s+\d*\s*booster|bo[iî]te\s+de\s+\d*\s*boosters?/.test(hay)
  ) {
    return "display";
  }
  if (/booster|wrap/.test(hay)) return "booster";
  if (/starter|démarrage|gateway.*box\s*shot|box\s*shot/.test(hay)) {
    return "collector_box";
  }
  if (/\/products\/(?:trove|booster-display|pre-release|iq)/i.test(url)) {
    if (/booster-display/i.test(url)) return "display";
    if (/\/iq/i.test(url)) return "quest";
    if (/trove/i.test(url)) return "trove";
    if (/pre-release/i.test(url)) return "prerelease";
    return "collector_box";
  }
  if (/product[-_ ]?(?:image|shot|photo)/i.test(hay)) return "collector_box";
  return null;
}

function pickPreferredLogo(
  candidates: readonly { alt: string; url: string }[],
  setId: string | null,
): { alt: string; url: string } | null {
  if (!candidates.length) return null;
  const fr = candidates.filter(
    (c) =>
      /(?:^|[/_-])fr(?:[/_.-]|$)|logo_fr|logos_fr|_fr\./i.test(c.url) ||
      /\bfr\b/i.test(c.alt),
  );
  const pool = fr.length ? fr : candidates;
  const setNeedle = setId
    ? setId.replace(/^set/, "s").replace(/^quest/, "iq")
    : null;
  const ranked = [...pool].sort((a, b) => {
    const score = (u: string) =>
      (setNeedle && new RegExp(`(?:^|/)${setNeedle}(?:-|_|/)`, "i").test(u)
        ? 10
        : 0) +
      (/dlc_.*logo/i.test(u) ? 4 : 0) +
      (/\/(?:s\d+-)?logos?\//i.test(u) ? 3 : 0) +
      (/_logo_/i.test(u) ? 2 : 0) +
      (/logo/i.test(u) ? 1 : 0);
    return score(b.url) - score(a.url);
  });
  return ranked[0] ?? null;
}

/**
 * Logos wordmark + packshots utiles d'une page `/product/{slug}`.
 */
export function parseOfficialProductPage(
  html: string,
  slug: string,
  opts: { sourceUrl?: string; locale?: string; lang?: string } = {},
): OfficialProductPage {
  const locale = opts.locale ?? OFFICIAL_SITE_LOCALE;
  const lang =
    opts.lang ?? officialSiteLocaleToLang(locale);
  const imgs: { alt: string; url: string }[] = [];
  for (const match of html.matchAll(/<img\b[^>]*>/gi)) {
    const tag = match[0];
    const src = tag.match(/\bsrc=["']([^"']+)["']/i)?.[1];
    const alt = decodeEntities(
      tag.match(/\balt=["']([^"']*)["']/i)?.[1] ?? "",
    );
    const url = src ? absUrl(src) : null;
    if (!url) continue;
    imgs.push({ alt, url });
  }

  const allUrls = imgs.map((i) => i.url);
  const setId = inferOfficialSetId(slug, allUrls);

  const logoCandidates = imgs.filter((img) =>
    isSetWordmark(img.alt, img.url),
  );
  const logo = pickPreferredLogo(logoCandidates, setId);

  const spoilers: OfficialSpoilerCard[] = [];
  const spoilerSeen = new Set<string>();
  type RankedShot = OfficialPackshot & { quality: number; shotLang: string };
  const ranked: RankedShot[] = [];
  for (const img of imgs) {
    if (logo && img.url === logo.url) continue;
    if (isSiteChromeLogo(img.alt, img.url)) continue;
    if (!/ravensburger\.cloud/i.test(img.url)) continue;

    // Spoilers d'abord : first-look / D23 / PNG carte — jamais des packshots.
    if (isOfficialSpoilerImage(img.alt, img.url)) {
      const spoilerKind = classifyOfficialSpoilerUrl(img.url);
      const title = parseOfficialSpoilerTitle(img.alt);
      if (spoilerKind && title && !spoilerSeen.has(img.url)) {
        spoilerSeen.add(img.url);
        spoilers.push({ url: img.url, title, kind: spoilerKind });
      }
      continue;
    }

    if (isDecorativeHeroImage(img.alt, img.url)) continue;
    const quality = packshotQuality(img.alt, img.url);
    if (quality < 0) continue;

    const kind = inferPackshotKind(img.alt, img.url, { setId });
    if (!kind) continue;
    // Skip tiny card / glimmer art (déjà couvert ci-dessus ; ce filet évite
    // qu'un alt produit ambigu tombe en packshot).
    if (/\/cards\/|\/glimmers\/|\/vinelings\/|card-reveal|first-look/i.test(img.url))
      continue;
    /*
      Une variante par kind×langue — une page EN liste souvent en/de/it box
      art ; un seul slot `display` jetait les DE/IT. Prefer product-shot over
      a same-kind hero that slipped through.
    */
    const shotLang = inferLangFromPackshotUrl(img.url) ?? lang;
    ranked.push({
      url: img.url,
      alt: img.alt,
      kind,
      quality,
      shotLang,
    });
  }
  const packshots: OfficialPackshot[] = [];
  const kindBest = new Map<string, RankedShot>();
  for (const shot of ranked) {
    const kindKey = `${shot.kind}:${shot.shotLang}`;
    const prev = kindBest.get(kindKey);
    if (prev && prev.quality >= shot.quality) continue;
    kindBest.set(kindKey, shot);
  }
  for (const shot of kindBest.values()) {
    packshots.push({ url: shot.url, alt: shot.alt, kind: shot.kind });
  }

  // Title: og:title first, but never keep a truncated apostrophe cut
  // (`Illumineer` from `Illumineer's Quest…`). Prefer the longer <title>.
  const ogTitle = cleanOfficialProductTitle(metaPropertyContent(html, "og:title"));
  const docTitle = cleanOfficialProductTitle(
    html.match(/<title[^>]*>([^<]+)/i)?.[1] ?? null,
  );
  let title = ogTitle;
  if (
    docTitle &&
    (!title ||
      title.length + 8 < docTitle.length ||
      /^illumineer$/i.test(title))
  ) {
    title = docTitle;
  }

  const contents = parseOfficialProductContents(html, { slug, title });

  return {
    slug,
    title,
    logoUrl: logo?.url ?? null,
    logoAlt: logo?.alt ?? null,
    setId,
    packshots,
    spoilers,
    contents,
    sourceUrl: opts.sourceUrl ?? officialSiteProductUrl(slug, locale),
    lang,
  };
}

async function fetchText(url: string): Promise<string | null> {
  try {
    const res = await httpGet<ArrayBuffer>(url, {
      headers: {
        "User-Agent": OFFICIAL_SITE_UA,
        Accept: "text/html,application/xhtml+xml",
      },
      timeout: 60_000,
      responseType: "arraybuffer",
      validateStatus: (s: number) => s === 200,
    });
    if (!res.data) return null;
    return Buffer.from(res.data).toString("utf8");
  } catch {
    return null;
  }
}

async function fetchBytes(url: string): Promise<Buffer | null> {
  try {
    const res = await httpGet<ArrayBuffer>(url, {
      headers: { "User-Agent": OFFICIAL_SITE_UA },
      timeout: 45_000,
      responseType: "arraybuffer",
      validateStatus: (s: number) => s === 200,
    });
    if (!res.data || res.data.byteLength < 200) return null;
    return Buffer.from(res.data);
  } catch {
    return null;
  }
}

export type OfficialSiteHarvest = {
  menu: number;
  pages: number;
  logos: number;
  packshots: number;
  spoilers: number;
  fail: number;
  pagesParsed: OfficialProductPage[];
};

/**
 * Home + chaque page produit (toutes les locales catalogue) → staging + ledger.
 */
export async function harvestOfficialLorcanaSite(opts: {
  force?: boolean;
  stagingDir?: string;
  delayMs?: number;
  limit?: number;
  locales?: readonly string[];
  onProgress?: (message: string) => void;
  packId?: string;
} = {}): Promise<OfficialSiteHarvest> {
  const packId = opts.packId ?? "lorcana";
  const staging = opts.stagingDir ?? officialSiteStagingDir(packId);

  if (!opts.force) {
    const durable = readOfficialSiteLedger(undefined, packId);
    if (durable?.pages.length) {
      const contentHash = officialSiteContentHashFromPages(durable.pages);
      if (
        // Hash is of our own durable pages.json (self-hash): TTL is what lets
        // a later Sync re-harvest and discover new SKUs.
        catalogArtefactIsFreshWithin(
          readCatalogIngestLedger(packCatalogIngestLedgerPath(packId)),
          OFFICIAL_SITE_ARTEFACT_ID,
          contentHash,
          TCG_CARDS_PRODUCTS_MAX_AGE_MS,
        )
      ) {
        opts.onProgress?.("ledger frais — skip harvest HTTP");
        return {
          menu: durable.menu.length,
          pages: durable.pages.length,
          logos: 0,
          packshots: 0,
          spoilers: durable.pages.reduce(
            (n, p) => n + (p.spoilers?.length ?? 0),
            0,
          ),
          fail: 0,
          pagesParsed: durable.pages,
        };
      }
    }
  }

  const pagesDir = path.join(staging, "pages");
  const logosDir = path.join(staging, "logos");
  const shotsDir = path.join(staging, "packshots");
  mkdirSync(pagesDir, { recursive: true });
  mkdirSync(logosDir, { recursive: true });
  mkdirSync(shotsDir, { recursive: true });

  const locales = opts.locales?.length
    ? opts.locales
    : [...OFFICIAL_SITE_LOCALES];
  const delayMs = opts.delayMs ?? 80;

  const pagesParsed: OfficialProductPage[] = [];
  const menuBySlug = new Map<string, OfficialMenuEntry>();
  let logos = 0;
  let packshots = 0;
  let spoilers = 0;
  let fail = 0;

  for (const locale of locales) {
    const lang = officialSiteLocaleToLang(locale);
    const homePath = path.join(staging, `home.${locale}.html`);
    let homeHtml: string | null = null;
    if (
      !opts.force &&
      existsSync(homePath) &&
      readFileSync(homePath).byteLength > 1000
    ) {
      homeHtml = readFileSync(homePath, "utf8");
    } else {
      homeHtml = await fetchText(officialSiteHomeUrl(locale));
      if (homeHtml) writeFileSync(homePath, homeHtml, "utf8");
      if (delayMs > 0) await new Promise((r) => setTimeout(r, delayMs));
    }
    if (!homeHtml) {
      fail += 1;
      opts.onProgress?.(`${locale} — home inaccessible`);
      continue;
    }

    let menu = parseOfficialProductMenu(homeHtml);
    if (opts.limit && opts.limit > 0) menu = menu.slice(0, opts.limit);
    for (const entry of menu) {
      if (!menuBySlug.has(entry.slug)) menuBySlug.set(entry.slug, entry);
    }
    opts.onProgress?.(`${locale} — ${menu.length} pages produit`);

    for (const entry of menu) {
      const pageFile = path.join(pagesDir, `${entry.slug}.${locale}.html`);
      // Legacy FR path without locale suffix.
      const legacyFr =
        locale === "fr-FR" ? path.join(pagesDir, `${entry.slug}.html`) : null;
      let html: string | null = null;
      if (
        !opts.force &&
        existsSync(pageFile) &&
        readFileSync(pageFile).byteLength > 1000
      ) {
        html = readFileSync(pageFile, "utf8");
      } else if (
        legacyFr &&
        !opts.force &&
        existsSync(legacyFr) &&
        readFileSync(legacyFr).byteLength > 1000
      ) {
        html = readFileSync(legacyFr, "utf8");
      } else {
        html = await fetchText(officialSiteProductUrl(entry.slug, locale));
        if (html) writeFileSync(pageFile, html, "utf8");
        if (delayMs > 0) await new Promise((r) => setTimeout(r, delayMs));
      }
      if (!html) {
        fail += 1;
        continue;
      }
      const parsed = parseOfficialProductPage(html, entry.slug, {
        locale,
        lang,
        sourceUrl: officialSiteProductUrl(entry.slug, locale),
      });
      // Menu label beats a truncated og:title (`Illumineer`).
      if (
        !parsed.title ||
        parsed.title.length < 12 ||
        /^illumineer$/i.test(parsed.title)
      ) {
        if (entry.title?.trim()) parsed.title = entry.title.trim();
      }
      pagesParsed.push(parsed);

      if (parsed.logoUrl && parsed.setId && lang === "fr") {
        const ext =
          path.extname(new URL(parsed.logoUrl).pathname).toLowerCase() ||
          ".png";
        const dest = path.join(
          logosDir,
          `${parsed.setId}${ext === ".jpeg" ? ".jpg" : ext}`,
        );
        if (opts.force || !existsSync(dest)) {
          const buf = await fetchBytes(parsed.logoUrl);
          if (buf) {
            writeFileSync(dest, buf);
            logos += 1;
          } else fail += 1;
          if (delayMs > 0) await new Promise((r) => setTimeout(r, delayMs));
        }
      }

      for (const [i, shot] of parsed.packshots.entries()) {
        if (!shot.kind) continue;
        const shotLang =
          inferLangFromPackshotUrl(shot.url) ?? lang;
        const ext =
          path.extname(new URL(shot.url).pathname).replace(/\.png$/i, ".png") ||
          ".png";
        const safeExt =
          ext.toLowerCase() === ".jpeg" ? ".jpg" : ext.toLowerCase();
        const destName = `${entry.slug}.${shot.kind}.${i}.${shotLang}${
          safeExt.endsWith(".png") ? ".png" : safeExt
        }`;
        const dest = path.join(shotsDir, destName);
        // Legacy FR filename without lang segment.
        const legacyDest =
          shotLang === "fr"
            ? path.join(
                shotsDir,
                `${entry.slug}.${shot.kind}.${i}${
                  safeExt.endsWith(".png") ? ".png" : safeExt
                }`,
              )
            : null;
        if (
          !opts.force &&
          (existsSync(dest) || (legacyDest && existsSync(legacyDest)))
        ) {
          continue;
        }
        const buf = await fetchBytes(shot.url);
        if (buf) {
          writeFileSync(dest, buf);
          packshots += 1;
        }
        if (delayMs > 0) await new Promise((r) => setTimeout(r, delayMs));
      }

      // Compte les spoilers (téléchargement face → applyOfficialSiteSpoilerFaces).
      spoilers += parsed.spoilers.length;
    }
  }

  const menu = [...menuBySlug.values()];
  const payload = {
    source: officialSiteHomeUrl(),
    locales,
    fetchedAt: new Date().toISOString(),
    menu,
    pages: pagesParsed,
  };
  const ledgerPath = path.join(staging, "pages.json");
  writeFileSync(ledgerPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  persistOfficialSitePagesDurable(payload, packId);

  return {
    menu: menu.length,
    pages: pagesParsed.length,
    logos,
    packshots,
    spoilers,
    fail,
    pagesParsed,
  };
}

export function readOfficialSiteLedger(
  stagingDir?: string,
  packId = "lorcana",
): {
  menu: OfficialMenuEntry[];
  pages: OfficialProductPage[];
} | null {
  const candidates = [
    stagingDir ? path.join(stagingDir, "pages.json") : null,
    path.join(officialSiteStagingDir(packId), "pages.json"),
    officialSiteDurablePagesPath(packId),
  ].filter(Boolean) as string[];

  for (const file of candidates) {
    if (!existsSync(file)) continue;
    try {
      const raw = JSON.parse(readFileSync(file, "utf8")) as {
        menu?: OfficialMenuEntry[];
        pages?: OfficialProductPage[];
      };
      const pages = (raw.pages ?? []).map((page) => ({
        ...page,
        lang: page.lang ?? "fr",
        spoilers: page.spoilers ?? [],
        contents: page.contents ?? null,
      }));
      return {
        menu: raw.menu ?? [],
        pages,
      };
    } catch {
      /* try next */
    }
  }
  return null;
}
