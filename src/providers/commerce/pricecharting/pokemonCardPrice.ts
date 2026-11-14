/**
 * PriceCharting TCG — printKey → Ungraded (used_price) EUR offer.
 *
 * Match is search + collector number + title/set alignment. No set-code→slug
 * dictionary: ambiguous hits stay empty rather than guessing.
 *
 * Allowlist starts with Pokémon + Lorcana (same `#N` / `/game/{game}-…` shape).
 * Other PC TCG catalogues stay out until title/# formats are verified.
 */
import { pricedOffers } from "@/core/catalog/priceOffers";
import { parsePrintKey } from "@/core/identify/printKey";
import type { PriceOfferInput } from "@/core/enrich/evidence";
import { franchiseSequelNumbersConflict } from "@/core/enrich/titleMatching";
import type { BarcodePriceRefreshContext } from "@/types/providerModule";
import { providerProductUrlsForKey } from "@/core/commerce/pricing/priceTypes";
import { printKeyFromPriceContext } from "@/providers/shared/createPrintKeyPriceModule";
import type { PriceChartingSearchRow } from "./durableEvidence";
import {
  fetchPricesFromPriceChartingGameUrl,
  priceChartingCatalogAlignsWithTitles,
  priceChartingGameUrl,
  priceChartingTitleScore,
  resolvePriceChartingGamePath,
  searchPriceChartingRows,
} from "./fetch";

const PRICE_SOURCE = "PriceCharting";

/** printGame → tokens observed in PC `/game/` paths, platform, and titles. */
const PC_TCG_PATH_TOKENS: Readonly<Record<string, RegExp>> = {
  pokemon: /pokemon|pokémon/i,
  lorcana: /lorcana/i,
};

export function supportedPriceChartingTcgPrintGames(): readonly string[] {
  return Object.keys(PC_TCG_PATH_TOKENS);
}

export function normalizePokemonCollectorNumber(raw: string): string {
  const trimmed = raw.trim().toLowerCase();
  if (!trimmed) return "";
  const stripped = trimmed.replace(/^0+(?=\d)/, "");
  return stripped || "0";
}

/** Card-facing name from a PC title ("Charizard #4 Pokemon Base Set"). */
export function cardNameFromPriceChartingTitle(title: string): string {
  return title
    .replace(/\s*\[[^\]]*\]\s*/g, " ")
    .replace(/\s*#\s*[0-9a-z].*$/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function priceChartingRowLooksPrintGame(
  row: { gamePath: string; platform: string; title: string },
  printGame: string,
): boolean {
  const re = PC_TCG_PATH_TOKENS[printGame];
  if (!re) return false;
  return re.test(`${row.gamePath} ${row.platform} ${row.title}`);
}

export function priceChartingUrlLooksPrintGame(
  url: string,
  printGame: string,
): boolean {
  const re = PC_TCG_PATH_TOKENS[printGame];
  return Boolean(re && re.test(url));
}

/** @deprecated Prefer {@link priceChartingRowLooksPrintGame} with `"pokemon"`. */
export function priceChartingRowLooksPokemon(row: {
  gamePath: string;
  platform: string;
  title: string;
}): boolean {
  return priceChartingRowLooksPrintGame(row, "pokemon");
}

