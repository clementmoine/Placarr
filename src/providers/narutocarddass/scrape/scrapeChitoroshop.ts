/**
 * Moisson de chitoroshop → `data/naruto/carddass/staging/chitoroshop/`.
 *
 * La collection entière tient dans **une** requête : Shopify sert
 * `products.json?limit=250`, et la boutique en compte 227. Aucune raison de
 * paginer ni de marteler.
 *
 * Ce qu'on vient chercher, ce sont les **scans à plat en 1414×2000** : le
 * catalogue japonais manque de 703 faces, et cette boutique en a plusieurs par
 * carte. L'identification est le travail difficile — la fiche ne dit pas la
 * famille — et vit dans `parseChitoroshop.ts`.
 *
 * Rien n'est versé au catalogue ici. On écrit un relevé et des fichiers de
 * staging ; le versement se décide après, avec la corroboration des autres
 * sources, comme pour toutes les moissons de ce pack.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { httpGet } from "@/lib/http/httpClient";
import { dataRoot } from "@/lib/runtimeData";

import {
  narutoFamilyForPrefix,
  parseNarutoCollector,
} from "../collectorIdentity";
import { japaneseReleaseBands } from "../sources/japaneseVolumes";
import { NARUTO_PACK_ID } from "../packs";
import {
  chitoroVolumeSetCode,
  japaneseFamilyOf,
  normalizeShopName,
  parseChitoroTitle,
  resolveChitoroIdentity,
  resolveChitoroNameFamily,
  type ChitoroIdentity,
} from "../parse/parseChitoroshop";
import { saveNarutoFace } from "../narutoFaceBytes";

const COLLECTION =
  "https://chitoroshop.com/collections/naruto-tcg-cartes-a-lunite-japonaises-naruto/products.json?limit=250";
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15";

export const CHITOROSHOP_STAGING = "chitoroshop";

export type ShopifyProduct = {
  handle: string;
  title: string;
  body_html?: string;
  images?: { src: string; position?: number }[];
};

export type ChitoroRow = ChitoroIdentity & {
  handle: string;
  title: string;
  images: string[];
};

export type ChitoroHarvest = {
  products: number;
  identified: ChitoroRow[];
  /** Titres qui ne sont pas « Nom NNN » : autocollants, Data Carddass. */
  notCards: string[];
  /** Cartes dont aucun des deux signaux ne parle. */
  unresolved: string[];
  /** Les deux signaux se contredisent — jamais vu, et jamais tranché. */
  contradictions: string[];
};

export function stagingDir(root?: string): string {
  return path.join(
    root ?? path.join(dataRoot(), NARUTO_PACK_ID),
    "staging",
    CHITOROSHOP_STAGING,
  );
}

/**
 * `(nom anglais, numéro)` → famille japonaise, depuis les titres du catalogue.
 *
 * L'anglais et lui seul : c'est la langue de la boutique, et mêler le français
 * ou le japonais fait retomber le nombre de résolutions de 57 à 35 en créant
 * des homonymies entre familles.
 */
export function englishNameIndex(
  titles: readonly {
    family: string;
    number: number;
    lang: string;
    fullName: string | null;
  }[],
): Map<string, Set<string>> {
  const index = new Map<string, Set<string>>();
  for (const row of titles) {
    if (row.lang.toLowerCase() !== "en" || !row.fullName) continue;
    const family = japaneseFamilyOf(row.family);
    if (!family) continue;
    const key = `${normalizeShopName(row.fullName)}|${row.number}`;
    const set = index.get(key) ?? new Set<string>();
    set.add(family);
    index.set(key, set);
  }
  return index;
}

/** La famille que le volume désigne, quand il n'y en a qu'une possible. */
export function familyFromVolume(
  setCode: string | null,
  number: number,
): string | null {
  if (!setCode) return null;
  const hits = japaneseReleaseBands(setCode).filter(
    (band) => number >= band.from && number <= band.to,
  );
  return hits.length === 1 ? hits[0].family : null;
}

