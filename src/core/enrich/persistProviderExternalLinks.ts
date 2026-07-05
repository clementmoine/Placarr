import { cleanCode } from "@/core/identify/query";
import { prisma } from "@/lib/db/prisma";
import {
  appendMissingProviderExternalLinkFacts,
  dedupeProviderExternalLinkFacts,
  externalLinkFactsFromFieldEvidence,
  purgeContradictedProviderExternalLinks,
  reconcileExternalLinksFromPriceOffers,
  type ProviderMetadataLinkInput,
} from "@/core/enrich/providerExternalLinks";
import { dedupeFacts } from "@/core/enrich/facts";
import { formatMetadataFromStorage } from "@/core/enrich/dbMapping";
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
  );
  next = await purgeValidatedRetailerExternalLinks(
    next,
    input.itemBarcode,
    input.itemTitle,
  );

  if (input.providerInputs?.length) {
    next = appendMissingProviderExternalLinkFacts(next, input.providerInputs);
  }
  if (input.fieldEvidence?.length) {
    next = [
      ...next,
      ...externalLinkFactsFromFieldEvidence(input.fieldEvidence, next),
    ];
  }
  if (input.priceOffers?.length) {
    next = reconcileExternalLinksFromPriceOffers(
      next,
      input.priceOffers,
      input.itemBarcode,
      input.itemTitle,
    );
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

export async function repairProviderExternalLinksForItem(
  itemId: string,
): Promise<void> {
  const item = await prisma.item.findUnique({
    where: { id: itemId },
    select: { name: true, barcode: true, metadataId: true },
  });
  if (!item?.metadataId) return;

  await syncPriceOfferExternalLinksForMetadata({
    metadataId: item.metadataId,
    itemBarcode: item.barcode,
    itemTitle: item.name,
  });
}

export async function syncPriceOfferExternalLinksForMetadata(input: {
  metadataId: string;
  itemBarcode?: string | null;
  itemTitle?: string | null;
}): Promise<void> {
  const priceOffers = input.itemBarcode
    ? await loadCachedPriceOffersForBarcode(input.itemBarcode)
    : [];

  await persistProviderExternalLinksForMetadata(input.metadataId, {
    itemBarcode: input.itemBarcode,
    itemTitle: input.itemTitle,
    priceOffers,
  });
}

export async function persistProviderExternalLinksForBarcodeItems(
  barcode: string,
  priceOffers: ReadonlyArray<{ source: string; sourceUrl?: string | null }>,
): Promise<void> {
  if (!barcode.trim()) return;

  const items = await prisma.item.findMany({
    where: { barcode, metadataId: { not: null } },
    select: { metadataId: true, name: true },
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
      const itemTitle = items.find(
        (item) => item.metadataId === metadataId,
      )?.name;
      return persistProviderExternalLinksForMetadata(metadataId, {
        itemBarcode: barcode,
        itemTitle,
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
