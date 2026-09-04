/**
 * Pull the JP game data from nikita's text card list.
 *
 * The face pass (`scrapeNikitaNrt`) already visits the same site in `?mode=img`.
 * This one takes the other view — one page, 428 cards, with symbol, cost, the
 * four combat values, traits, battle attribute, target/effect and the flavour
 * line. It **joins onto ids we already hold** and never mints a print.
 *
 * The facts land in their own file rather than in `cards-index.json`:
 * `CardsIndexLangFiles` is shared by every pack, and a Naruto-only stat block
 * has no business in Lorcana's or Pokémon's shape. Same reasoning as the DBS
 * `masters_superset.json`.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { httpGet } from "@/lib/http/httpClient";
import { dataRoot } from "@/lib/runtimeData";

import { NARUTO_PACK_ID } from "../packs";
import {
  NIKITA_CARDLIST_PATH,
  parseNikitaCardlist,
  type NikitaCardFacts,
} from "../parse/parseNikitaCardlist";
import { NIKITA_NRT_ORIGIN } from "../parse/parseNikitaNrt";
import {
  narutoCardDiskFolder,
  parseNarutoCollector,
} from "../collectorIdentity";
import { narutoCardAbsDir } from "../narutoCardDisk";
import {
  existingNarutoArtForSource,
  extFromMagic,
  saveNarutoFace,
} from "../narutoFaceBytes";

export const NARUTO_STAGING_NIKITA_NRT_LIST = path.join(
  "staging",
  "nikita-nrt",
);
export const NARUTO_JA_FACTS_FILE = "facts-ja.json";
/** The 疾風伝 game on the same site — 忍伝 / 術伝 / 作伝, our `shi` / `mju` / `msa`. */
export const NIKITA_SHIPPUDEN_PATH = "/cardlist/nrts";

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15";

export type ScrapeNikitaCardlistOptions = {
  root?: string;
  /** Parse a file already on disk instead of fetching. */
  html?: string;
};

export type NarutoJaFactsFile = {
  version: 1;
  source: string;
  capturedAt: string;
  count: number;
  /** Keyed by disk id (`ni0001`) — the join key the rest of the pack speaks. */
  cards: Record<string, NarutoJaFacts>;
};

function packRoot(dataDir?: string): string {
  return path.join(dataDir ?? dataRoot(), NARUTO_PACK_ID);
}

export function narutoJaFactsPath(root?: string): string {
  /*
    `root` is already the pack dir when called from scrapeCards. Joining
    NARUTO_PACK_ID again silently doubled the path and the names never landed.
  */
  const pack = root ?? path.join(dataRoot(), NARUTO_PACK_ID);
  return path.join(pack, NARUTO_JA_FACTS_FILE);
}

export function loadNarutoJaFacts(root?: string): NarutoJaFactsFile | null {
  try {
    const raw = JSON.parse(
      readFileSync(narutoJaFactsPath(root), "utf8"),
    ) as NarutoJaFactsFile;
    return raw?.version === 1 && raw.cards ? raw : null;
  } catch {
    return null;
  }
}

/** Names only — combat stats stay in `facts-ja.json`, not `cards-index.json`. */
export function nikitaFactsJaNames(
  root?: string,
): { diskHint: string; name: string }[] {
  const facts = loadNarutoJaFacts(root);
  if (!facts) return [];
  const out: { diskHint: string; name: string }[] = [];
  for (const [diskHint, card] of Object.entries(facts.cards)) {
    const name = card.name?.trim();
    if (!diskHint || !name) continue;
    out.push({ diskHint, name });
  }
  return out;
}

export type NarutoJaFacts = NikitaCardFacts & {
  /** Other set labels the site files the same number under, same data. */
  alsoListedIn?: string[];
  /**
   * Rows that share the number but say something different — a reprint whose
   * flavour line or rules wording changed between volumes. Kept whole: dropping
   * them would erase the only record that the card was printed twice.
   */
  variants?: NikitaCardFacts[];
};

