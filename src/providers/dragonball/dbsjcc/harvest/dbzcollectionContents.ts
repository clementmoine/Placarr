/**
 * Moisson « Autres infos » dbzcollection → canal de distribution par carte
 * (Booster / Deck …). Sert à reconstruire les listes starters.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { packDataDir } from "@/lib/packPaths";
import { fetchDbzcText } from "@/providers/dragonball/shared/dbzcollection/site";

import { DBS_JCC_PACK_ID, dbsJccCuratedDir } from "../pack";
import {
  dbzcCardInfoUrl,
  dbzcSetListingUrl,
  parseDbzcCardDetail,
  parseDbzcollectionListing,
} from "../parse/dbzcollection";
import { dbsjccPrintKey, parseDbsjccNumber } from "../printKey";
import { readDbzcollectionLedger } from "../scrape/dbzcollection";

const DELAY_MS = 140;
const SOURCE = "dbzcollection-contents";

export type DbzcContentCard = {
  cardId: string;
  setCode: string;
  printed: string | null;
  number: string | null;
  printKey: string | null;
  name: string | null;
  rarity: string | null;
  otherInfo: string | null;
  /** Canal normalisé (`booster`, `deck:super-saiyans`, `deck:shared`, …). */
  channel: string;
};

export type DbzcContentsLedger = {
  source: string;
  observed: string;
  note: string;
  cards: DbzcContentCard[];
  /** otherInfo brut → count */
  otherInfoCounts: Record<string, number>;
  /** channel → count */
  channelCounts: Record<string, number>;
};

export function dbsJccDbzcollectionContentsPath(): string {
  return path.join(dbsJccCuratedDir(), "sources", "dbzcollection-contents.json");
}

export function dbsJccDbzcollectionContentsStagingDir(): string {
  return path.join(packDataDir(DBS_JCC_PACK_ID), "staging", SOURCE);
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Normalise le champ « Autres infos » en canal.
 *
 * Les libellés dbzc sont bruyants (`Deck saiyan` / `Deck saiyans` /
 * `Deck super saiyan`). On regroupe ; `Deck` seul = partagé aux deux starters
 * du set.
 */
export function normalizeDbzcDistributionChannel(
  otherInfo: string | null | undefined,
  setCode: string,
): string {
  const raw = (otherInfo ?? "").trim();
  if (!raw) return "unknown";
  let t = raw
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/\s+/g, " ")
    .trim();

  // Typos fréquents dans les fiches dbzc
  t = t
    .replace(/\bresistence\b/g, "resistance")
    .replace(/\berpeuve\b/g, "epreuve")
    .replace(/\bruabn\b/g, "ruban")
    .replace(/\boruge\b/g, "rouge")
    .replace(/\bdecl\b/g, "deck")
    .replace(/\beveil\b/g, "eveil");

  if (/\bbooster\b/.test(t)) return "booster";
  if (t.includes("white") || t.includes("vending") || t.includes("filing")) {
    return "other";
  }
  // Marqueurs rareté / dragon balls — pas un canal produit
  if (/\bdragon\s*ball\b/.test(t) && !/\bdeck\b|\bstarter\b/.test(t)) {
    return "other";
  }

  if (!/\bdeck\b/.test(t) && !/\bstarter\b/.test(t)) return "unknown";

  // Partagé aux deux decks du set (« Deck », « Deck X et Y »)
  if (
    t === "deck" ||
    t === "starter" ||
    /\bet\b/.test(t) ||
    t.includes("deux decks") ||
    t.includes("2 decks")
  ) {
    return `deck:shared:${setCode}`;
  }

  // Thèmes connus
  if (t.includes("ennem")) return `deck:ennemis:${setCode}`;
  if (t.includes("ruban") && t.includes("rouge")) {
    return `deck:ruban-rouge:${setCode}`;
  }
  if (
    t.includes("super saiyan") ||
    t.includes("saiyans") ||
    /\bsaiyan\b/.test(t)
  ) {
    return `deck:super-saiyans:${setCode}`;
  }
  if (t.includes("eveil") && t.includes("gohan")) {
    return `deck:eveil-de-gohan:${setCode}`;
  }
  if (t.includes("retour") && t.includes("goku")) {
    return `deck:retour-de-goku:${setCode}`;
  }
  if (t.includes("championnat")) {
    return `deck:championnat-du-monde:${setCode}`;
  }
  if (t.includes("vaincre") || t.includes("menace")) {
    return `deck:vaincre-la-menace:${setCode}`;
  }
  if (t.includes("force") && t.includes("mal")) {
    return `deck:forces-du-mal:${setCode}`;
  }
  if (t.includes("planete")) return `deck:planete:${setCode}`;
  if (t.includes("resistance")) return `deck:resistance:${setCode}`;
  if (t.includes("fusion")) return `deck:fusion:${setCode}`;
  if (t.includes("origine")) return `deck:origine:${setCode}`;
  if (t.includes("epreuve")) return `deck:nouvelle-epreuve:${setCode}`;
  if (t.includes("heros")) return `deck:heros:${setCode}`;
  if (t.includes("guerrier") || t.includes("legend")) {
    return `deck:guerriers-legendaires:${setCode}`;
  }

  const rest = t.replace(/^(deck|starter)\s*/, "").trim();
  const slug =
    rest
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 48) || "unknown";
  return `deck:${slug}:${setCode}`;
}

