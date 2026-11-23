/**
 * Fiche album Paninimania (`?pag=cid508_alb&idm=…`) — lecture des blocs
 * factuels publics : finitions (« Images Brillantes *bri : 17, 30… »),
 * période d'opération, seuil d'achat, prix de l'album, taille de pochette.
 *
 * La page est servie en Windows-1252 : la décoder en UTF-8 abîme les accents
 * et le signe « € ». Un bloc absent rend `null` / `[]` (jamais de devinette).
 */
import { httpGet } from "@/lib/http/httpClient";

import { parseFrenchDayMonthRange } from "../frenchDateRange";

export type PaninimaniaFinish = {
  /** Libellé tel qu'imprimé (« Images Brillantes »). */
  label: string;
  /** Abréviation de la fiche (`bri`, `pail`, `arg`), `null` si absente. */
  code: string | null;
  /** Numéros listés, tels quels (`17`, `C1`, `A`…). */
  numbers: string[];
};

export type PaninimaniaAlbumFacts = {
  finishes: PaninimaniaFinish[];
  operation: { start: string; end: string } | null;
  thresholdEur: number | null;
  albumEur: number | null;
  packSize: number | null;
};

function decodeEntities(raw: string): string {
  return raw
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCharCode(Number(n)))
    .replace(/&quot;/g, '"')
    .replace(/&#039;|&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&");
}

/** Texte brut de la page (balises retirées, espaces repliés). */
export function paninimaniaPageText(html: string): string {
  return decodeEntities(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/[ \t]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .trim();
}

/** Blocs `<div class="g0"><b>Images …</b><em>*code</em><b> : </b>n, n…</div>`. */
export function parsePaninimaniaFinishes(html: string): PaninimaniaFinish[] {
  const out: PaninimaniaFinish[] = [];
  const re =
    /<div class="g0">\s*<b>\s*(Images?\s[^<]+?)\s*<\/b>\s*(?:<em>\s*\*?([a-z]+)\s*<\/em>)?\s*<b>\s*:\s*<\/b>\s*([^<]+)<\/div>/gi;
  for (const m of html.matchAll(re)) {
    const label = decodeEntities(m[1]!).replace(/\s+/g, " ").trim();
    const numbers = m[3]!
      .split(/[,;]/)
      .map((n) => n.trim())
      .filter((n) => /^[A-Z]{0,2}\d{0,3}$/i.test(n) && n.length > 0);
    if (!label || !numbers.length) continue;
    out.push({ label, code: m[2]?.toLowerCase() ?? null, numbers });
  }
  return out;
}

function euros(raw: string | undefined): number | null {
  if (!raw) return null;
  const n = Number(raw.replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function parsePaninimaniaAlbumFacts(
  html: string,
): PaninimaniaAlbumFacts {
  const text = paninimaniaPageText(html);
  const opLine = text.match(/Op[ée]ration du ([^\n]+)/i)?.[1] ?? "";
  const pack = text.match(
    /(?:pochette|set) de (\d{1,2}) (?:images|stickers|cartes|autocollants)/i,
  );
  return {
    finishes: parsePaninimaniaFinishes(html),
    operation: opLine ? parseFrenchDayMonthRange(`du ${opLine}`) : null,
    thresholdEur: euros(text.match(/tranche de (\d+(?:,\d+)?)\s*€/i)?.[1]),
    albumEur: euros(text.match(/Album[^:\n]{0,60}:\s*(\d+,\d{2})\s*€/i)?.[1]),
    packSize: pack ? Number(pack[1]) : null,
  };
}

/** Octets d'une fiche → texte (Windows-1252, comme le serveur l'annonce). */
export function decodePaninimaniaHtml(bytes: ArrayBuffer | Uint8Array): string {
  return new TextDecoder("windows-1252").decode(bytes);
}

export async function fetchPaninimaniaAlbumHtml(
  url: string,
): Promise<string | null> {
  try {
    const res = await httpGet<ArrayBuffer>(url, {
      responseType: "arraybuffer",
      timeout: 30_000,
      validateStatus: (s) => s === 200,
    });
    const html = decodePaninimaniaHtml(res.data);
    return html.length > 400 ? html : null;
  } catch {
    return null;
  }
}
