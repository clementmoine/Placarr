import { fetchGetWithFlareFallback } from "@/lib/http/scrapeFetch";
import { decode as decodeHTMLEntities } from "html-entities";

import {
  normalizeVolumeNumber,
  stripVolumeMarkersFromTitle,
  volumeNumberFromTitle,
  VOLUME_NUMBER_SUFFIX_PATTERN,
} from "@/core/enrich/titles/volumeNumber";
import {
  hasHorsSerieMarker,
  horsSerieSeriesPart,
} from "@/core/enrich/titles/horsSerie";
import { metadataTitleSimilarity } from "@/core/enrich/titleMatching";

const BDPHILE_BASE_URL = "https://www.bdphile.fr";
const BDPHILE_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "Accept-Language": "fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7",
};

/**
 * BDphile's robots.txt allows generic agents everywhere EXCEPT /search/ and
 * /auto_completion/ — so revues are resolved by walking the alphabetical
 * /revue/?start=N index (cached in-process), never through search.
 */
const REVUE_INDEX_PAGE_SIZE = 50;
const REVUE_INDEX_MAX_PAGES = 15;
const REVUE_INDEX_TTL_MS = 6 * 60 * 60 * 1000;

export type BdphileRevue = {
  id: string;
  label: string;
};

export type BdphileRevueIssueLink = {
  numeroId: string;
  path: string;
  /** Normalized issue label ("65", "100bis"). */
  issueNumber: string;
  /** Labels like "Numéro HS 5" — never matchable by a regular issue number. */
  horsSerie: boolean;
};

export interface BdphileIssue {
  id: string;
  /** Composed display title ("Super Picsou Géant n°100bis"). */
  title: string;
  sourceUrl: string;
  issueNumber?: string;
  revueName?: string;
  /** French free-text publication date ("juin 1980"). */
  releaseDate?: string;
  publisher?: string;
  description?: string;
  imageUrl?: string;
  pageCount?: number;
  /** Catalog list price parsed from the Format field (e.g. "242 pages - 4.9€"). */
  priceNewCents?: number;
  issn?: string;
  formatLabel?: string;
  periodicity?: string;
}

const VOLUME_SUFFIX_TOKEN_RE = new RegExp(
  `^${VOLUME_NUMBER_SUFFIX_PATTERN}$`,
  "i",
);

function cleanText(value?: string | null): string | undefined {
  if (!value) return undefined;
  const text = decodeHTMLEntities(String(value))
    .replace(/<[^>]+>/g, " ")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
  return text || undefined;
}

async function fetchBdphileHtml(url: string): Promise<string | null> {
  try {
    const response = await fetchGetWithFlareFallback(url, {
      headers: BDPHILE_HEADERS,
      responseType: "text",
      transformResponse: [(data) => data],
      timeout: 15_000,
      validateStatus: () => true,
    });
    const html = String(response.data || "");
    if (response.status >= 400 || !html.trim()) return null;
    return html;
  } catch {
    return null;
  }
}

const REVUE_INDEX_ANCHOR_RE =
  /<a[^>]+href=["'][^"']*\/revue\/view\/(\d+)\/["'][^>]*>([^<]+)<\/a>/gi;

export function parseBdphileRevueIndexPage(html: string): BdphileRevue[] {
  const revues: BdphileRevue[] = [];
  for (const match of html.matchAll(REVUE_INDEX_ANCHOR_RE)) {
    const label = cleanText(match[2]);
    if (!label) continue;
    revues.push({ id: match[1], label });
  }
  return revues;
}

let revueIndexCache: { at: number; revues: BdphileRevue[] } | null = null;

export function resetBdphileRevueIndexCache(): void {
  revueIndexCache = null;
}

export async function fetchBdphileRevueIndex(): Promise<BdphileRevue[]> {
  if (revueIndexCache && Date.now() - revueIndexCache.at < REVUE_INDEX_TTL_MS) {
    return revueIndexCache.revues;
  }

  const byId = new Map<string, BdphileRevue>();
  for (let page = 0; page < REVUE_INDEX_MAX_PAGES; page += 1) {
    const start = page * REVUE_INDEX_PAGE_SIZE;
    const url =
      start === 0
        ? `${BDPHILE_BASE_URL}/revue/`
        : `${BDPHILE_BASE_URL}/revue/?start=${start}`;
    const html = await fetchBdphileHtml(url);
    if (!html) break;

    const before = byId.size;
    const entries = parseBdphileRevueIndexPage(html);
    for (const revue of entries) {
      if (!byId.has(revue.id)) byId.set(revue.id, revue);
    }
    if (byId.size === before || entries.length < REVUE_INDEX_PAGE_SIZE) break;
  }

  const revues = Array.from(byId.values());
  if (revues.length > 0) {
    revueIndexCache = { at: Date.now(), revues };
  }
  return revues;
}

