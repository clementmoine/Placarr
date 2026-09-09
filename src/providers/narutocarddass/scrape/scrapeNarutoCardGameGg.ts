/**
 * Moisson de narutocardgame.gg → faces du CCG anglais.
 *
 * Une requête pour l'index — il tient les 4 452 cartes, set compris dans
 * l'URL — puis une par visuel. Les faces sont servies en **350×490**, bien
 * plus petites que ce que nous tenons déjà (jusqu'à 1414×2000) : elles ne
 * remplacent rien, mais elles couvrent ce qu'on n'a pas du tout, et le
 * classement par pixels les reléguera partout ailleurs.
 *
 * Rien n'est versé au catalogue ici : on écrit dans les dossiers carte et le
 * relevé, comme toutes les moissons de ce pack. Ce que la base ajoute — 140
 * cartes, dont deux familles de préfixes inconnues — se décide après.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { httpGet } from "@/lib/http/httpClient";
import { dataRoot } from "@/lib/runtimeData";

import { narutoFamilyForPrefix } from "../collectorIdentity";
import {
  existingNarutoArtForSource,
  extFromMagic,
  saveNarutoFace,
} from "../narutoFaceBytes";
import { NARUTO_PACK_ID } from "../packs";
import {
  ggArchiveIndexUrl,
  ggClassicImageUrl,
  parseGgCardIndex,
  type GgCard,
} from "../parse/parseNarutoCardGameGg";

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15";
const LANG = "en";

export const GG_STAGING = "narutocardgame-gg";

export function ggStagingDir(root?: string): string {
  return path.join(
    root ?? path.join(dataRoot(), NARUTO_PACK_ID),
    "staging",
    GG_STAGING,
  );
}

export async function fetchGgCardIndex(): Promise<GgCard[]> {
  const response = await httpGet(ggArchiveIndexUrl("classic-ccg"), {
    headers: { "User-Agent": UA },
    timeout: 60_000,
  });
  const html = String((response as { data?: unknown }).data ?? "");
  return parseGgCardIndex(html, "classic-ccg");
}

/** `n` + 1 → `n0001`, la forme que le catalogue emploie. */
export function ggDiskNumber(card: GgCard): string {
  return `${card.prefix}${String(card.number).padStart(4, "0")}`;
}

export function writeGgIndex(cards: readonly GgCard[], root?: string): string {
  const dir = ggStagingDir(root);
  mkdirSync(dir, { recursive: true });
  const file = path.join(dir, "cards.json");
  writeFileSync(
    file,
    `${JSON.stringify(
      {
        source: ggArchiveIndexUrl("classic-ccg"),
        observed: new Date().toISOString().slice(0, 10),
        cards: cards.length,
        rows: cards.map((card) => ({ ...card, number: ggDiskNumber(card) })),
      },
      null,
      2,
    )}\n`,
  );
  return file;
}

/**
 * Rapatrie les visuels, un par carte.
 *
 * Quatre mille requêtes sur un seul hôte : la cadence reste basse, et une
 * carte déjà servie n'est pas redemandée. Les octets d'origine sont écrits tels
 * quels — le format est du JPEG et le réencoder ne ferait que perdre.
 */
export async function downloadGgFaces(input: {
  cards: readonly GgCard[];
  cardsDir: string;
  /** `n` → `ninja` : le dossier disque de la famille. */
  folderOf: (prefix: string) => string | null;
  force?: boolean;
  delayMs?: number;
  onProgress?: (done: number, total: number) => void;
}): Promise<{ written: number; skipped: number; failed: string[] }> {
  const delay = input.delayMs ?? 350;
  let written = 0;
  let skipped = 0;
  const failed: string[] = [];

  for (const [index, card] of input.cards.entries()) {
    const folder = input.folderOf(card.prefix);
    if (!folder) {
      failed.push(`${card.prefix}${card.number} (famille inconnue)`);
      continue;
    }
    const id = ggDiskNumber(card);
    const dir = path.join(input.cardsDir, folder, id, LANG);
    if (!input.force && existingNarutoArtForSource(dir, "narutocardgamegg")) {
      skipped += 1;
      continue;
    }
    try {
      const response = await httpGet(ggClassicImageUrl(card), {
          headers: { "User-Agent": UA },
          responseType: "arraybuffer",
          timeout: 30_000,
        });
      const data = (response as { data?: ArrayBuffer }).data;
      if (!data) throw new Error("vide");
      const buf = Buffer.from(data);
      if (extFromMagic(buf) === ".bin") throw new Error("bin");
      const saved = await saveNarutoFace({
        cardDir: dir,
        buf,
        source: "narutocardgamegg",
        lang: LANG,
        force: input.force,
      });
      if (saved === "skip") skipped += 1;
      else written += 1;
    } catch {
      failed.push(id);
    }
    if ((index + 1) % 200 === 0) {
      input.onProgress?.(index + 1, input.cards.length);
    }
    await new Promise((resolve) => {
      setTimeout(resolve, delay);
    });
  }
  return { written, skipped, failed };
}

export type ScrapeNarutoCardGameGgOptions = {
  force?: boolean;
  delayMs?: number;
  limit?: number;
  packRoot?: string;
};

/** Index + download → `art.narutocardgamegg.*` under EN card folders. */
export async function scrapeNarutoCardGameGgCards(
  options: ScrapeNarutoCardGameGgOptions = {},
): Promise<{ written: number; skipped: number; failed: string[] }> {
  const packRoot =
    options.packRoot ?? path.join(dataRoot(), NARUTO_PACK_ID);
  const cards = await fetchGgCardIndex();
  writeGgIndex(cards, packRoot);
  const slice =
    typeof options.limit === "number" && options.limit > 0
      ? cards.slice(0, options.limit)
      : cards;
  console.log(
    `── narutocardgame.gg : ${slice.length}/${cards.length} faces EN → art.narutocardgamegg.*`,
  );
  const result = await downloadGgFaces({
    cards: slice,
    cardsDir: path.join(packRoot, "cards"),
    folderOf: (prefix) => narutoFamilyForPrefix(prefix),
    force: options.force,
    delayMs: options.delayMs,
    onProgress: (done, total) => {
      if (done % 200 === 0 || done === total) {
        console.log(`── narutocardgame.gg : ${done}/${total}`);
      }
    },
  });
  console.log(
    JSON.stringify({
      narutocardgamegg: true,
      written: result.written,
      skipped: result.skipped,
      failed: result.failed.length,
    }),
  );
  return result;
}
