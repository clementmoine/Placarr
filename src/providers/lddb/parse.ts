/**
 * Pure HTML parsers for LDDb search + title pages.
 * Live transport lives in `fetch.ts` (FlareSolverr when Anubis blocks).
 */

import { decode as decodeHTMLEntities } from "html-entities";

import { resolveLocaleRegion } from "@/core/locale/preference";

import { lddbCoverUrls, lddbRefFromPath } from "./coverUrl";
import {
  LDDB_PATH_SEGMENT_RE,
  lddbFormatById,
  type LddbFormat,
  type LddbFormatId,
} from "./formats";

const LDDB_ORIGIN = "https://www.lddb.com";

export type LddbSearchHit = {
  id: string;
  format: LddbFormatId;
  title: string;
  url: string;
  reference?: string;
  country?: string;
  year?: number;
  thumbUrl?: string;
  /** LDDb release-date cell is literally `<b>Cancelled</b>` for unreleased SKUs. */
  cancelled?: boolean;
};

export type LddbTitle = {
  id: string;
  format: LddbFormatId;
  formatLabel: string;
  title: string;
  sourceUrl: string;
  year?: number;
  reference?: string;
  country?: string;
  barcode?: string;
  video?: string;
  specs?: string;
  category?: string;
  imdbId?: string;
  frontUrl?: string;
  backUrl?: string;
  thumbUrl?: string;
  /** Localized sibling rows from the same search (often Cancelled FR titles). */
  aliases?: string[];
};

function cleanText(value?: string | null): string | undefined {
  if (!value) return undefined;
  const text = decodeHTMLEntities(String(value))
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return text || undefined;
}

function absoluteUrl(pathOrUrl?: string | null): string | undefined {
  if (!pathOrUrl) return undefined;
  try {
    return new URL(pathOrUrl, LDDB_ORIGIN).toString();
  } catch {
    return undefined;
  }
}

/** LDDb / Anubis challenge page — treat as no data. */
export function isLddbBlockedHtml(html: string): boolean {
  return (
    /making sure you're not a bot/i.test(html) ||
    /techaro\.lol-anubis/i.test(html) ||
    /\/\.within\.website\/x\/cmd\/anubis/i.test(html)
  );
}