function seriesQueryFromTitle(title: string): string {
  return stripVolumeMarkersFromTitle(horsSerieSeriesPart(title) ?? title);
}

/** Trailing numbering-suffix token of a revue label ("Super Picsou Géant bis" → "bis"). */
function revueLabelSuffixToken(label: string): string | null {
  const last = label.trim().split(/\s+/).at(-1) ?? "";
  return VOLUME_SUFFIX_TOKEN_RE.test(last) ? last.toLowerCase() : null;
}

function revueBaseLabel(label: string): string {
  const suffix = revueLabelSuffixToken(label);
  if (suffix) return label.trim().split(/\s+/).slice(0, -1).join(" ");
  return horsSerieSeriesPart(label) ?? label;
}

const REVUE_MIN_SIMILARITY = 0.55;
const MAX_REVUE_CANDIDATES = 3;

/**
 * Sibling revues carry the issue-form in their name ("Super Picsou Géant
 * bis", "Super Picsou Geant Hors série"): a suffixed/hors-série request only
 * matches same-form revues and vice versa, so a bis or HS issue can never
 * resolve inside the regular numbering (nor the reverse).
 */
export function rankBdphileRevues(
  query: string,
  revues: BdphileRevue[],
): BdphileRevue[] {
  const queryIssue = volumeNumberFromTitle(query);
  const querySuffix = queryIssue?.match(
    new RegExp(`(${VOLUME_NUMBER_SUFFIX_PATTERN})$`, "i"),
  )?.[1];
  const queryHorsSerie = hasHorsSerieMarker(query);
  const target = seriesQueryFromTitle(query);

  return revues
    .filter((revue) => {
      const suffix = revueLabelSuffixToken(revue.label);
      const horsSerie = hasHorsSerieMarker(revue.label);
      if (queryHorsSerie !== horsSerie) return false;
      if (suffix && suffix !== querySuffix?.toLowerCase()) return false;
      return true;
    })
    .map((revue) => ({
      revue,
      // A revue matching the request's exact form ("… bis" for n°100bis)
      // outranks the higher-scoring base revue: it is where the issue lives.
      formMatch: revueLabelSuffixToken(revue.label) ? 1 : 0,
      score: Math.max(
        metadataTitleSimilarity(target, revue.label),
        metadataTitleSimilarity(target, revueBaseLabel(revue.label)),
      ),
    }))
    .filter((entry) => entry.score >= REVUE_MIN_SIMILARITY)
    .sort((a, b) => b.formMatch - a.formMatch || b.score - a.score)
    .map((entry) => entry.revue);
}

const REVUE_ISSUE_LINK_RE =
  /<a[^>]+href=["']([^"']*\/revue\/numero\/(\d+)\/)["'][^>]+title=["']([^"']+)["']/gi;

/** Catalog labels code hors-série issues as "Numéro HS 5" / "Numéro HS 2022/06". */
const ISSUE_LABEL_HORS_SERIE_RE = /\bhs\b/i;

export function parseBdphileRevueIssueLinks(
  html: string,
): BdphileRevueIssueLink[] {
  const seen = new Set<string>();
  const links: BdphileRevueIssueLink[] = [];

  for (const match of html.matchAll(REVUE_ISSUE_LINK_RE)) {
    const numeroId = match[2];
    if (seen.has(numeroId)) continue;
    const label = cleanText(match[3]);
    if (!label) continue;
    const horsSerie =
      ISSUE_LABEL_HORS_SERIE_RE.test(label) || hasHorsSerieMarker(label);
    const issueNumber =
      volumeNumberFromTitle(label) ??
      normalizeVolumeNumber(label.replace(/^\D+/, ""));
    if (issueNumber === "NaN") continue;
    seen.add(numeroId);
    links.push({ numeroId, path: match[1], issueNumber, horsSerie });
  }

  return links;
}

/**
 * In a suffix-named revue the issues are labelled with the bare number
 * ("Numéro 100" inside "Super Picsou Géant bis" IS n°100bis), so a suffixed
 * request looks up its numeric part there — and the exact label elsewhere.
 */
