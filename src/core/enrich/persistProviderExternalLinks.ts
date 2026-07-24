import { cleanCode } from "@/core/identify/query";
import { prisma } from "@/lib/db/prisma";
import { reconcileLegacyPriceOfferSources } from "@/core/enrich/evidence";
import {
  appendMissingProviderExternalLinkFacts,
  coverAttachmentsFromPriceOffers,
  dedupeProviderExternalLinkFacts,
  externalLinkFactsFromFieldEvidence,
  mirrorSourceUrlFactsAsExternalLinks,
  purgeContradictedProviderExternalLinks,
  reconcileExternalLinksFromPriceOffers,
  type ProviderMetadataLinkInput,
} from "@/core/enrich/providerExternalLinks";
import { dedupeFacts } from "@/core/enrich/facts";
import { formatMetadataFromStorage } from "@/core/enrich/dbMapping";
import { syncMetadataDisplayFactsFromFieldEvidence } from "@/core/enrich/metadataFactsProjection";
import {
  getProviderModule,
  providerIdForSourceToken,
} from "@/core/catalog/catalog";
import type { FieldEvidenceInput } from "@/core/enrich/evidence";
import type { MetadataFact } from "@/types/metadataProvider";

function externalLinkSnapshot(facts: MetadataFact[]): string {
  return JSON.stringify(
    facts
      .filter((fact) => fact.kind === "external-link" && fact.url?.trim())
      .map((fact) => ({
        source: fact.source ?? fact.label ?? "",
        url: fact.url!.trim(),
      }))
      .sort((a, b) =>
        `${a.source}\0${a.url}`.localeCompare(`${b.source}\0${b.url}`),
      ),
  );
}

function parseStoredFacts(raw: string | null | undefined): MetadataFact[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as MetadataFact[]) : [];
  } catch {
    return [];
  }
}

async function purgeValidatedRetailerExternalLinks(
  facts: MetadataFact[],
  itemBarcode?: string | null,
  itemTitle?: string | null,
): Promise<MetadataFact[]> {
  if (!itemBarcode?.trim()) return facts;

  const kept: MetadataFact[] = [];
  for (const fact of facts) {
    if (fact.kind !== "external-link" || !fact.url?.trim()) {
      kept.push(fact);
      continue;
    }

    const providerModule = getProviderModule(
      providerIdForSourceToken(fact.source ?? fact.label ?? ""),
    );
    if (providerModule?.validateStoredExternalLinkAgainstBarcode) {
      const contradicted =
        await providerModule.validateStoredExternalLinkAgainstBarcode(
          fact.url,
          itemBarcode,
          itemTitle,
        );
      if (contradicted) continue;
    }

    kept.push(fact);
  }
  return kept;
}

export async function persistProviderExternalLinksForMetadata(
  metadataId: string,
  input: {
    itemBarcode?: string | null;
    itemTitle?: string | null;
    shelfType?: string | null;
    providerInputs?: readonly ProviderMetadataLinkInput[];
    priceOffers?: ReadonlyArray<{
      source: string;
      sourceUrl?: string | null;
      rawValue?: unknown;
    }>;
    fieldEvidence?: readonly FieldEvidenceInput[];
  },
): Promise<MetadataFact[] | null> {
  const row = await prisma.metadata.findUnique({
    where: { id: metadataId },
    select: { facts: true },
  });
  if (!row) return null;

  const existing = parseStoredFacts(row.facts);
  let next = purgeContradictedProviderExternalLinks(
    existing,
    input.itemBarcode,
    input.itemTitle,
    input.shelfType,
  );
  next = await purgeValidatedRetailerExternalLinks(
    next,
    input.itemBarcode,
    input.itemTitle,
  );

  const mirrored = mirrorSourceUrlFactsAsExternalLinks(next);
  if (mirrored.length > 0) {
    next = [...next, ...mirrored];
  }

  if (input.providerInputs?.length) {
    next = appendMissingProviderExternalLinkFacts(next, input.providerInputs);
  }
  if (input.priceOffers?.length) {
    next = reconcileExternalLinksFromPriceOffers(
      next,
      input.priceOffers,
      input.itemBarcode,
      input.itemTitle,
      input.shelfType,
    );
  }
  if (input.fieldEvidence?.length) {
    next = [
      ...next,
      ...externalLinkFactsFromFieldEvidence(input.fieldEvidence, next),
    ];
  }

  const deduped = dedupeFacts(dedupeProviderExternalLinkFacts(next));
  if (externalLinkSnapshot(existing) === externalLinkSnapshot(deduped ?? [])) {
    return deduped ?? null;
  }

  await prisma.metadata.update({
    where: { id: metadataId },
    data: {
      facts: deduped ? JSON.stringify(deduped) : null,
    },
  });

  return deduped ?? null;
}

