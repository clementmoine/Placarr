/**
 * Parse `window.NM_SIM_CARDS` sur narutomarket.com/{locale}/play#sim.
 * Corpus démo (leaders + personnages + C-001 / S-001) avec noms localisés.
 */
import { normalizeNarutoMarketRef } from "./parseNarutoMarket";

export type NarutoMarketSimCard = {
  code: string;
  name: string;
  imagePath: string;
  text: string;
  traits: string;
  pagePath: string;
};

export type NarutoMarketSimIdentity = {
  setCode: "demo";
  number: string;
};

const ORIGIN = "https://narutomarket.com";

export function narutoMarketSimPlayUrl(locale = "fr"): string {
  const code = locale.trim().toLowerCase() || "fr";
  return `${ORIGIN}/${code}/play`;
}

export function absoluteNarutoMarketSimUrl(pathOrUrl: string): string {
  const t = pathOrUrl.trim();
  if (!t) return ORIGIN;
  if (/^https?:\/\//i.test(t)) return t;
  return `${ORIGIN}${t.startsWith("/") ? t : `/${t}`}`;
}

/** Strip `?v=` cache-buster. */
export function narutoMarketSimFaceUrl(imagePath: string): string {
  const abs = absoluteNarutoMarketSimUrl(imagePath);
  try {
    const u = new URL(abs);
    u.search = "";
    return u.toString();
  } catch {
    return abs.split("?")[0] ?? abs;
  }
}

export function narutoMarketSimIdentity(
  code: string,
): NarutoMarketSimIdentity | null {
  const number = normalizeNarutoMarketRef(code);
  if (!number) return null;
  return { setCode: "demo", number };
}

/**
 * Extrait le blob JSON `window.NM_SIM_CARDS = {…};`.
 * Retourne [] si absent / invalide.
 */
export function parseNarutoMarketSimCards(html: string): NarutoMarketSimCard[] {
  const m = html.match(
    /window\.NM_SIM_CARDS\s*=\s*(\{[\s\S]*?\})\s*;\s*window\.NM_SIM_T/,
  );
  if (!m?.[1]) return [];
  let raw: unknown;
  try {
    raw = JSON.parse(m[1]);
  } catch {
    return [];
  }
  if (!raw || typeof raw !== "object") return [];

  const out: NarutoMarketSimCard[] = [];
  for (const [code, value] of Object.entries(
    raw as Record<string, unknown>,
  )) {
    if (!value || typeof value !== "object") continue;
    const row = value as Record<string, unknown>;
    const name = typeof row.name === "string" ? row.name.trim() : "";
    const img = typeof row.img === "string" ? row.img.trim() : "";
    if (!code.trim() || !name || !img) continue;
    out.push({
      code: code.trim().toUpperCase(),
      name,
      imagePath: img,
      text: typeof row.text === "string" ? row.text : "",
      traits: typeof row.traits === "string" ? row.traits : "",
      pagePath: typeof row.url === "string" ? row.url.trim() : "",
    });
  }
  return out.sort((a, b) => a.code.localeCompare(b.code));
}
