/**
 * Moisson du relevé 火の国庵 → `data/naruto/carddass/facts-hinokunian.json`.
 *
 * 53 pages, une par sortie japonaise : les 15 volumes, les starters nommés, les
 * feuilles jumbo, COIN＋, plus les 4 vagues Data Carddass. Chacune donne
 * référence, nom japonais et rareté.
 *
 * Fichier à part de `cards-index.json`, comme `facts-ja.json` : c'est un relevé
 * d'une source, pas le catalogue. Le versement dans les titres se décide après,
 * avec la corroboration des autres relevés.
 *
 * Le site est un site perso servi en SHIFT_JIS ; la cadence reste basse.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { httpGet } from "@/lib/http/httpClient";
import { dataRoot } from "@/lib/runtimeData";

import ledger from "./curated/sources/hinokunian-jp.json";
import { narutoDiskCardId } from "./collectorIdentity";
import { NARUTO_PACK_ID } from "./packs";
import {
  decodeHinokunianHtml,
  hinokunianPageUrl,
  parseHinokunianPage,
  type HinokunianCard,
} from "./parseHinokunian";

export const HINOKUNIAN_FACTS_FILE = "facts-hinokunian.json";

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15";
const DEFAULT_DELAY_MS = 900;

export type HinokunianRelease = {
  path: string;
  label: string;
  cards: HinokunianCard[];
};

export type HinokunianFactsFile = {
  version: 1;
  source: string;
  lang: "ja";
  capturedAt: string;
  releaseCount: number;
  cardCount: number;
  releases: HinokunianRelease[];
};

const sleep = (ms: number) =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

/**
 * `root` est la **racine du pack** (`data/naruto/carddass`), comme partout
 * ailleurs dans ce module — `writeCarteSemaineReport` prend la même. Passer la
 * racine des données doublait le chemin en silence : la moisson restait
 * introuvable et le versement des noms ne nommait rien, sans une erreur.
 */
export function hinokunianFactsPath(root?: string): string {
  const pack = root ?? path.join(dataRoot(), NARUTO_PACK_ID);
  return path.join(pack, HINOKUNIAN_FACTS_FILE);
}

export function loadHinokunianFacts(root?: string): HinokunianFactsFile | null {
  try {
    const raw = JSON.parse(
      readFileSync(hinokunianFactsPath(root), "utf8"),
    ) as HinokunianFactsFile;
    return raw?.version === 1 && raw.releases ? raw : null;
  } catch {
    return null;
  }
}

/** Les pages déclarées au ledger. */
export function hinokunianPages(): { path: string; label: string }[] {
  return (ledger.pages ?? []) as { path: string; label: string }[];
}

async function fetchPage(url: string, delayMs: number): Promise<string | null> {
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const res = await httpGet(url, {
        headers: {
          "User-Agent": UA,
          Accept: "text/html,*/*",
          "Accept-Language": "ja,en;q=0.8",
          Referer: "https://hinokunian.konohashigure.com/cardseal.html",
        },
        responseType: "arraybuffer",
        timeout: 25_000,
        validateStatus: (status) => status === 200,
      });
      const data = (res as { data?: ArrayBuffer }).data;
      return data ? decodeHinokunianHtml(new Uint8Array(data)) : null;
    } catch {
      if (attempt === 3) return null;
      await sleep(Math.max(delayMs, 600) * attempt * 2);
    }
  }
  return null;
}

/**
 * Les noms japonais du relevé, prêts à être versés : un identifiant de disque
 * et un nom, sans doublon.
 *
 * Une référence peut revenir dans plusieurs sorties — une réimpression garde
 * son numéro. Le premier nom rencontré gagne : ils concordent, et prendre le
 * dernier ferait dépendre le résultat de l'ordre des pages.
 *
 * Les cartes de borne (`DN`, `DT`) restent dans la liste : elles ne
 * correspondent à aucun tirage aujourd'hui et ne nomment donc rien, mais le
 * jour où la ligne arcade sera frappée, leurs noms seront déjà là.
 */
export function hinokunianJaNames(
  root?: string,
): { diskHint: string; name: string }[] {
  const facts = loadHinokunianFacts(root);
  if (!facts) return [];
  const out: { diskHint: string; name: string }[] = [];
  const seen = new Set<string>();
  for (const release of facts.releases) {
    for (const card of release.cards) {
      if (!card.name) continue;
      const disk = narutoDiskCardId(card.printed);
      if (!disk || seen.has(disk)) continue;
      seen.add(disk);
      out.push({ diskHint: disk, name: card.name });
    }
  }
  return out;
}

export async function scrapeHinokunian(
  opts: { root?: string; delayMs?: number; limit?: number } = {},
): Promise<{ releases: number; cards: number; failed: number; file: string }> {
  const delayMs = opts.delayMs ?? DEFAULT_DELAY_MS;
  let pages = hinokunianPages();
  if (opts.limit && opts.limit > 0) pages = pages.slice(0, opts.limit);

  console.log(`── 火の国庵 : ${pages.length} page(s) à lire`);
  const releases: HinokunianRelease[] = [];
  let failed = 0;
  for (const [index, page] of pages.entries()) {
    if (index > 0 && delayMs > 0) await sleep(delayMs);
    const html = await fetchPage(hinokunianPageUrl(page.path), delayMs);
    const cards = html ? parseHinokunianPage(html) : [];
    if (!html) {
      failed += 1;
      continue;
    }
    releases.push({ path: page.path, label: page.label, cards });
    console.log(
      `   ${String(index + 1).padStart(2)}/${pages.length} ${page.label} → ${cards.length} cartes`,
    );
  }

  const cardCount = releases.reduce((sum, r) => sum + r.cards.length, 0);
  const file: HinokunianFactsFile = {
    version: 1,
    source: "https://hinokunian.konohashigure.com/",
    lang: "ja",
    capturedAt: new Date().toISOString(),
    releaseCount: releases.length,
    cardCount,
    releases,
  };
  const dest = hinokunianFactsPath(opts.root);
  if (!existsSync(path.dirname(dest))) {
    mkdirSync(path.dirname(dest), { recursive: true });
  }
  writeFileSync(dest, `${JSON.stringify(file, null, 2)}\n`, "utf8");
  console.log(
    JSON.stringify({
      hinokunian: true,
      releases: releases.length,
      cards: cardCount,
      failed,
    }),
  );
  return { releases: releases.length, cards: cardCount, failed, file: dest };
}
