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
import { packStagingDir } from "@/lib/packPaths";
import type { SealedKind } from "@/providers/shared/sealedProducts/kinds";

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
  const m = /^(fr|en|de|it)[_-]/.exec(file);
  if (m) return m[1]!;
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

export type OfficialProductPage = {
  slug: string;
  title: string | null;
  /** Wordmark d'extension (alt contient « Logo », hors chrome site). */
  logoUrl: string | null;
  logoAlt: string | null;
  /** `set14` / `quest3` / `gateway1` — null si non résolu. */
  setId: string | null;
  packshots: OfficialPackshot[];
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

function decodeEntities(value: string): string {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&#(\d+);/g, (_, n: string) =>
      String.fromCharCode(Number(n)),
    )
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
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
export function parseOfficialProductMenu(html: string): OfficialMenuEntry[] {
  const out: OfficialMenuEntry[] = [];
  const seen = new Set<string>();
  const re =
    /href="(\/(?:fr-FR|en-US|de-DE|it-IT)\/product\/([a-z0-9-]+))"[^>]*>\s*<h1[^>]*>(.*?)<\/h1>/gis;
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
      /\/(?:fr-FR|en-US|de-DE|it-IT)\/product\/([a-z0-9-]+)/gi,
    )) {
      const slug = match[1]!.toLowerCase();
      if (SKIP_MENU_SLUGS.has(slug) || seen.has(slug)) continue;
      seen.add(slug);
      out.push({ slug, title: slug });
    }
  }
  return out;
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
  // Inkdark : alt sans « logo », chemin `/s15-logo/` ; Azurite : `dlc_s6_logo_fr.png`.
  const urlHasLogo = /logo/i.test(url);
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

export function inferPackshotKind(
  alt: string,
  url: string,
): SealedKind | null {
  const hay = `${alt} ${url}`.toLowerCase();
  if (/trove|tr[eé]sor/.test(hay)) return "trove";
  if (/illumineer'?s?\s*quest|\/iq\d|\/products\/iq/i.test(hay)) {
    return "quest";
  }
  if (/gift\s*box|coffret\s*cadeau|gift-set|giftset/.test(hay)) {
    return "collector_box";
  }
  if (/booster\s*display|display/.test(hay)) return "display";
  if (/booster|wrap/.test(hay)) return "booster";
  if (/starter|démarrage|gateway.*box\s*shot|box\s*shot/.test(hay)) {
    return "collector_box";
  }
  if (/\/products\/(?:trove|booster-display|pre-release|iq)/i.test(url)) {
    if (/booster-display/i.test(url)) return "display";
    if (/trove/i.test(url)) return "trove";
    if (/\/iq|pre-release/i.test(url)) return "prerelease";
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

  const packshots: OfficialPackshot[] = [];
  const seen = new Set<string>();
  const kindSeen = new Set<string>();
  for (const img of imgs) {
    if (logo && img.url === logo.url) continue;
    if (isSiteChromeLogo(img.alt, img.url)) continue;
    if (!/ravensburger\.cloud/i.test(img.url)) continue;
    const kind = inferPackshotKind(img.alt, img.url);
    if (!kind) continue;
    // Skip tiny card / glimmer art
    if (/\/cards\/|\/glimmers\/|\/vinelings\/|card-reveal|first-look/i.test(img.url))
      continue;
    if (seen.has(img.url)) continue;
    // Une variante par kind (évite 6 « coffret » carousel pour la même page).
    if (kindSeen.has(kind)) continue;
    seen.add(img.url);
    kindSeen.add(kind);
    packshots.push({ url: img.url, alt: img.alt, kind });
  }

  // Title: prefer og:title, strip site suffix.
  let title: string | null = null;
  const og = html.match(
    /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i,
  );
  if (og) title = decodeEntities(og[1]!);
  if (!title) {
    const docTitle = html.match(/<title[^>]*>([^<]+)/i)?.[1];
    if (docTitle) title = decodeEntities(docTitle);
  }
  if (title) {
    title = title
      .replace(/\s*[|–-]\s*Disney Lorcana.*$/i, "")
      .replace(/\s+by Ravensburger.*$/i, "")
      .trim();
  }

  return {
    slug,
    title,
    logoUrl: logo?.url ?? null,
    logoAlt: logo?.alt ?? null,
    setId,
    packshots,
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
} = {}): Promise<OfficialSiteHarvest> {
  const staging = opts.stagingDir ?? officialSiteStagingDir();
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
      if (!parsed.title) parsed.title = entry.title;
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
    }
  }

  const menu = [...menuBySlug.values()];
  const ledgerPath = path.join(staging, "pages.json");
  writeFileSync(
    ledgerPath,
    `${JSON.stringify(
      {
        source: officialSiteHomeUrl(),
        locales,
        fetchedAt: new Date().toISOString(),
        menu,
        pages: pagesParsed,
      },
      null,
      2,
    )}\n`,
    "utf8",
  );

  return {
    menu: menu.length,
    pages: pagesParsed.length,
    logos,
    packshots,
    fail,
    pagesParsed,
  };
}

export function readOfficialSiteLedger(
  stagingDir = officialSiteStagingDir(),
): {
  menu: OfficialMenuEntry[];
  pages: OfficialProductPage[];
} | null {
  const file = path.join(stagingDir, "pages.json");
  if (!existsSync(file)) return null;
  try {
    const raw = JSON.parse(readFileSync(file, "utf8")) as {
      menu?: OfficialMenuEntry[];
      pages?: OfficialProductPage[];
    };
    const pages = (raw.pages ?? []).map((page) => ({
      ...page,
      lang: page.lang ?? "fr",
    }));
    return {
      menu: raw.menu ?? [],
      pages,
    };
  } catch {
    return null;
  }
}
