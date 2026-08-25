#!/usr/bin/env tsx
/**
 * Remoissonne les visuels de produit qui vivent sous `staging/`.
 *
 *   npx tsx src/providers/narutoccg/harvest/harvestProductPackshots.ts
 *
 * Ces trois lots étaient arrivés dans `staging/` par des scripts jetables, ce
 * qui violait la règle du pack : **`staging/` doit se reconstruire**. Sans
 * générateur au dépôt, un `rm -rf staging/` les perdait définitivement, et
 * personne ne pouvait vérifier d'où ils venaient.
 *
 * Chaque lot est piloté par son relevé curé, jamais par une liste écrite ici :
 *
 *   - `carddass-official/` ← `carddass-official-products.json` (fiches Bandai)
 *   - `comicplanet-de/`    ← `comicplanet-de.json` (packshots allemands)
 *   - `suruga-kaitori/`    ← `suruga-ya-kaitori-packshots.json` (photos de rachat)
 *
 * Ce qui est **fait à la main** ne passe pas par ici : badges de série, logo du
 * jeu, emballages photographiés, sachets détourés et retouches de cadrage
 * vivent sous `curated/products/`, hors de portée d'une remoisson.
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { httpGet } from "@/lib/http/httpClient";
import { dataRoot } from "@/lib/runtimeData";

import comicplanet from "../curated/sources/comicplanet-de.json";
import official from "../curated/sources/carddass-official-products.json";
import surugaLedger from "../curated/sources/suruga-ya-kaitori-packshots.json";
import tvtokyo from "../curated/sources/tvtokyo-goods.json";
import { harvestBandaiPackshots } from "@/providers/shared/bandaiPackshots";

import { NARUTO_PACK_ID } from "../packs";
import { volumeOfficialProducts } from "../volumeOfficialProducts";

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15";
const DELAY_MS = 1200;

export type HarvestResult = { folder: string; written: number; failed: number };

const sleep = (ms: number) =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

function stagingDir(folder: string, root?: string): string {
  const dir = path.join(
    root ?? path.join(dataRoot(), NARUTO_PACK_ID),
    "staging",
    folder,
  );
  mkdirSync(dir, { recursive: true });
  return dir;
}

async function download(
  url: string,
  dest: string,
  referer?: string,
): Promise<boolean> {
  try {
    const res = await httpGet(url, {
      headers: { "User-Agent": UA, ...(referer ? { Referer: referer } : {}) },
      responseType: "arraybuffer",
      timeout: 30_000,
      validateStatus: (status) => status === 200,
    });
    const data = (res as { data?: ArrayBuffer }).data;
    if (!data) return false;
    writeFileSync(dest, Buffer.from(data));
    return true;
  } catch {
    return false;
  }
}

/**
 * Le nom de fichier attendu par les specs, pour un JAN donné.
 * Les specs sont la seule autorité : les recalculer ici les ferait diverger.
 */
function officialFilesByJan(): Map<string, string> {
  const out = new Map<string, string>();
  /*
    Les specs du 疾風伝 étaient dans cette liste. Elles sont parties avec leur
    jeu le 2026-08-21 : ce pack ne rapatrie plus que ses propres visuels, et
    l'autre fait de même depuis son relevé.
  */
  for (const spec of volumeOfficialProducts()) {
    /*
      L'acte 1 n'a pas de JAN : Bandai ne lui a jamais fait de fiche, et son
      visuel vient du miroir carddas.com, pas du CDN Akamai. Rien à moissonner
      ici, donc rien à indexer.
    */
    if (spec.jan) out.set(spec.jan, spec.stagingFile);
  }
  return out;
}

export async function harvestCarddassOfficial(
  opts: { root?: string; force?: boolean } = {},
): Promise<HarvestResult> {
  const result = await harvestBandaiPackshots({
    rows: official.products,
    fileByJan: officialFilesByJan(),
    destDir: stagingDir("carddass-official", opts.root),
    force: opts.force,
    delayMs: DELAY_MS,
  });
  return { folder: "carddass-official", ...result };
}

export async function harvestComicplanetDe(
  opts: { root?: string; force?: boolean } = {},
): Promise<HarvestResult> {
  const dir = stagingDir("comicplanet-de", opts.root);
  let written = 0;
  let failed = 0;
  for (const row of comicplanet.products) {
    if (!row.image) continue;
    const dest = path.join(dir, `${row.slug}.png`);
    if (!opts.force && existsSync(dest)) continue;
    if (await download(row.image, dest, "https://www.comicplanet.de/"))
      written += 1;
    else failed += 1;
    await sleep(DELAY_MS);
  }
  return { folder: "comicplanet-de", written, failed };
}

export async function harvestSurugaKaitori(
  opts: { root?: string; force?: boolean } = {},
): Promise<HarvestResult> {
  const dir = stagingDir("suruga-kaitori", opts.root);
  let written = 0;
  let failed = 0;
  for (const row of surugaLedger.products) {
    const dest = path.join(dir, `${row.slug}.webp`);
    if (!opts.force && existsSync(dest)) continue;
    /*
      Le site est derrière Cloudflare, son CDN ne l'est pas : on ne demande
      jamais la page, seulement l'image, par son identifiant.
    */
    const url = `https://cdn.suruga-ya.jp/database/pics_webp/game/${row.id}.jpg.webp`;
    if (await download(url, dest)) written += 1;
    else failed += 1;
    await sleep(DELAY_MS);
  }
  return { folder: "suruga-kaitori", written, failed };
}

export async function harvestTvTokyo(
  opts: { root?: string; force?: boolean } = {},
): Promise<HarvestResult> {
  const dir = stagingDir("tv-tokyo", opts.root);
  let written = 0;
  let failed = 0;
  for (const row of tvtokyo.products) {
    const dest = path.join(dir, `${row.slug}.jpg`);
    if (!opts.force && existsSync(dest)) continue;
    const url = `${tvtokyo.base}cardimg/${row.file}`;
    if (await download(url, dest, tvtokyo.base)) written += 1;
    else failed += 1;
    await sleep(DELAY_MS);
  }
  return { folder: "tv-tokyo", written, failed };
}

export async function harvestNarutoProductPackshots(
  opts: { root?: string; force?: boolean } = {},
): Promise<HarvestResult[]> {
  return [
    await harvestCarddassOfficial(opts),
    await harvestComicplanetDe(opts),
    await harvestSurugaKaitori(opts),
    await harvestTvTokyo(opts),
  ];
}

async function main(): Promise<void> {
  const force = process.argv.includes("--force");
  for (const r of await harvestNarutoProductPackshots({ force })) {
    console.log(
      `── ${r.folder.padEnd(20)} ${r.written} écrits, ${r.failed} échecs`,
    );
  }
}

if (process.argv[1]?.endsWith("harvestProductPackshots.ts")) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