export function identifyChitoroProducts(input: {
  products: readonly ShopifyProduct[];
  nameIndex: Map<string, Set<string>>;
}): ChitoroHarvest {
  const identified: ChitoroRow[] = [];
  const notCards: string[] = [];
  const unresolved: string[] = [];
  const contradictions: string[] = [];

  for (const product of input.products) {
    const parsed = parseChitoroTitle(product.title);
    if (!parsed) {
      notCards.push(product.title);
      continue;
    }
    const byName = resolveChitoroNameFamily(
      input.nameIndex,
      parsed.name,
      parsed.number,
    );
    const byVolume = familyFromVolume(
      chitoroVolumeSetCode(`${product.title} ${product.body_html ?? ""}`),
      parsed.number,
    );
    const identity = resolveChitoroIdentity({
      number: parsed.number,
      byName,
      byVolume,
    });
    if (!identity) {
      if (byName && byVolume) contradictions.push(product.title);
      else unresolved.push(product.title);
      continue;
    }
    identified.push({
      ...identity,
      handle: product.handle,
      title: product.title,
      images: (product.images ?? []).map((image) => image.src),
    });
  }

  return {
    products: input.products.length,
    identified,
    notCards,
    unresolved,
    contradictions,
  };
}

export async function fetchChitoroProducts(): Promise<ShopifyProduct[]> {
  const response = await httpGet(COLLECTION, {
    headers: { "User-Agent": UA },
    timeout: 30_000,
  });
  const body = (response as { data?: unknown }).data;
  const parsed = (typeof body === "string" ? JSON.parse(body) : body) as {
    products?: ShopifyProduct[];
  };
  return parsed.products ?? [];
}

/** Écrit le relevé. Les visuels se rapatrient dans une seconde passe. */
export function writeChitoroLedger(
  harvest: ChitoroHarvest,
  root?: string,
): string {
  const dir = stagingDir(root);
  mkdirSync(dir, { recursive: true });
  const file = path.join(dir, "identified.json");
  writeFileSync(
    file,
    `${JSON.stringify(
      {
        source: COLLECTION,
        observed: new Date().toISOString().slice(0, 10),
        products: harvest.products,
        counts: {
          identified: harvest.identified.length,
          byBothSignals: harvest.identified.filter((r) => r.by === "both")
            .length,
          byNameOnly: harvest.identified.filter((r) => r.by === "name").length,
          byVolumeOnly: harvest.identified.filter((r) => r.by === "volume")
            .length,
          unresolved: harvest.unresolved.length,
          notCards: harvest.notCards.length,
          contradictions: harvest.contradictions.length,
        },
        identified: harvest.identified,
        unresolved: harvest.unresolved,
        notCards: harvest.notCards,
        contradictions: harvest.contradictions,
      },
      null,
      2,
    )}\n`,
  );
  return file;
}

export function chitoroStagingExists(root?: string): boolean {
  return existsSync(stagingDir(root));
}

/**
 * Rapatrie le scan de référence de chaque carte identifiée.
 *
 * **La première image, et elle seule.** Vérifié à l'œil sur trois produits, un
 * par famille : `images[0]` est le scan à plat de la face, les suivantes sont
 * les photos d'inventaire de la boutique — un exemplaire par photo, marqué d'une
 * étiquette « #N025 » incrustée. Le registre affirmait l'inverse ; c'est corrigé.
 *
 * Les octets d'origine sont écrits tels quels, sans réencodage : la source sert
 * du JPEG 1414×2000, et le classement par pixels décidera ensuite si ce scan
 * l'emporte sur celui déjà en place.
 */