/** Issue label expected inside a revue for the requested title. */
export function expectedBdphileIssueNumber(
  query: string,
  revueLabel: string,
): string | null {
  const queryIssue = volumeNumberFromTitle(query);
  if (!queryIssue) return null;

  const revueSuffix = revueLabelSuffixToken(revueLabel);
  return revueSuffix && queryIssue.endsWith(revueSuffix)
    ? queryIssue.slice(0, -revueSuffix.length)
    : queryIssue;
}

export function pickBdphileIssueLink(
  links: BdphileRevueIssueLink[],
  query: string,
  revueLabel: string,
): BdphileRevueIssueLink | null {
  const expected = expectedBdphileIssueNumber(query, revueLabel);
  if (!expected) return null;

  const horsSerie = hasHorsSerieMarker(query);
  return (
    links.find(
      (link) => link.horsSerie === horsSerie && link.issueNumber === expected,
    ) ?? null
  );
}

/** Value of the element right after a `<dt>label</dt>`-style label; empty stays empty. */
const REVUE_ISSUES_PAGE_SIZE = 42;
const MAX_ISSUE_PAGES_PER_REVUE = 8;

/**
 * Large revues paginate their issues (?start=N, 42 per page) in ascending
 * numeric order — hop toward the requested number instead of walking every
 * page (Picsou magazine alone has ~19 pages).
 */
export async function findBdphileIssueLink(
  revueId: string,
  query: string,
  revueLabel: string,
): Promise<BdphileRevueIssueLink | null> {
  const expected = expectedBdphileIssueNumber(query, revueLabel);
  if (!expected) return null;
  const target = Number.parseInt(expected, 10);

  const visited = new Set<number>();
  let start = 0;

  for (let hop = 0; hop < MAX_ISSUE_PAGES_PER_REVUE; hop += 1) {
    if (start < 0 || visited.has(start)) return null;
    visited.add(start);

    const url =
      start === 0
        ? `${BDPHILE_BASE_URL}/revue/view/${revueId}/`
        : `${BDPHILE_BASE_URL}/revue/view/${revueId}/?start=${start}`;
    const html = await fetchBdphileHtml(url);
    if (!html) return null;

    const links = parseBdphileRevueIssueLinks(html);
    const match = pickBdphileIssueLink(links, query, revueLabel);
    if (match) return match;
    if (!Number.isFinite(target)) return null;

    const numeric = links
      .filter((link) => !link.horsSerie)
      .map((link) => Number.parseInt(link.issueNumber, 10))
      .filter((value) => Number.isFinite(value));
    if (numeric.length === 0) return null;

    const min = Math.min(...numeric);
    const max = Math.max(...numeric);
    const maxStart = Math.max(
      0,
      ...Array.from(html.matchAll(/\?start=(\d+)/g), (m) =>
        Number.parseInt(m[1], 10),
      ).filter((value) => Number.isFinite(value)),
    );

    if (target < min) {
      start -= REVUE_ISSUES_PAGE_SIZE;
    } else if (target > max) {
      const hopPages = Math.max(
        1,
        Math.floor((target - max) / REVUE_ISSUES_PAGE_SIZE),
      );
      start = Math.min(start + hopPages * REVUE_ISSUES_PAGE_SIZE, maxStart);
      while (visited.has(start) && start > 0) {
        start -= REVUE_ISSUES_PAGE_SIZE;
      }
    } else {
      // In range for this page but absent: the revue does not have it.
      return null;
    }
  }

  return null;
}

function labelledValue(html: string, label: string): string | undefined {
  const match = html.match(
    new RegExp(`${label}\\s*<\\/[^>]+>\\s*<[^>]+>([^<]*)<`, "i"),
  );
  return cleanText(match?.[1]);
}

/** "242 pages - 4.9€" → page count + catalog list price in cents. */
export function parseBdphileFormatField(value?: string | null): {
  pageCount?: number;
  priceNewCents?: number;
  formatLabel?: string;
} {
  const text = cleanText(value);
  if (!text) return {};

  const pageMatch = text.match(/(\d+)\s*pages?\b/i);
  const pageCount = pageMatch ? Number.parseInt(pageMatch[1], 10) : Number.NaN;

  const priceMatch = text.match(/(\d+(?:[.,]\d+)?)\s*€/);
  const priceNewCents = priceMatch
    ? Math.round(Number.parseFloat(priceMatch[1].replace(",", ".")) * 100)
    : Number.NaN;

  return {
    ...(Number.isFinite(pageCount) && pageCount > 0 ? { pageCount } : {}),
    ...(Number.isFinite(priceNewCents) && priceNewCents > 0
      ? { priceNewCents }
      : {}),
    formatLabel: text,
  };
}

