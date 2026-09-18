/**
 * dbzcollection.fr — CMS 2v2 partagé par plusieurs collections Bandai.
 *
 * Les **URLs**, le decode HTML, le GET listing/AJAX et le download d'image
 * sont identiques. Ce qui change par jeu, ce n'est pas le site : c'est la
 * **grammaire des tuiles** (JCC `D-1` + stats TCG vs Lamincards Regular/Silver
 * /Gold + `namesOnly` IT/ES). Les parseurs listing/AJAX restent chez le
 * provider.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { httpGet } from "@/lib/http/httpClient";
import { downloadCardFaceBytes } from "@/providers/shared/cardCatalogue/faceInstall";

export const DBZC_ORIGIN = "http://www.dbzcollection.fr/2v2";

export function dbzcAbsoluteUrl(pathOrUrl: string): string {
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
  const p = pathOrUrl.startsWith("/") ? pathOrUrl.slice(1) : pathOrUrl;
  return `${DBZC_ORIGIN}/${p}`;
}

export function dbzcSetListingUrl(ids: string, idc: string): string {
  return `${DBZC_ORIGIN}/cartes.php?idc=${idc.trim()}&ids=${ids.trim()}`;
}

export function dbzcCardInfoUrl(cardId: string): string {
  return `${DBZC_ORIGIN}/traitements_ajax/get_infos_detail_carte.php?id=${cardId.trim()}`;
}

export function dbzcPackInfoUrl(packId: string): string {
  return `${DBZC_ORIGIN}/traitements_ajax/get_infos_detail_pack.php?id=${packId.trim()}`;
}

/** Decode HTML entities from dbzcollection pages. */
export function decodeDbzcEntities(raw: string): string {
  return raw
    .replace(/&Agrave;/g, "À")
    .replace(/&agrave;/g, "à")
    .replace(/&Eacute;/g, "É")
    .replace(/&eacute;/gi, "é")
    .replace(/&Egrave;/g, "È")
    .replace(/&egrave;/gi, "è")
    .replace(/&Ecirc;/g, "Ê")
    .replace(/&ecirc;/g, "ê")
    .replace(/&Icirc;/g, "Î")
    .replace(/&icirc;/g, "î")
    .replace(/&Iuml;/g, "Ï")
    .replace(/&iuml;/g, "ï")
    .replace(/&Ocirc;/g, "Ô")
    .replace(/&ocirc;/gi, "ô")
    .replace(/&Ucirc;/g, "Û")
    .replace(/&ucirc;/g, "û")
    .replace(/&Uuml;/g, "Ü")
    .replace(/&uuml;/gi, "ü")
    .replace(/&Ccedil;/g, "Ç")
    .replace(/&ccedil;/g, "ç")
    .replace(/&deg;/gi, "°")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCharCode(Number(n)))
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Cellule `apercu_td_intitule` / `apercu_td_valeur` des fiches AJAX.
 */
export function extractDbzcTableField(
  html: string,
  label: string,
): string | null {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(
    `apercu_td_intitule[^>]*>\\s*${escaped}\\s*:?\\s*(?:<br\\s*\\/?>)?[\\s\\S]*?<\\/td>\\s*<td class="apercu_td_valeur"[^>]*>([\\s\\S]*?)<\\/td>`,
    "i",
  );
  const m = html.match(re);
  if (!m) return null;
  const value = decodeDbzcEntities(m[1]!.replace(/<[^>]+>/g, " "));
  return value || null;
}

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15";

export async function fetchDbzcText(
  url: string,
  opts: { minLength?: number } = {},
): Promise<string | null> {
  const minLength = opts.minLength ?? 100;
  try {
    const res = await httpGet<string>(url, {
      headers: { "User-Agent": UA, Accept: "text/html" },
      responseType: "text",
      timeout: 40_000,
      validateStatus: (status: number) => status === 200,
    });
    return typeof res.data === "string" && res.data.length >= minLength
      ? res.data
      : null;
  } catch {
    return null;
  }
}

export async function downloadDbzcImage(
  url: string,
  referer: string,
): Promise<Buffer | null> {
  return downloadCardFaceBytes(url, {
    referer,
    minBytes: 400,
    timeoutMs: 40_000,
  });
}

export const DBZC_DEFAULT_DELAY_MS = 80;

const sleep = (ms: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });

/**
 * Listing HTML, cache disque. `null` = le site n'a rien renvoyé.
 */
export async function loadDbzcListingHtml(input: {
  listingUrl: string;
  dest: string;
  force?: boolean;
  delayMs?: number;
}): Promise<string | null> {
  if (!input.force && existsSync(input.dest)) {
    const cached = readFileSync(input.dest, "utf8");
    if (cached.length >= 400) return cached;
  }
  const html = await fetchDbzcText(input.listingUrl, { minLength: 400 });
  if (!html) return null;
  mkdirSync(path.dirname(input.dest), { recursive: true });
  writeFileSync(input.dest, html, "utf8");
  const delay = input.delayMs ?? DBZC_DEFAULT_DELAY_MS;
  if (delay > 0) await sleep(delay);
  return html;
}