export function readDbzcollectionContentsLedger(
  file = dbsJccDbzcollectionContentsPath(),
): DbzcContentsLedger | null {
  if (!existsSync(file)) return null;
  try {
    return JSON.parse(readFileSync(file, "utf8")) as DbzcContentsLedger;
  } catch {
    return null;
  }
}

export async function harvestDbzcollectionContents(
  opts: { force?: boolean; argv?: readonly string[]; setCodes?: string[] } = {},
): Promise<{ path: string; cards: number }> {
  const ledger = readDbzcollectionLedger();
  const want = new Set(
    (opts.setCodes?.length
      ? opts.setCodes
      : (opts.argv ?? [])
          .filter((a) => a.startsWith("part") || a === "promo" || a === "sp")
          .map((a) => a.toLowerCase())
    ).map((s) => s.toLowerCase()),
  );
  const sets = ledger.sets.filter((s) => {
    if (!want.size) return true;
    return want.has(s.setCode.toLowerCase());
  });

  const staging = dbsJccDbzcollectionContentsStagingDir();
  mkdirSync(staging, { recursive: true });

  const cards: DbzcContentCard[] = [];
  const otherInfoCounts: Record<string, number> = {};
  const channelCounts: Record<string, number> = {};

  for (const set of sets) {
    const setCode = set.setCode.toLowerCase();
    const listingUrl = dbzcSetListingUrl(set.ids, ledger.collectionIdc);
    const listingDest = path.join(staging, `${setCode}.listing.html`);
    let html: string | null = null;
    if (!opts.force && existsSync(listingDest)) {
      html = readFileSync(listingDest, "utf8");
    } else {
      html = await fetchDbzcText(listingUrl, { minLength: 200 });
      await sleep(DELAY_MS);
      if (html) writeFileSync(listingDest, html, "utf8");
    }
    if (!html) continue;

    const parsed = parseDbzcollectionListing(html);
    console.log(`── contents ${setCode} — ${parsed.cards.length} carte(s)`);

    for (const tile of parsed.cards) {
      const detailDest = path.join(staging, `${setCode}_${tile.cardId}.json`);
      let detail = null as ReturnType<typeof parseDbzcCardDetail> | null;
      if (!opts.force && existsSync(detailDest)) {
        try {
          detail = JSON.parse(readFileSync(detailDest, "utf8"));
        } catch {
          detail = null;
        }
      }
      if (!detail) {
        const ajax = await fetchDbzcText(dbzcCardInfoUrl(tile.cardId), {
          minLength: 30,
        });
        await sleep(DELAY_MS);
        if (!ajax) continue;
        detail = parseDbzcCardDetail(ajax, tile.cardId);
        writeFileSync(detailDest, `${JSON.stringify(detail, null, 2)}\n`, "utf8");
      }

      const printed = detail.printed ?? tile.printed ?? null;
      const number = printed ? parseDbsjccNumber(printed) : null;
      const printKey =
        number != null ? dbsjccPrintKey(setCode, number) : null;
      const otherInfo = detail.otherInfo?.trim() || null;
      const channel = normalizeDbzcDistributionChannel(otherInfo, setCode);
      const key = otherInfo ?? "(empty)";
      otherInfoCounts[key] = (otherInfoCounts[key] ?? 0) + 1;
      channelCounts[channel] = (channelCounts[channel] ?? 0) + 1;

      cards.push({
        cardId: tile.cardId,
        setCode,
        printed,
        number,
        printKey,
        name: detail.name,
        rarity: detail.rarity,
        otherInfo,
        channel,
      });
    }
  }

  const out: DbzcContentsLedger = {
    source: "dbzcollection.fr — Autres infos (canal Booster / Deck)",
    observed: new Date().toISOString().slice(0, 10),
    note: "Canal par carte. Deck partagé = otherInfo « Deck » / « Deck X et Y ». Les listes starters = exclusives du thème + shared du set.",
    cards,
    otherInfoCounts,
    channelCounts,
  };
  const dest = dbsJccDbzcollectionContentsPath();
  mkdirSync(path.dirname(dest), { recursive: true });
  writeFileSync(dest, `${JSON.stringify(out, null, 2)}\n`, "utf8");
  return { path: dest, cards: cards.length };
}