function parseBdphileDescription(html: string): string | undefined {
  const block = html.match(
    /Description\s*<\/[^>]+>([\s\S]*?)(?=Rechercher un num|<footer|<\/main|$)/i,
  )?.[1];
  if (!block) return undefined;
  const text = decodeHTMLEntities(block)
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return text || undefined;
}

export function composeBdphileIssueTitle(
  revueLabel: string,
  issueLabel: string,
): { title: string; issueNumber: string } {
  const suffix = revueLabelSuffixToken(revueLabel);
  const normalizedIssue = normalizeVolumeNumber(issueLabel);

  if (suffix && /^\d+$/.test(normalizedIssue)) {
    return {
      title: `${revueBaseLabel(revueLabel)} n°${normalizedIssue}${suffix}`,
      issueNumber: `${normalizedIssue}${suffix}`,
    };
  }

  return {
    title: `${revueLabel} n°${normalizedIssue}`,
    issueNumber: normalizedIssue,
  };
}

export function parseBdphileIssuePage(
  html: string,
  sourceUrl: string,
): BdphileIssue | null {
  const id = sourceUrl.match(/\/revue\/numero\/(\d+)\//)?.[1];
  if (!id) return null;

  const titleTag = cleanText(html.match(/<title>([^<]*)<\/title>/i)?.[1]);
  const titleMatch = titleTag?.match(/^(.*?)\s+Num[ée]ro\s+(.+?)\s*(?:\||$)/i);
  const revueName = cleanText(titleMatch?.[1]);
  const issueLabel = cleanText(titleMatch?.[2]);
  if (!revueName || !issueLabel) return null;

  const { title, issueNumber } = composeBdphileIssueTitle(
    revueName,
    issueLabel,
  );

  const coverPath = html.match(
    /static\.bdphile\.fr\/images\/media\/revue\/\d+\.jpg/i,
  )?.[0];

  const format = parseBdphileFormatField(labelledValue(html, "Format"));

  return {
    id,
    title,
    sourceUrl,
    issueNumber,
    revueName,
    releaseDate: labelledValue(html, "Date de parution"),
    publisher: labelledValue(html, "Éditeur"),
    description: parseBdphileDescription(html),
    imageUrl: coverPath ? `https://${coverPath}` : undefined,
    issn: labelledValue(html, "ISSN"),
    periodicity: labelledValue(html, "Périodicité"),
    pageCount: format.pageCount,
    priceNewCents: format.priceNewCents,
    formatLabel: format.formatLabel,
  };
}

export function absoluteBdphileUrl(value: string): string {
  if (/^https?:\/\//i.test(value)) return value;
  return `${BDPHILE_BASE_URL}${value.startsWith("/") ? "" : "/"}${value}`;
}

export async function fetchBdphileIssueByUrl(
  url: string,
): Promise<BdphileIssue | null> {
  const html = await fetchBdphileHtml(url);
  if (!html) return null;
  return parseBdphileIssuePage(html, url);
}

export async function fetchBdphileIssueById(
  numeroId: string,
): Promise<BdphileIssue | null> {
  const id = numeroId.trim();
  if (!id) return null;
  return fetchBdphileIssueByUrl(absoluteBdphileUrl(`/revue/numero/${id}/`));
}

export async function fetchBdphileMetadata(
  query: string,
): Promise<BdphileIssue | null> {
  const trimmed = query.trim();
  if (!trimmed) return null;
  // Revue issues are only identifiable by their number.
  if (!volumeNumberFromTitle(trimmed)) return null;

  const revues = await fetchBdphileRevueIndex();
  const ranked = rankBdphileRevues(trimmed, revues).slice(
    0,
    MAX_REVUE_CANDIDATES,
  );

  for (const revue of ranked) {
    const link = await findBdphileIssueLink(revue.id, trimmed, revue.label);
    if (!link) continue;

    const issueUrl = absoluteBdphileUrl(link.path);
    const issueHtml = await fetchBdphileHtml(issueUrl);
    if (!issueHtml) continue;

    const issue = parseBdphileIssuePage(issueHtml, issueUrl);
    if (!issue) continue;
    return issue;
  }

  return null;
}