/** LDDb result rows link the catalog ref (`22/7610`); the title lives in the slug / `<b>`. */
function titleFromLddbPath(href: string): string | undefined {
  try {
    const path = new URL(href, LDDB_ORIGIN).pathname;
    if (new RegExp(`\\/(?:${LDDB_PATH_SEGMENT_RE})\\/shop\\/`, "i").test(path)) {
      return undefined;
    }
    const parts = path.split("/").filter(Boolean);
    // /{format}/{id}/{ref…}/{Title-Slug}
    if (parts.length < 3) return undefined;
    const slug = parts[parts.length - 1];
    if (!slug) return undefined;
    const decoded = decodeURIComponent(slug)
      .replace(/:-/g, ": ")
      .replace(/[-_]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (!decoded || /^[\d\W]+$/.test(decoded)) return undefined;
    // Bare catalog tokens masquerading as slug (TOYSTORY, PILA-1388).
    if (/^[A-Z0-9][A-Z0-9._/-]*$/i.test(decoded) && !/\s/.test(decoded)) {
      // Keep multi-word-looking Camel titles; drop pure catalog codes.
      if (!/[a-z][A-Z]/.test(slug) && decoded.length < 24) return undefined;
    }
    return decoded;
  } catch {
    return undefined;
  }
}

function titleFromResultRow(html: string, id: string): string | undefined {
  // UPC / title search rows: …<b>Toy Story</b><span id="year_33828">
  const bold = new RegExp(
    `<b>([^<]{2,120})<\\/b>\\s*<span[^>]*id=["']year_${id}["']`,
    "i",
  ).exec(html);
  return cleanText(bold?.[1]);
}

function yearFromResultRow(html: string, id: string): number | undefined {
  const match = new RegExp(
    `id=["']year_${id}["'][^>]*>\\s*\\((\\d{4})\\)`,
    "i",
  ).exec(html);
  return match?.[1] ? Number(match[1]) : undefined;
}

/** Enclosing `<tr>` for a search result id, when LDDb stamps `collwish_{id}`. */
function resultRowHtml(html: string, id: string): string | undefined {
  const marker = `collwish_${id}`;
  let idx = html.indexOf(marker);
  if (idx < 0) {
    const yearMarker = `year_${id}`;
    idx = html.indexOf(yearMarker);
  }
  if (idx < 0) return undefined;
  const start = html.lastIndexOf("<tr", idx);
  const end = html.indexOf("</tr>", idx);
  if (start < 0 || end < 0 || end <= start) return undefined;
  return html.slice(start, end + 5);
}

/** Release cell is literally `<b>Cancelled</b>` for unreleased LDDb SKUs. */
function isCancelledResultRow(rowHtml: string): boolean {
  return /<b>\s*Cancelled\s*<\/b>/i.test(rowHtml);
}

function countryFromResultRow(rowHtml: string): string | undefined {
  // … PAL | France | IMDb icons — country is a short locale-resolvable cell.
  // Skip video standards (PAL/NTSC) which `resolveLocaleRegion` may misread.
  const cells = [
    ...rowHtml.matchAll(/<td[^>]*>\s*([^<]{2,40})\s*<\/td>/gi),
  ].map((m) => cleanText(m[1]));
  for (const cell of cells) {
    if (!cell) continue;
    if (/^(?:cancelled|pal|ntsc|secam)$/i.test(cell)) continue;
    if (/^\d{4}(?:-\d{2}-\d{2})?$/.test(cell)) continue;
    if (resolveLocaleRegion(cell)) return cell;
  }
  return undefined;
}

function isCatalogReferenceLabel(value: string): boolean {
  const t = value.trim();
  if (!t) return true;
  // `22/7610`, `27951.030`, `12153 AS`, `PILA-1388`, `EE 1183`
  if (/^[\d\W]+$/.test(t)) return true;
  if (/^[A-Z]{1,6}[\s._/-]?\d[\dA-Z._/-]*$/i.test(t) && t.length <= 20) {
    return true;
  }
  if (/^\d{2,6}(\s*[A-Z]{1,4})?$/i.test(t)) return true;
  return false;
}

/**
 * Parse search results: links `/laserdisc|vhd|ced|dvhs|hddvd/{id}/…`.
 * Anchor text is usually the catalog reference — title comes from the URL slug
 * or the bold name in the result row.
 */
export function parseLddbSearchHits(
  html: string,
  preferredFormat?: LddbFormat | null,
): LddbSearchHit[] {
  if (!html || isLddbBlockedHtml(html)) return [];

  const hits: LddbSearchHit[] = [];
  const seen = new Set<string>();

  const linkRe = new RegExp(
    `<a[^>]+href=["']([^"']*\\/(${LDDB_PATH_SEGMENT_RE})\\/(\\d+)\\/[^"']+)["'][^>]*>([\\s\\S]*?)<\\/a>`,
    "gi",
  );
  let match: RegExpExecArray | null;
  while ((match = linkRe.exec(html)) !== null) {
    const pathSeg = match[2];
    const id = match[3];
    if (!pathSeg || !id) continue;
    if (new RegExp(`\\/${pathSeg}\\/shop\\/`, "i").test(match[1] || "")) {
      continue;
    }
    const ref = lddbRefFromPath(`/${pathSeg}/${id}/`);
    if (!ref) continue;
    const key = `${ref.format.id}:${id}`;
    if (seen.has(key)) continue;
    const href = absoluteUrl(match[1]);
    if (!href) continue;
    if (preferredFormat && ref.format.id !== preferredFormat.id) continue;

    const anchorText = cleanText(match[4]) || "";
    const title =
      titleFromResultRow(html, id) ||
      titleFromLddbPath(href) ||
      (!isCatalogReferenceLabel(anchorText) ? anchorText : undefined);
    if (!title || title.length < 2) continue;
    seen.add(key);

    const year =
      yearFromResultRow(html, id) ||
      (() => {
        const y = /\((\d{4})\)/.exec(anchorText);
        return y ? Number(y[1]) : undefined;
      })();
    const covers = lddbCoverUrls(id, ref.format);
    // Only advertise a thumb when the result HTML actually embeds one —
    // inventing `/cover/…/thumb/{id}.jpg` for every id produced Affiche
    // tiles that 404 (Nightmare Before Christmas LD 27959, etc.).
    const thumbMentioned = new RegExp(
      `\\/cover\\/[^"'\\s]+\\/thumb\\/${id}(?:_back)?\\.jpg`,
      "i",
    ).test(html);
    const rowHtml = resultRowHtml(html, id);
    const cancelled = rowHtml ? isCancelledResultRow(rowHtml) : false;
    // Prefer country from the full result row (France / USA / …); fall back to
    // the legacy “cell after the link” heuristic for minimal fixtures.
    let country = rowHtml ? countryFromResultRow(rowHtml) : undefined;
    if (!country) {
      const afterLink = html.slice(match.index, match.index + 500);
      const nextCell = cleanText(
        /<\/a>[\s\S]*?<\/td>\s*<td[^>]*>\s*([^<]{2,40})\s*</i.exec(
          afterLink,
        )?.[1],
      );
      if (nextCell && resolveLocaleRegion(nextCell)) country = nextCell;
    }
    hits.push({
      id,
      format: ref.format.id,
      title:
        title
          .replace(/\s*\(\d{4}\)\s*/, " ")
          .replace(/\s*\[[^\]]+\]\s*$/, "")
          .trim() || title,
      url: href,
      year,
      country,
      ...(cancelled ? { cancelled: true } : {}),
      ...(thumbMentioned && covers?.thumb ? { thumbUrl: covers.thumb } : {}),
    });
  }

  return hits;
}