export async function downloadChitoroFaces(input: {
  rows: readonly ChitoroRow[];
  /** Dossier `cards/` du pack. */
  cardsDir: string;
  force?: boolean;
  delayMs?: number;
  onProgress?: (message: string) => void;
}): Promise<{ written: number; skipped: number; failed: string[] }> {
  const delay = input.delayMs ?? 700;
  let written = 0;
  let skipped = 0;
  const failed: string[] = [];

  for (const row of input.rows) {
    const src = row.images[0];
    if (!src) continue;
    const cardId = `${row.family}${String(row.number).padStart(4, "0")}`;
    const diskFolder = narutoFamilyForPrefix(row.family);
    if (!diskFolder) continue;
    const dir = path.join(
      input.cardsDir,
      diskFolder,
      cardId,
      "ja",
    );
    if (!input.force && existsSync(path.join(dir, "art.chitoroshop.jpg"))) {
      skipped += 1;
      continue;
    }
    try {
      const response = await httpGet(src, {
        headers: { "User-Agent": UA },
        responseType: "arraybuffer",
        timeout: 30_000,
      });
      const data = (response as { data?: ArrayBuffer }).data;
      if (!data) throw new Error("vide");
      mkdirSync(dir, { recursive: true });
      const saved = await saveNarutoFace({
        cardDir: dir,
        buf: Buffer.from(data),
        source: "chitoroshop",
        lang: "ja",
        force: input.force,
      });
      if (saved === "ok") written += 1;
      else skipped += 1;
      input.onProgress?.(`   ${cardId} ← ${row.by}`);
    } catch {
      failed.push(cardId);
    }
    await new Promise((resolve) => {
      setTimeout(resolve, delay);
    });
  }
  return { written, skipped, failed };
}

type EnTitleRow = {
  family: string;
  number: number;
  lang: string;
  fullName: string;
};

/** EN CCG titles from cards-index → chitoro name index (`n`→`ni`, …). */
export function loadEnTitleRowsFromIndex(root: string): EnTitleRow[] {
  const file = path.join(root, "cards-index.json");
  if (!existsSync(file)) return [];
  const raw = JSON.parse(readFileSync(file, "utf8")) as {
    cards?: Record<
      string,
      { card?: string; langs?: { en?: { name?: string | null } } }
    >;
  };
  const rows: EnTitleRow[] = [];
  for (const entry of Object.values(raw.cards ?? {})) {
    const name = entry.langs?.en?.name?.trim();
    const card = entry.card?.trim();
    if (!name || !card) continue;
    const id = parseNarutoCollector(card);
    if (!id) continue;
    const family = japaneseFamilyOf(id.printedPrefix);
    if (!family) continue;
    rows.push({
      family: id.printedPrefix.toLowerCase(),
      number: id.number,
      lang: "en",
      fullName: name,
    });
  }
  return rows;
}

export type ScrapeChitoroshopOptions = {
  force?: boolean;
  root?: string;
  delayMs?: number;
  limit?: number;
  /** Ledger only — skip `cards/` writes. */
  stagingOnly?: boolean;
};

export async function scrapeNarutoChitoroshopCards(
  options: ScrapeChitoroshopOptions = {},
): Promise<void> {
  const root = path.join(options.root ?? dataRoot(), NARUTO_PACK_ID);
  const cardsDir = path.join(root, "cards");
  console.log(
    "── chitoroshop JA scans → cards/{family}/{ni####}/ja/art.chitoroshop.*",
  );
  const products = await fetchChitoroProducts();
  const nameIndex = englishNameIndex(loadEnTitleRowsFromIndex(root));
  let harvest = identifyChitoroProducts({ products, nameIndex });
  if (options.limit && options.limit > 0) {
    harvest = {
      ...harvest,
      identified: harvest.identified.slice(0, options.limit),
    };
  }
  const ledger = writeChitoroLedger(harvest, root);
  console.log(
    JSON.stringify({
      chitoroshop: true,
      products: harvest.products,
      identified: harvest.identified.length,
      unresolved: harvest.unresolved.length,
      ledger,
    }),
  );
  if (options.stagingOnly || harvest.identified.length === 0) return;
  const result = await downloadChitoroFaces({
    rows: harvest.identified,
    cardsDir,
    force: options.force,
    delayMs: options.delayMs,
    onProgress: (message) => console.log(message),
  });
  console.log(
    JSON.stringify({
      chitoroshopFaces: true,
      written: result.written,
      skipped: result.skipped,
      failed: result.failed.length,
    }),
  );
}