export function priceChartingRowHasCollectorNumber(
  row: { gamePath: string; title: string },
  collectorNumber: string,
): boolean {
  const want = normalizePokemonCollectorNumber(collectorNumber);
  if (!want) return false;

  const title = row.title.toLowerCase();
  const titleHit = new RegExp(
    `(?:^|[^0-9a-z])#\\s*0*${escapeRegExp(want)}(?![0-9a-z])`,
    "i",
  ).test(title);
  if (titleHit) return true;

  const path = row.gamePath.toLowerCase().split(/[?#]/)[0] ?? "";
  const slugTail = path.match(/\/([^/]+)\/?$/)?.[1] ?? "";
  return new RegExp(
    `(?:^|-)0*${escapeRegExp(want)}$`,
    "i",
  ).test(slugTail);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function titleHasBracketVariant(title: string): boolean {
  return /\[[^\]]+\]/.test(title);
}

/**
 * Pick a unique TCG card search row for a printKey identity.
 * Returns null when zero or several rows still look plausible.
 */
export function pickPriceChartingPokemonCardRow(
  rows: readonly PriceChartingSearchRow[],
  input: {
    collectorNumber: string;
    acceptanceTitles: readonly string[];
    shelfName?: string | null;
    printGame?: string;
  },
): PriceChartingSearchRow | null {
  const printGame = input.printGame ?? "pokemon";
  const acceptance = input.acceptanceTitles
    .map((title) => title.replace(/\s+/g, " ").trim())
    .filter(Boolean);
  if (acceptance.length === 0) return null;

  let candidates = rows.filter(
    (row) =>
      priceChartingRowLooksPrintGame(row, printGame) &&
      priceChartingRowHasCollectorNumber(row, input.collectorNumber),
  );
  if (candidates.length === 0) return null;

  candidates = candidates.filter((row) => {
    const cardName = cardNameFromPriceChartingTitle(row.title);
    if (!cardName) return false;
    return priceChartingCatalogAlignsWithTitles(cardName, acceptance, {
      allowFranchiseStem: true,
    });
  });
  if (candidates.length === 0) return null;

  const shelf = input.shelfName?.replace(/\s+/g, " ").trim() || "";
  if (shelf) {
    candidates = candidates.filter(
      (row) =>
        !franchiseSequelNumbersConflict([shelf], row.platform) &&
        !franchiseSequelNumbersConflict([shelf], row.title),
    );
    const scored = candidates.map((row) => ({
      row,
      score: Math.max(
        priceChartingTitleScore(shelf, row.platform),
        priceChartingTitleScore(shelf, row.title),
      ),
    }));
    if (scored.length === 0) return null;
    const best = scored.reduce((left, right) =>
      right.score > left.score ? right : left,
    ).score;
    if (best >= 0.55) {
      candidates = scored
        .filter((entry) => entry.score >= best - 0.02 && entry.score >= 0.55)
        .map((entry) => entry.row);
    }
  }

  if (candidates.length > 1) {
    const plain = candidates.filter(
      (row) => !titleHasBracketVariant(row.title),
    );
    if (plain.length === 1) return plain[0];
    if (plain.length > 1) candidates = plain;
  }

  if (candidates.length !== 1) return null;
  return candidates[0] ?? null;
}

export function pokemonCardSearchQueries(input: {
  primaryName: string;
  collectorNumber: string;
  fallbackNames?: readonly string[];
}): string[] {
  const number = normalizePokemonCollectorNumber(input.collectorNumber);
  const names = [
    input.primaryName,
    ...(input.fallbackNames ?? []),
  ]
    .map((name) => name.replace(/\s+/g, " ").trim())
    .filter(Boolean);
  const seen = new Set<string>();
  const queries: string[] = [];
  for (const name of names) {
    for (const q of [`${name} ${number}`, `${name} #${number}`]) {
      const key = q.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      queries.push(q);
    }
  }
  return queries;
}

function pokemonUngradedOffers(
  prices: {
    priceUsed?: number;
    sourceUrl?: string;
    productName?: string;
  },
): PriceOfferInput[] {
  if (prices.priceUsed == null) return [];
  return pricedOffers(PRICE_SOURCE, [
    {
      condition: "used",
      priceCents: prices.priceUsed,
      rawValue: prices,
      extra: {
        currency: "EUR",
        metadataScoped: true,
        ...(prices.sourceUrl ? { sourceUrl: prices.sourceUrl } : {}),
        ...(prices.productName ? { productName: prices.productName } : {}),
      },
    },
  ]);
}

function acceptanceTitlesFromCtx(ctx: BarcodePriceRefreshContext): string[] {
  return Array.from(
    new Set(
      [
        ctx.primaryName,
        ctx.primaryTitle,
        ...ctx.fallbackNames,
        ...ctx.titles,
        ...ctx.acceptanceTitles,
      ]
        .map((title) => title?.replace(/\s+/g, " ").trim())
        .filter((title): title is string => Boolean(title)),
    ),
  );
}

async function offersFromTcgGameUrl(
  url: string,
  printGame: string,
  acceptanceTitles: readonly string[],
  options?: { evidenceOnly?: boolean },
): Promise<PriceOfferInput[]> {
  if (!url.includes("/game/") || !priceChartingUrlLooksPrintGame(url, printGame)) {
    return [];
  }
  const fromUrl = await fetchPricesFromPriceChartingGameUrl(url, {
    ...(options?.evidenceOnly ? { evidenceOnly: true } : {}),
  });
  if (!fromUrl?.priceUsed) return [];
  const productName = fromUrl.productName?.trim() || "";
  const cardName = cardNameFromPriceChartingTitle(productName) || productName;
  if (
    cardName &&
    acceptanceTitles.length > 0 &&
    !priceChartingCatalogAlignsWithTitles(cardName, acceptanceTitles, {
      allowFranchiseStem: true,
    })
  ) {
    return [];
  }
  return pokemonUngradedOffers(fromUrl);
}

/**
 * Refresh PriceCharting reference price for an allowlisted TCG `printKey`.
 * Unsupported print games return [].
 */
export async function refreshPriceChartingPokemonOffers(
  ctx: BarcodePriceRefreshContext,
): Promise<PriceOfferInput[]> {
  if (ctx.shelfType !== "tcg") return [];
  const printKey = printKeyFromPriceContext(ctx);
  if (!printKey) return [];
  const identity = parsePrintKey(printKey);
  if (!identity || !(identity.game in PC_TCG_PATH_TOKENS)) return [];
  const printGame = identity.game;

  const acceptanceTitles = acceptanceTitlesFromCtx(ctx);
  if (acceptanceTitles.length === 0) return [];

  const storedUrls = providerProductUrlsForKey(
    "pricecharting",
    ctx.providerProductUrls,
  ).filter(
    (url) =>
      url.includes("/game/") &&
      !url.includes("search-products") &&
      priceChartingUrlLooksPrintGame(url, printGame),
  );
  for (const url of storedUrls) {
    const offers = await offersFromTcgGameUrl(
      url,
      printGame,
      acceptanceTitles,
      { evidenceOnly: ctx.evidenceOnly },
    );
    if (offers.length > 0) return offers;
  }

  if (ctx.evidenceOnly) return [];

  const queries = pokemonCardSearchQueries({
    primaryName: ctx.primaryName || ctx.primaryTitle,
    collectorNumber: identity.number,
    fallbackNames: ctx.fallbackNames,
  });

  for (const query of queries) {
    const rows = await searchPriceChartingRows(query);
    const picked = pickPriceChartingPokemonCardRow(rows, {
      collectorNumber: identity.number,
      acceptanceTitles,
      shelfName: ctx.shelfName,
      printGame,
    });
    if (!picked) continue;

    const resolvedPath = await resolvePriceChartingGamePath(picked.gamePath);
    const gameUrl = priceChartingGameUrl(resolvedPath);
    if (
      !gameUrl.includes("/game/") ||
      !priceChartingUrlLooksPrintGame(gameUrl, printGame)
    ) {
      continue;
    }

    const offers = await offersFromTcgGameUrl(
      gameUrl,
      printGame,
      acceptanceTitles,
    );
    if (offers.length > 0) return offers;
  }

  return [];
}