/** What makes two rows the same card *printing*, set label aside. */
function factsSignature(row: NikitaCardFacts): string {
  return JSON.stringify([
    row.name,
    row.cardType,
    row.symbols,
    row.cost,
    row.power,
    row.support,
    row.woundedPower,
    row.woundedSupport,
    row.traits,
    row.battleAttribute,
    row.target,
    row.effect,
    row.quote,
  ]);
}

/**
 * Facts by disk id. Rows the catalogue does not mint are dropped, not invented.
 *
 * 33 numbers appear twice or three times. Most are the same card filed again
 * under nikita's `※確認中` (unverified) buckets — those collapse, their label
 * kept in `alsoListedIn`. But **five differ for real**: 忍-1 and 作-43 carry a
 * second flavour line, and 作-116 / 術-146 / 術-160 were reprinted in a later
 * volume with reworded rules. Those go to `variants` whole — a reprint is a
 * fact about the card, not noise to fold away.
 */
export function factsByDiskId(
  rows: readonly NikitaCardFacts[],
): Record<string, NarutoJaFacts> {
  const grouped = new Map<string, NikitaCardFacts[]>();
  for (const row of rows) {
    if (!row.number) continue;
    grouped.set(row.number, [...(grouped.get(row.number) ?? []), row]);
  }

  const out: Record<string, NarutoJaFacts> = {};
  for (const [id, group] of grouped) {
    // A resolved volume is the primary; an unverified bucket never wins.
    const primary = group.find((row) => row.setCode) ?? group[0]!;
    const entry: NarutoJaFacts = { ...primary };
    const labels: string[] = [];
    const variants: NikitaCardFacts[] = [];
    const primarySignature = factsSignature(primary);
    for (const row of group) {
      if (row === primary) continue;
      if (factsSignature(row) === primarySignature) {
        if (row.setLabel && row.setLabel !== primary.setLabel) {
          labels.push(row.setLabel);
        }
        continue;
      }
      variants.push(row);
    }
    if (labels.length) entry.alsoListedIn = [...new Set(labels)];
    if (variants.length) entry.variants = variants;
    out[id] = entry;
  }
  return out;
}

async function fetchCardlist(): Promise<string | null> {
  try {
    const res = await httpGet<string>(
      `${NIKITA_NRT_ORIGIN}${NIKITA_CARDLIST_PATH}`,
      {
        headers: {
          "User-Agent": UA,
          Accept: "text/html,*/*",
          "Accept-Language": "ja,en;q=0.8",
          Referer: `${NIKITA_NRT_ORIGIN}/explist/nrt/`,
        },
        responseType: "text",
        timeout: 30_000,
        validateStatus: (status) => status === 200,
      },
    );
    const html =
      typeof res.data === "string" ? res.data : String(res.data ?? "");
    return html.length > 2_000 ? html : null;
  } catch (error) {
    const err = error as { message?: string; response?: { status?: number } };
    console.warn(
      `── JA nikita cardlist : HTTP ${err.response?.status ?? "fail"} — ${err.message ?? error}`,
    );
    return null;
  }
}

export async function scrapeNikitaCardlistFacts(
  opts: ScrapeNikitaCardlistOptions = {},
): Promise<{ parsed: number; joined: number; file: string | null }> {
  const root = packRoot(opts.root);
  const staging = path.join(root, NARUTO_STAGING_NIKITA_NRT_LIST);
  mkdirSync(staging, { recursive: true });

  console.log("── JA nikita cardlist → facts-ja.json");
  const html = opts.html ?? (await fetchCardlist());
  if (!html) {
    console.warn("── JA nikita cardlist : page absente, on s'arrête là");
    return { parsed: 0, joined: 0, file: null };
  }
  writeFileSync(path.join(staging, "cardlist.html"), html, "utf8");

  const rows = parseNikitaCardlist(html);
  const cards = factsByDiskId(rows);
  const file: NarutoJaFactsFile = {
    version: 1,
    source: `${NIKITA_NRT_ORIGIN}${NIKITA_CARDLIST_PATH}`,
    capturedAt: new Date().toISOString(),
    count: Object.keys(cards).length,
    cards,
  };
  const dest = narutoJaFactsPath(opts.root);
  writeFileSync(dest, `${JSON.stringify(file, null, 2)}\n`, "utf8");
  console.log(
    JSON.stringify({
      nikitaCardlist: true,
      parsed: rows.length,
      joined: file.count,
      unmapped: rows.filter((row) => !row.number).length,
    }),
  );
  return { parsed: rows.length, joined: file.count, file: dest };
}

