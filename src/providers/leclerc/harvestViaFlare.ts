/**
 * Harvest Leclerc checklists behind Cloudflare via FlareSolverr (`FLARESOLVERR_URL`).
 *
 * - TCDB: works end-to-end (CF challenge).
 * - Coleka: plain listing / `?p=N` often CF-cache HIT. `?nbpp=240` is always
 *   uncached → Turnstile « Vérification » that FlareSolverr does not complete
 *   (same pattern as Naruto Coleka Storm3). Prefer plain pages, not nbpp.
 *
 * Usage: `FLARESOLVERR_URL=http://127.0.0.1:8191 pnpm exec tsx src/providers/leclerc/harvestViaFlare.ts`
 */
import { writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { flareSolverrRequestGet } from "@/lib/http/flareSolverr";

export type HarvestedCard = {
  number: string;
  name: string;
  rarity?: string;
};

export type TcdbSetSpec = {
  code: string;
  sid: number;
  slug: string;
  pages?: number;
};

export const LECLERC_TCDB_SETS: readonly TcdbSetSpec[] = [
  {
    code: "marvel21",
    sid: 454652,
    slug: "2021-E-Leclerc-Marvel-R-v-le-ton-Pouvoir",
  },
  {
    code: "marvel22",
    sid: 454491,
    slug: "2022-E-Leclerc-Marvel-Pars-en-Mission",
  },
  {
    code: "marvel23",
    sid: 454641,
    slug: "2023-E-Leclerc-Marvel-D-fie-tes-H-ros",
  },
  {
    code: "marvel24",
    sid: 463876,
    slug: "2024-E-Leclerc-Marvel-Explore-L-Univers-Marvel-avec-Groot",
  },
] as const;

const COLEKA_DISNEY25 =
  "https://www.coleka.com/fr/cartes-de-collection/cartes-de-supermarche/decouvre-la-magie-de-disney-leclerc_r46879";

function isChallengeHtml(html: string): boolean {
  const head = html.slice(0, 2500);
  return /V[ée]rification\s*-\s*COLEKA|Just a moment|Attention Required|cf-browser-verification/i.test(
    head,
  );
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

const TCDB_RARITY: Record<string, string> = {
  GOLD: "gold",
  GLIT: "pailletee",
  FOIL: "holographique",
};

/**
 * Parse TCDB checklist HTML (page 1 or 2).
 * Card identity comes from ViewCard slugs inside each `<tr>`:
 * `…/Set-Slug-{n}-{Name-With-Dashes}`.
 * Rarities sit after Person.cfm links in the same row: `</a> FOIL|GLIT|GOLD`.
 */
export function parseTcdbChecklistHtml(html: string): HarvestedCard[] {
  const byNum = new Map<string, HarvestedCard>();
  const rows = html.split(/<tr\b/i);

  for (const row of rows) {
    const slugMatch = row.match(
      /\/ViewCard\.cfm\/sid\/\d+\/cid\/\d+\/([^"?]+)/i,
    );
    if (!slugMatch) continue;
    const slug = decodeEntities(slugMatch[1] ?? "");
    const cardMatch = slug.match(/-(\d+)-([A-Za-z].*)$/);
    if (!cardMatch) continue;
    const number = String(Number(cardMatch[1])).padStart(3, "0");
    const name = cardMatch[2].replace(/-/g, " ").replace(/\s+/g, " ").trim();
    if (!name || /^nbsp$/i.test(name)) continue;

    let rarity: string | undefined;
    const rarityMatch = row.match(
      /\/Person\.cfm\/[^"]+">[^<]*<\/a>\s*(GOLD|GLIT|FOIL)\b/i,
    );
    if (rarityMatch) {
      rarity = TCDB_RARITY[(rarityMatch[1] ?? "").toUpperCase()];
    }

    const prev = byNum.get(number);
    if (!prev || name.length >= prev.name.length) {
      byNum.set(number, {
        number,
        name,
        rarity: rarity ?? prev?.rarity,
      });
    } else if (rarity && !prev.rarity) {
      byNum.set(number, { ...prev, rarity });
    }
  }

  return [...byNum.values()].sort((a, b) => a.number.localeCompare(b.number));
}

/** Parse Coleka rubrique listing (page without `?p=`). */
export function parseColekaListingHtml(html: string): HarvestedCard[] {
  const byNum = new Map<string, HarvestedCard>();
  const re =
    /<h3 class="product-title">([^<]+)<\/h3>\s*<span>\s*<span class="ref">Ref\.\s*(\d+)<\/span>/g;
  for (const m of html.matchAll(re)) {
    const name = decodeEntities(m[1] ?? "").trim();
    const number = String(Number(m[2])).padStart(3, "0");
    if (!name || /^Fixeez\b/i.test(name) || /^Album$/i.test(name)) continue;
    byNum.set(number, { number, name });
  }
  return [...byNum.values()].sort((a, b) => a.number.localeCompare(b.number));
}

export async function harvestTcdbSet(
  spec: TcdbSetSpec,
  opts: { maxTimeoutMs?: number } = {},
): Promise<HarvestedCard[]> {
  const pages = spec.pages ?? 2;
  const byNum = new Map<string, HarvestedCard>();
  const maxTimeoutMs = opts.maxTimeoutMs ?? 120_000;

  for (let page = 1; page <= pages; page += 1) {
    const url =
      page === 1
        ? `https://www.tcdb.com/Checklist.cfm/sid/${spec.sid}/${spec.slug}`
        : `https://www.tcdb.com/Checklist.cfm/sid/${spec.sid}/${spec.slug}?PageIndex=${page}`;
    const html = await flareSolverrRequestGet(url, {
      maxTimeoutMs,
      waitInSeconds: 3,
    });
    if (!html || isChallengeHtml(html)) {
      throw new Error(`TCDB ${spec.code} p${page}: FlareSolverr challenge/empty`);
    }
    for (const card of parseTcdbChecklistHtml(html)) {
      const prev = byNum.get(card.number);
      if (!prev || card.name.length >= prev.name.length) {
        byNum.set(card.number, { ...prev, ...card });
      }
    }
  }

  return [...byNum.values()].sort((a, b) => a.number.localeCompare(b.number));
}

/** Coleka Disney 2025 — page 1 only (pagination is Turnstile-gated). */
export async function harvestColekaDisney25Page1(
  opts: { maxTimeoutMs?: number } = {},
): Promise<HarvestedCard[]> {
  const html = await flareSolverrRequestGet(COLEKA_DISNEY25, {
    maxTimeoutMs: opts.maxTimeoutMs ?? 120_000,
  });
  if (!html || isChallengeHtml(html)) {
    throw new Error("Coleka disney25: FlareSolverr challenge/empty");
  }
  return parseColekaListingHtml(html);
}

async function main(): Promise<void> {
  if (!process.env.FLARESOLVERR_URL?.trim()) {
    console.error("Set FLARESOLVERR_URL (e.g. http://127.0.0.1:8191)");
    process.exit(1);
  }

  const out: Record<string, unknown> = {};

  console.log("── Coleka disney25 (page 1)…");
  try {
    const disney = await harvestColekaDisney25Page1();
    out.disney25 = { count: disney.length, cards: disney };
    console.log(`   ${disney.length} cards`);
  } catch (e) {
    console.error("   fail", e);
  }

  for (const spec of LECLERC_TCDB_SETS) {
    console.log(`── TCDB ${spec.code}…`);
    try {
      const cards = await harvestTcdbSet(spec);
      out[spec.code] = { count: cards.length, cards };
      console.log(`   ${cards.length} cards`);
    } catch (e) {
      console.error("   fail", e);
    }
  }

  const dest = path.join("/tmp", "leclerc-flare-harvest.json");
  writeFileSync(dest, `${JSON.stringify(out, null, 2)}\n`, "utf8");
  console.log(`── wrote ${dest}`);
}

const isMain =
  typeof process.argv[1] === "string" &&
  pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;

if (isMain) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
