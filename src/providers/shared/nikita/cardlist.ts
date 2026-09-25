/**
 * tcg-db.nikita.jp — client générique des cardlists `/cardlist/{game}/`.
 *
 * Le site héberge les listes JA de plusieurs jeux Bandai (`blc` Bleach SCB,
 * `dbc` Dragon Ball Card Game, `nrt`/`nrts` Naruto…) avec le **même** HTML :
 * une ligne `<tr>` par carte, ref imprimée + titre en tête, liens `?exp=` /
 * `?ctype=`, face sur `/img/card/{game}/{ref}.jpg`.
 *
 * Ce module parse cette structure une fois pour toutes ; l'identité (comment
 * la ref imprimée devient un printKey) reste chez chaque provider.
 */
import { httpGet } from "@/lib/http/httpClient";

export const NIKITA_TCG_DB_ORIGIN = "https://tcg-db.nikita.jp";

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15";

export function nikitaCardlistPath(game: string): string {
  return `/cardlist/${game}/`;
}

export function nikitaFaceUrl(game: string, printedRef: string): string {
  return `${NIKITA_TCG_DB_ORIGIN}/img/card/${game}/${printedRef}.jpg`;
}

/** Pack sleeve shared by JA (and EN reprints of the same line). */
export function nikitaCardBackUrl(game: string): string {
  return `${NIKITA_TCG_DB_ORIGIN}/img/card/${game}/back.jpg`;
}

/** Une ligne brute de la cardlist — ref imprimée telle que le site l'écrit. */
export type NikitaCardlistRow = {
  /** Ref imprimée en majuscules (`S-001`, `D-5`, `PZ-12`…). */
  printedRef: string;
  /** Titre JA affiché. */
  nameJa: string;
  faceUrl: string;
  setLabel: string | null;
  cardTypeLabel: string | null;
};

const ROW_RE = /<tr>([\s\S]*?)<\/tr>/g;
const KEY = "[A-Z]+-?\\d+";
const EXP_RE = /\?exp=([^']+)'>([^<]+)<\/a>/;
const CTYPE_RE = /\?ctype=([^']+)'>([^<]+)<\/a>/;

/**
 * Parse les lignes d'une cardlist nikita. Dédoublonne par ref imprimée ;
 * ne rend que ce que la page affiche — jamais de titre inventé.
 *
 * Certaines faces n'existent que sous un suffixe de reprint (`B-014_2.jpg`) :
 * on conserve le stem fichier réel pour `faceUrl`, tout en identifiant la
 * carte par la ref sans suffixe.
 */
export function parseNikitaCardlistRows(
  html: string,
  game: string,
): NikitaCardlistRow[] {
  const imgRe = new RegExp(
    `/img/card/${game}/(${KEY})(_\\d+)?\\.jpg`,
    "i",
  );
  const headRe = new RegExp(
    `font-size:120%;'>\\s*(${KEY})\\s*　<a href='\\?name=[^']*'>([^<]+)</a>`,
    "i",
  );
  const out: NikitaCardlistRow[] = [];
  const seen = new Set<string>();
  for (const match of html.matchAll(ROW_RE)) {
    const row = match[1] ?? "";
    const img = imgRe.exec(row);
    const head = headRe.exec(row);
    const key = (img?.[1] ?? head?.[1] ?? "").toUpperCase();
    const name = (head?.[2] ?? "").trim();
    if (!key || !name) continue;
    if (seen.has(key)) continue;
    seen.add(key);
    const exp = EXP_RE.exec(row);
    const ctype = CTYPE_RE.exec(row);
    const faceStem = img
      ? `${img[1]!.toUpperCase()}${img[2] ?? ""}`
      : key;
    out.push({
      printedRef: key,
      nameJa: name,
      faceUrl: nikitaFaceUrl(game, faceStem),
      setLabel: exp?.[2]?.trim() || null,
      cardTypeLabel: ctype?.[2]?.trim() || null,
    });
  }
  return out;
}

/** GET de la cardlist avec les en-têtes attendus par le site. */
export async function fetchNikitaCardlistHtml(game: string): Promise<string> {
  const url = `${NIKITA_TCG_DB_ORIGIN}${nikitaCardlistPath(game)}`;
  const res = await httpGet<string>(url, {
    headers: {
      "User-Agent": UA,
      Accept: "text/html,*/*;q=0.8",
      "Accept-Language": "ja,en;q=0.8",
      Referer: `${NIKITA_TCG_DB_ORIGIN}/explist/${game}/`,
    },
    responseType: "text",
    timeout: 60_000,
    validateStatus: (status) => status === 200,
  });
  return typeof res.data === "string" ? res.data : String(res.data ?? "");
}