async function fetchPath(pathname: string): Promise<string | null> {
  try {
    const res = await httpGet<string>(`${NIKITA_NRT_ORIGIN}${pathname}`, {
      headers: {
        "User-Agent": UA,
        Accept: "text/html,*/*",
        "Accept-Language": "ja,en;q=0.8",
        Referer: `${NIKITA_NRT_ORIGIN}/`,
      },
      responseType: "text",
      timeout: 30_000,
      validateStatus: (status) => status === 200,
    });
    const html =
      typeof res.data === "string" ? res.data : String(res.data ?? "");
    return html.length > 1_000 ? html : null;
  } catch {
    return null;
  }
}

async function downloadFace(url: string): Promise<Buffer | null> {
  try {
    const res = await httpGet<ArrayBuffer>(url, {
      headers: {
        "User-Agent": UA,
        Accept: "image/*,*/*",
        Referer: NIKITA_NRT_ORIGIN,
      },
      responseType: "arraybuffer",
      timeout: 30_000,
      validateStatus: (status) => status === 200,
    });
    const buf = Buffer.from(res.data as ArrayBuffer);
    if (extFromMagic(buf) === ".bin") return null;
    return buf.byteLength >= 3_000 ? buf : null;
  } catch {
    return null;
  }
}

/**
 * The 疾風伝 game (`nrts`) — 13 cards, the only faces we have for that line.
 *
 * Its files are named `N-037.jpg` like the 巻ノ game's, but under `nrts` the
 * same letter means 忍伝, not 忍: joining on the letter would put a 疾風伝 face
 * on a booster card. The printed ref in the text view is what we join on.
 */
export async function scrapeNikitaShippudenFaces(
  opts: ScrapeNikitaCardlistOptions = {},
): Promise<{
  listed: number;
  downloaded: number;
  skipped: number;
  failed: number;
}> {
  const root = packRoot(opts.root);
  const cardsDir = path.join(root, "cards");
  const staging = path.join(root, NARUTO_STAGING_NIKITA_NRT_LIST);
  mkdirSync(staging, { recursive: true });

  console.log("── JA nikita 疾風伝 (nrts) → art.nikita");
  const html = opts.html ?? (await fetchPath(NIKITA_SHIPPUDEN_PATH));
  if (!html) return { listed: 0, downloaded: 0, skipped: 0, failed: 0 };
  writeFileSync(path.join(staging, "cardlist-nrts.html"), html, "utf8");

  const rows = parseNikitaCardlist(html).filter(
    (row) => row.game === "nrts" && row.number && row.nikitaKey,
  );
  let ok = 0;
  let skip = 0;
  let fail = 0;
  for (const row of rows) {
    const parsed = parseNarutoCollector(row.printedRef);
    const fallback = parsed ? narutoCardDiskFolder(parsed) : "ninja";
    const cardDir =
      narutoCardAbsDir(cardsDir, row.number!, "ja") ??
      path.join(cardsDir, fallback, row.number!, "ja");
    if (existingNarutoArtForSource(cardDir, "nikita")) {
      skip += 1;
      continue;
    }
    const buf = await downloadFace(
      `${NIKITA_NRT_ORIGIN}/img/card/nrts/${row.nikitaKey}.jpg`,
    );
    if (!buf) {
      fail += 1;
      continue;
    }
    const saved = await saveNarutoFace({
      cardDir,
      buf,
      source: "nikita",
      lang: "ja",
    });
    if (saved === "skip") skip += 1;
    else ok += 1;
  }
  console.log(
    JSON.stringify({
      nikitaShippuden: true,
      listed: rows.length,
      downloaded: ok,
      skipped: skip,
      failed: fail,
    }),
  );
  return { listed: rows.length, downloaded: ok, skipped: skip, failed: fail };
}
