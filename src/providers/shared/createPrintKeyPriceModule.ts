/**
 * Provider de prix TCG ancré sur `printKey` — le boilerplate commun à
 * lorcanagg / lorcast / (partie prix de) tcgdex.
 *
 * Ce qui change : la fetch, la devise, le libellé des lignes. Ce qui ne change
 * pas : garde `shelfType === "tcg"`, extraction de la clé, `pricedOffers` avec
 * `metadataScoped` (match par clé, pas par titre d'annonce).
 */
import { pricedOffers } from "@/core/catalog/priceOffers";
import type { PriceOfferInput } from "@/core/enrich/evidence";
import { parsePrintKey } from "@/core/identify/printKey";
import { rawProbe } from "@/lib/dev/mappingProbe";
import {
  mappingRawKeysFromFetch,
  probeContextOrDefault,
} from "@/lib/dev/mappingRawKeys";
import type {
  BarcodePriceRefreshContext,
  ProviderModule,
} from "@/types/providerModule";

export type PrintKeyPriceRow = {
  condition: string;
  priceCents: number | null;
  productName: string;
  sourceUrl?: string;
};

export type CreatePrintKeyPriceModuleSpec<TCard> = {
  providerId: string;
  label: string;
  /** Libellé `PriceOfferInput.source` (souvent le nom commercial). */
  priceSource: string;
  currency: string;
  websiteUrl?: string;
  notes: string;
  referencePriceSource?: boolean;
  /** Ignore les printKeys d'un autre jeu (ex. `pokemon` pour TCGdex). */
  printGame?: string;
  mappingProbe: {
    sampleInput: string;
    /** `name` requis — alimente aussi le contexte prix du probe. */
    context: { name: string; printKey: string };
  };
  fetchCard: (
    printKey: string,
    opts: { signal?: AbortSignal; ctx: BarcodePriceRefreshContext },
  ) => Promise<TCard | null>;
  priceRows: (card: TCard) => PrintKeyPriceRow[];
};

/** Contexte prix minimal pour probes / fetch ancrés printKey. */
export function priceProbeContext(input: {
  printKey: string;
  name: string;
  signal?: AbortSignal;
}): BarcodePriceRefreshContext {
  const name = input.name.trim();
  return {
    barcodes: [],
    primaryTitle: name,
    titles: name ? [name] : [],
    acceptanceTitles: name ? [name] : [],
    shelfType: "tcg",
    printKey: input.printKey,
    cleanedBarcode: "",
    primaryName: name,
    fallbackNames: [],
    leDenicheurQueries: [],
    isPal: false,
    isClassics: false,
    ...(input.signal ? { signal: input.signal } : {}),
  };
}

/** `printKey` direct, sinon `externalIds.printKey`. */
export function printKeyFromPriceContext(
  ctx: BarcodePriceRefreshContext,
): string | null {
  const direct = ctx.printKey?.trim();
  if (direct) return direct;
  return ctx.externalIds?.printKey?.trim() || null;
}

/**
 * Lignes new + foil à partir de deux cotes (Cardmarket EUR chez DotGG / TCGdex).
 */
export function dualFinishPriceRows(input: {
  label: string;
  newCents: number | null | undefined;
  foilCents: number | null | undefined;
  sourceUrl?: string | null;
}): PrintKeyPriceRow[] {
  const sourceUrl = input.sourceUrl?.trim() || undefined;
  const rows: PrintKeyPriceRow[] = [];
  if (input.newCents != null) {
    rows.push({
      condition: "new",
      priceCents: input.newCents,
      productName: input.label,
      ...(sourceUrl ? { sourceUrl } : {}),
    });
  }
  if (input.foilCents != null) {
    rows.push({
      condition: "foil",
      priceCents: input.foilCents,
      productName: `${input.label} (foil)`,
      ...(sourceUrl ? { sourceUrl } : {}),
    });
  }
  return rows;
}

export function offersFromPriceRows(
  source: string,
  currency: string,
  card: unknown,
  rows: PrintKeyPriceRow[],
): PriceOfferInput[] {
  return pricedOffers(
    source,
    rows.map((row) => ({
      condition: row.condition,
      priceCents: row.priceCents,
      rawValue: card,
      extra: {
        currency,
        productName: row.productName,
        ...(row.sourceUrl ? { sourceUrl: row.sourceUrl } : {}),
        metadataScoped: true,
      },
    })),
  );
}

export function createPrintKeyPriceRefresh<TCard>(
  spec: Pick<
    CreatePrintKeyPriceModuleSpec<TCard>,
    "priceSource" | "currency" | "printGame" | "fetchCard" | "priceRows"
  >,
): (ctx: BarcodePriceRefreshContext) => Promise<PriceOfferInput[]> {
  return async (ctx) => {
    if (ctx.shelfType !== "tcg") return [];
    const printKey = printKeyFromPriceContext(ctx);
    if (!printKey) return [];
    if (spec.printGame && parsePrintKey(printKey)?.game !== spec.printGame) {
      return [];
    }
    const card = await spec.fetchCard(printKey, {
      signal: ctx.signal,
      ctx,
    });
    if (!card) return [];
    return offersFromPriceRows(
      spec.priceSource,
      spec.currency,
      card,
      spec.priceRows(card),
    );
  };
}

/** Module entier pour un provider dont la seule capability est `price`. */
export function createPrintKeyPriceModule<TCard>(
  spec: CreatePrintKeyPriceModuleSpec<TCard>,
): ProviderModule {
  const refresh = createPrintKeyPriceRefresh(spec);
  const probeKey = spec.mappingProbe.context.printKey;

  return {
    info: {
      id: spec.providerId,
      label: spec.label,
      types: ["tcg"],
      capabilities: ["price"],
      auth: { kind: "none" },
      supplyMode: "api_live",
      canonical: false,
      ...(spec.websiteUrl ? { websiteUrl: spec.websiteUrl } : {}),
      notes: spec.notes,
      ...(spec.referencePriceSource ? { referencePriceSource: true } : {}),
    },
    mappingProbe: {
      sampleInput: spec.mappingProbe.sampleInput,
      context: spec.mappingProbe.context,
    },
    runMappingProbe: async () => {
      const card = await spec.fetchCard(probeKey, {
        ctx: priceProbeContext({
          printKey: probeKey,
          name: spec.mappingProbe.context.name,
        }),
      });
      return rawProbe(card);
    },
    collectMappingRawKeys: async (context) => {
      const adapterCtx = probeContextOrDefault(
        context,
        spec.mappingProbe.context,
      );
      const printKey = adapterCtx.printKey?.trim() || probeKey;
      return mappingRawKeysFromFetch(() =>
        spec.fetchCard(printKey, {
          ctx: priceProbeContext({
            printKey,
            name: adapterCtx.name,
          }),
        }),
      );
    },
    refreshBarcodePriceOffers: refresh,
  };
}