async function loadCachedPriceOffersForBarcode(barcode: string) {
  const cleanedBarcode = cleanCode(barcode);
  if (!cleanedBarcode) return [];

  const cache = await prisma.barcodeCache.findUnique({
    where: { barcode: cleanedBarcode },
    select: {
      priceOffers: {
        select: { source: true, sourceUrl: true, rawValue: true },
      },
    },
  });

  return cache?.priceOffers ?? [];
}

async function loadItemScopedPriceOffers(input: {
  itemId?: string;
  metadataId?: string | null;
}) {
  const scopes: Array<{ itemId: string } | { metadataId: string }> = [];
  if (input.itemId) scopes.push({ itemId: input.itemId });
  if (input.metadataId) scopes.push({ metadataId: input.metadataId });
  if (scopes.length === 0) return [];

  return prisma.priceOffer.findMany({
    where: scopes.length === 1 ? scopes[0] : { OR: scopes },
    orderBy: { observedAt: "desc" },
    take: 24,
    select: { source: true, sourceUrl: true, rawValue: true },
  });
}

function dedupePriceOfferLinks<
  T extends { source: string; sourceUrl?: string | null },
>(offers: T[]): T[] {
  const seen = new Set<string>();
  const deduped: T[] = [];
  for (const offer of offers) {
    const key = `${offer.source}\0${offer.sourceUrl ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(offer);
  }
  return deduped;
}

async function loadPriceOffersForExternalLinkSync(input: {
  itemId?: string;
  metadataId?: string | null;
  itemBarcode?: string | null;
}) {
  const [barcodeOffers, itemOffers] = await Promise.all([
    input.itemBarcode?.trim()
      ? loadCachedPriceOffersForBarcode(input.itemBarcode)
      : Promise.resolve([]),
    loadItemScopedPriceOffers(input),
  ]);
  return dedupePriceOfferLinks([...barcodeOffers, ...itemOffers]);
}

async function loadFieldEvidenceForExternalLinkSync(
  metadataId: string,
): Promise<FieldEvidenceInput[]> {
  const rows = await prisma.fieldEvidence.findMany({
    where: { metadataId },
    select: {
      field: true,
      source: true,
      value: true,
      sourceUrl: true,
      priority: true,
      confidence: true,
    },
  });

  return rows.map((row) => ({
    field: row.field,
    source: row.source,
    value: row.value,
    sourceUrl: row.sourceUrl,
    priority: row.priority,
    confidence: row.confidence,
  }));
}

export async function repairProviderExternalLinksForItem(
  itemId: string,
): Promise<void> {
  const item = await prisma.item.findUnique({
    where: { id: itemId },
    select: {
      id: true,
      name: true,
      barcode: true,
      metadataId: true,
      shelf: { select: { type: true } },
    },
  });
  if (!item?.metadataId) return;

  const scopes: Array<{
    itemId?: string;
    metadataId?: string;
    barcodeCacheId?: number;
  }> = [{ itemId: item.id, metadataId: item.metadataId }];
  const cleanedBarcode = item.barcode ? cleanCode(item.barcode) : "";
  if (cleanedBarcode) {
    const cache = await prisma.barcodeCache.findUnique({
      where: { barcode: cleanedBarcode },
      select: { id: true },
    });
    if (cache) {
      scopes.push({ barcodeCacheId: cache.id });
    }
  }

  await Promise.all(
    scopes.map((scope) => reconcileLegacyPriceOfferSources(scope)),
  );

  await syncPriceOfferExternalLinksForMetadata({
    metadataId: item.metadataId,
    itemId: item.id,
    itemBarcode: item.barcode,
    itemTitle: item.name,
    shelfType: item.shelf?.type,
  });

  try {
    await syncMetadataDisplayFactsFromFieldEvidence({
      metadataId: item.metadataId,
      itemBarcode: item.barcode,
      itemTitle: item.name,
    });
  } catch (error) {
    console.warn(
      `[Metadata] Field-evidence fact projection failed for item ${itemId}:`,
      error,
    );
  }
}

export async function syncPriceOfferExternalLinksForMetadata(input: {
  metadataId: string;
  itemId?: string;
  itemBarcode?: string | null;
  itemTitle?: string | null;
  shelfType?: string | null;
}): Promise<void> {
  const [priceOffers, fieldEvidence] = await Promise.all([
    loadPriceOffersForExternalLinkSync(input),
    loadFieldEvidenceForExternalLinkSync(input.metadataId),
  ]);

  await persistProviderExternalLinksForMetadata(input.metadataId, {
    itemBarcode: input.itemBarcode,
    itemTitle: input.itemTitle,
    shelfType: input.shelfType,
    priceOffers,
    fieldEvidence,
  });

  await syncMarketplaceCoverAttachmentsFromPriceOffers({
    metadataId: input.metadataId,
    itemTitle: input.itemTitle,
    shelfType: input.shelfType,
    priceOffers,
  });
}

async function syncMarketplaceCoverAttachmentsFromPriceOffers(input: {
  metadataId: string;
  itemTitle?: string | null;
  shelfType?: string | null;
  priceOffers: ReadonlyArray<{
    source: string;
    sourceUrl?: string | null;
    rawValue?: unknown;
  }>;
}): Promise<void> {
  if (input.priceOffers.length === 0) return;

  const existing = await prisma.attachment.findMany({
    where: { metadataId: input.metadataId },
    select: { url: true, source: true, type: true },
  });
  const covers = coverAttachmentsFromPriceOffers(input.priceOffers, {
    itemTitle: input.itemTitle,
    shelfType: input.shelfType,
    existingAttachments: existing,
  });
  if (covers.length === 0) return;

  await prisma.attachment.createMany({
    data: covers.map((cover) => ({
      metadataId: input.metadataId,
      type: cover.type,
      url: cover.url,
      title: cover.title ?? null,
      source: cover.source ?? null,
      role: cover.role ?? null,
    })),
  });
}

export async function persistProviderExternalLinksForBarcodeItems(
  barcode: string,
  priceOffers: ReadonlyArray<{ source: string; sourceUrl?: string | null }>,
): Promise<void> {
  if (!barcode.trim()) return;

  const items = await prisma.item.findMany({
    where: { barcode, metadataId: { not: null } },
    select: {
      metadataId: true,
      name: true,
      shelf: { select: { type: true } },
    },
  });
  if (items.length === 0) return;

  const metadataIds = Array.from(
    new Set(
      items
        .map((item) => item.metadataId)
        .filter((id): id is string => Boolean(id)),
    ),
  );

  await Promise.all(
    metadataIds.map((metadataId) => {
      const item = items.find((row) => row.metadataId === metadataId);
      return persistProviderExternalLinksForMetadata(metadataId, {
        itemBarcode: barcode,
        itemTitle: item?.name,
        shelfType: item?.shelf?.type,
        priceOffers,
      });
    }),
  );
}

export function metadataFactsFromStorageRow(
  metadata: Parameters<typeof formatMetadataFromStorage>[0],
): MetadataFact[] {
  return formatMetadataFromStorage(metadata).facts ?? [];
}