function fieldValue(html: string, fieldName: string): string | undefined {
  const re = new RegExp(
    `<td[^>]*class=["']field["'][^>]*>\\s*${fieldName}\\s*:?\\s*(?:&nbsp;)?\\s*</td>\\s*<td[^>]*class=["']data["'][^>]*>([\\s\\S]*?)</td>`,
    "i",
  );
  const match = re.exec(html);
  return cleanText(match?.[1]);
}

function fieldLinkHref(html: string, fieldName: string): string | undefined {
  const re = new RegExp(
    `<td[^>]*class=["']field["'][^>]*>\\s*${fieldName}\\s*:?\\s*(?:&nbsp;)?\\s*</td>\\s*<td[^>]*class=["']data["'][^>]*>[\\s\\S]*?href=["']([^"']+)["']`,
    "i",
  );
  const match = re.exec(html);
  return match?.[1] ? absoluteUrl(match[1]) : undefined;
}

/**
 * Parse a title detail page (`/laserdisc|vhd|ced|dvhs|hddvd/{id}/…`).
 */
export function parseLddbTitlePage(
  html: string,
  sourceUrl: string,
): LddbTitle | null {
  if (!html || isLddbBlockedHtml(html)) return null;

  const ref =
    lddbRefFromPath(sourceUrl) ||
    lddbRefFromPath(html) ||
    null;
  if (!ref) return null;
  const { id, format } = ref;

  let title: string | undefined;
  let year: number | undefined;
  const h2 = /<h2[^>]*class=["'][^"']*lddb[^"']*["'][^>]*>([\s\S]*?)<\/h2>/i.exec(
    html,
  );
  const heading = cleanText(h2?.[1]);
  if (heading) {
    const full = /^(.+?)\s*\((\d{4})\)\s*(?:\[[^\]]*\])?$/.exec(heading);
    if (full) {
      title = full[1].trim();
      year = Number(full[2]);
    } else {
      title = heading.replace(/\s*\[[^\]]+\]\s*$/, "").trim();
    }
  }

  if (!title) {
    const og = /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i.exec(
      html,
    );
    title = cleanText(og?.[1]);
  }
  if (!title) return null;

  const reference = fieldValue(html, "Reference") || fieldValue(html, "Cat\\. No");
  const country = fieldValue(html, "Country");
  const video = fieldValue(html, "Video");
  const specs = fieldValue(html, "Specs") || fieldValue(html, "Sound");
  const category = fieldValue(html, "Category");
  const barcode =
    fieldValue(html, "UPC") ||
    fieldValue(html, "EAN") ||
    fieldValue(html, "Barcode");
  const released = fieldValue(html, "Released") || fieldValue(html, "Release Date");
  const status = fieldValue(html, "Status");
  // Detail pages for cancelled SKUs — refuse rather than ship a ghost sleeve.
  if (
    (released && /^cancelled$/i.test(released.trim())) ||
    (status && /cancel/i.test(status))
  ) {
    return null;
  }
  if (!year && released) {
    const y = /\b(19|20)\d{2}\b/.exec(released);
    if (y) year = Number(y[0]);
  }

  const imdbHref = fieldLinkHref(html, "IMDb");
  const imdbId = imdbHref
    ? /(?:title\/)?(tt\d+)/i.exec(imdbHref)?.[1]
    : undefined;

  const covers = lddbCoverUrls(id, format);
  const coverPrefix = format.coverPrefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const paddedId = String(Number.parseInt(id, 10) || id).padStart(5, "0");
  // Prefer full-size covers — page HTML often lists `/thumb/` first.
  const pageFront = new RegExp(
    `src=["']([^"']*\\/cover\\/${coverPrefix}\\/(?!thumb\\/)[^"']*\\/${paddedId}\\.jpg)["']`,
    "i",
  ).exec(html)?.[1];
  const pageBack = new RegExp(
    `src=["']([^"']*\\/cover\\/${coverPrefix}\\/(?!thumb\\/)[^"']*\\/${paddedId}_back\\.jpg)["']`,
    "i",
  ).exec(html)?.[1];
  const pageFrontThumb = new RegExp(
    `src=["']([^"']*\\/cover\\/${coverPrefix}\\/[^"']*\\/thumb\\/${paddedId}\\.jpg)["']`,
    "i",
  ).test(html);
  const pageBackThumb = new RegExp(
    `src=["']([^"']*\\/cover\\/${coverPrefix}\\/[^"']*\\/thumb\\/${paddedId}_back\\.jpg)["']`,
    "i",
  ).test(html);

  // Never invent cover URLs when the detail page shows no artwork — synthetic
  // `/cover/…/{id}.jpg` 404s and pollute Affiche as broken LDDb tiles.
  const frontUrl = (() => {
    const fromPage = absoluteUrl(pageFront);
    if (fromPage && !/\/thumb\//i.test(fromPage)) return fromPage;
    if (pageFrontThumb) return covers?.front;
    return undefined;
  })();
  const backUrl = (() => {
    const fromPage = absoluteUrl(pageBack);
    if (fromPage && !/\/thumb\//i.test(fromPage)) return fromPage;
    if (pageBackThumb) return covers?.back;
    return undefined;
  })();
  const thumbUrl = pageFrontThumb || pageFront ? covers?.thumb : undefined;

  return {
    id,
    format: format.id,
    formatLabel: format.label,
    title,
    sourceUrl: absoluteUrl(sourceUrl) || sourceUrl,
    year,
    reference: reference || undefined,
    country: country || undefined,
    barcode: barcode?.replace(/[^\d]/g, "") || undefined,
    video: video || undefined,
    specs: specs || undefined,
    category: category || undefined,
    imdbId,
    frontUrl,
    backUrl,
    thumbUrl,
  };
}

export function pickBestLddbHit(
  hits: LddbSearchHit[],
  query: string,
): LddbSearchHit | null {
  if (hits.length === 0) return null;
  // Cancelled SKUs (e.g. FR “L'Étrange Noël…” 27959) must not win over a
  // released sibling (27958 / 22/4193) that shares the same IMDb title.
  const pool = hits.filter((hit) => !hit.cancelled);
  if (pool.length === 0) return null;

  const q = query
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  if (!q) return pool[0] ?? null;

  const tokens = q.split(/\s+/).filter((t) => t.length > 1);
  const queryLooksFrench = /[àâäéèêëïîôùûç]|noe?l|etrange|monsieur/i.test(
    query,
  );
  let best: LddbSearchHit | null = null;
  let bestScore = -1;
  for (const hit of pool) {
    const title = hit.title
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ");
    let score = 0;
    if (title.includes(q)) score += 10;
    for (const token of tokens) {
      if (title.includes(token)) score += 2;
    }
    if (hit.thumbUrl) score += 1;
    if (
      queryLooksFrench &&
      hit.country &&
      /^france$/i.test(hit.country.trim())
    ) {
      score += 3;
    }
    if (score > bestScore) {
      bestScore = score;
      best = hit;
    }
  }
  return bestScore > 0 ? best : pool[0] ?? null;
}

function normalizeLddbMatchText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function lddbSignificantTokens(value: string): string[] {
  return normalizeLddbMatchText(value)
    .split(/\s+/)
    .filter((token) => token.length > 2);
}

/** Exact or truncation stem ("Jac" covers "Jack") — LDDb-local only. */
function lddbTokenCovers(queryToken: string, titleToken: string): boolean {
  if (queryToken === titleToken) return true;
  if (queryToken.length >= 3 && titleToken.startsWith(queryToken)) return true;
  if (titleToken.length >= 3 && queryToken.startsWith(titleToken)) return true;
  return false;
}

/**
 * LDDb IMDb index paths use bare digits, zero-padded to ≥7
 * (`tt0107688` → `0107688` → `/search/IMDb/0107688`).
 */
export function normalizeLddbImdbId(
  raw: string | null | undefined,
): string | null {
  if (!raw?.trim()) return null;
  const match = /(?:tt)?(\d{1,10})/i.exec(raw.trim());
  if (!match?.[1]) return null;
  const digits = match[1];
  return digits.length >= 7 ? digits : digits.padStart(7, "0");
}

/** Other search rows (incl. Cancelled localized titles) for alias / locale. */
export function lddbSiblingTitles(
  hits: LddbSearchHit[],
  selectedId: string,
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const hit of hits) {
    if (hit.id === selectedId) continue;
    const title = hit.title?.trim();
    if (!title || seen.has(title)) continue;
    seen.add(title);
    out.push(title);
  }
  return out;
}

/**
 * True when any LDDb hit for this query names the film — including Cancelled
 * FR rows whose English released sibling `pickBest` prefers. Tolerates a
 * truncated last token ("… Jac" vs "… Jack") that residual identity rejects.
 */
export function lddbHitListCoversQuery(
  query: string,
  hits: LddbSearchHit[],
): boolean {
  const qTokens = lddbSignificantTokens(query);
  if (qTokens.length < 2 || hits.length === 0) return false;

  for (const hit of hits) {
    const titleTokens = lddbSignificantTokens(hit.title);
    if (titleTokens.length === 0) continue;
    let matched = 0;
    for (const qt of qTokens) {
      if (titleTokens.some((tt) => lddbTokenCovers(qt, tt))) matched += 1;
    }
    if (matched / qTokens.length >= 0.6) return true;
  }
  return false;
}

/** Resolve format label for facts when only an id is known. */
export function lddbFormatLabel(id: LddbFormatId): string {
  return lddbFormatById(id)?.label ?? id;
}
