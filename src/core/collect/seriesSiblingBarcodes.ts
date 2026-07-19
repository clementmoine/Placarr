import { PROVIDER_MODULES } from "@/core/catalog/registry";
import {
  seriesSiblings,
  seriesTitleEntryFromItemRow,
  type SeriesTitleEntry,
} from "@/core/enrich/titles/series";
import {
  normalizeVolumeNumber,
  volumeNumberFromTitle,
} from "@/core/enrich/titles/volumeNumber";
import { normalizeProductBarcode } from "@/core/identify/normalize";
import { prisma } from "@/lib/db/prisma";

import type { SeriesVolumeBarcode } from "@/types/providerModule";

export type SeriesSiblingBarcodeAttachResult = {
  attached: Array<{ itemId: string; barcode: string; volume: string }>;
};

type ShelfBarcodeCandidate = {
  id: string;
  barcode: string | null;
  title: string;
};

/**
 * Unique volume → barcode pairs only. Ambiguous catalog volumes or shelf
 * volumes (duplicates) are skipped — honest empty over wrong EAN.
 */
export function planSeriesSiblingBarcodeAttaches(input: {
  shelfItems: ShelfBarcodeCandidate[];
  seedTitle: string;
  catalogVolumes: SeriesVolumeBarcode[];
}): Array<{ itemId: string; barcode: string; volume: string }> {
  const entries: SeriesTitleEntry[] = input.shelfItems.map((item) => ({
    id: item.id,
    title: item.title,
  }));
  const siblings = seriesSiblings(input.seedTitle, entries);
  if (siblings.length === 0) return [];

  const catalogByVolume = new Map<string, SeriesVolumeBarcode[]>();
  for (const volume of input.catalogVolumes) {
    const barcode = normalizeProductBarcode(volume.barcode);
    if (!barcode) continue;
    const key = normalizeVolumeNumber(volume.volume);
    const list = catalogByVolume.get(key) ?? [];
    list.push({ ...volume, barcode });
    catalogByVolume.set(key, list);
  }

  const shelfByVolume = new Map<string, ShelfBarcodeCandidate[]>();
  for (const sibling of siblings) {
    const item = input.shelfItems.find((row) => row.id === sibling.id);
    if (!item) continue;
    const volume = volumeNumberFromTitle(sibling.title);
    if (!volume) continue;
    const key = normalizeVolumeNumber(volume);
    const list = shelfByVolume.get(key) ?? [];
    list.push(item);
    shelfByVolume.set(key, list);
  }

  const planned: Array<{ itemId: string; barcode: string; volume: string }> =
    [];
  const usedBarcodes = new Set(
    input.shelfItems
      .map((item) => normalizeProductBarcode(item.barcode))
      .filter((value): value is string => Boolean(value)),
  );

  for (const [volumeKey, items] of shelfByVolume) {
    if (items.length !== 1) continue;
    const item = items[0];
    if (normalizeProductBarcode(item.barcode)) continue;

    const catalogHits = catalogByVolume.get(volumeKey) ?? [];
    if (catalogHits.length !== 1) continue;
    const barcode = catalogHits[0].barcode;
    if (usedBarcodes.has(barcode)) continue;

    usedBarcodes.add(barcode);
    planned.push({ itemId: item.id, barcode, volume: volumeKey });
  }

  return planned;
}

async function collectSeriesVolumeBarcodes(
  seedBarcode: string,
): Promise<SeriesVolumeBarcode[]> {
  const byKey = new Map<string, SeriesVolumeBarcode>();
  for (const providerModule of PROVIDER_MODULES) {
    if (!providerModule.contributeSeriesVolumeBarcodes) continue;
    const volumes = await providerModule.contributeSeriesVolumeBarcodes({
      seedBarcode,
    });
    for (const volume of volumes) {
      const barcode = normalizeProductBarcode(volume.barcode);
      if (!barcode) continue;
      const key = `${normalizeVolumeNumber(volume.volume)}:${barcode}`;
      if (!byKey.has(key)) {
        byKey.set(key, { ...volume, barcode });
      }
    }
  }
  return [...byKey.values()];
}

/**
 * When a book item has a seed ISBN that a provider can expand into series
 * volumes, attach those EANs onto barcode-less shelf siblings matched by volume
 * number (same consensus as `seriesSiblings`). Never overwrites an existing
 * barcode; skips volumes that are ambiguous.
 */
export async function attachSeriesSiblingBarcodesFromProviders(
  itemId: string,
): Promise<SeriesSiblingBarcodeAttachResult> {
  const seed = await prisma.item.findUnique({
    where: { id: itemId },
    select: {
      id: true,
      name: true,
      barcode: true,
      userId: true,
      shelfId: true,
      shelf: { select: { type: true } },
      metadata: { select: { title: true } },
    },
  });
  if (!seed || seed.shelf.type !== "books") {
    return { attached: [] };
  }

  const seedBarcode = normalizeProductBarcode(seed.barcode);
  if (!seedBarcode) return { attached: [] };

  const catalogVolumes = await collectSeriesVolumeBarcodes(seedBarcode);
  if (catalogVolumes.length === 0) return { attached: [] };

  const shelfItems = await prisma.item.findMany({
    where: { shelfId: seed.shelfId, userId: seed.userId },
    select: {
      id: true,
      name: true,
      barcode: true,
      metadata: { select: { title: true } },
    },
  });

  const planned = planSeriesSiblingBarcodeAttaches({
    seedTitle: seriesTitleEntryFromItemRow(seed).title || seed.name,
    shelfItems: shelfItems.map((item) => ({
      id: item.id,
      barcode: item.barcode,
      title: seriesTitleEntryFromItemRow(item).title,
    })),
    catalogVolumes,
  });

  const attached: SeriesSiblingBarcodeAttachResult["attached"] = [];
  for (const row of planned) {
    await prisma.item.update({
      where: { id: row.itemId },
      data: { barcode: row.barcode },
    });
    attached.push(row);
  }

  return { attached };
}
