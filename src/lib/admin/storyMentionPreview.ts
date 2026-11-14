/**
 * Resolve a story mention to a catalogue thumb / full art (admin).
 */
import "server-only";

import { listCatalogueCards } from "@/lib/admin/catalogueCards";
import {
  isCataloguePackId,
  resolveCataloguePackId,
  type CataloguePackId,
} from "@/lib/admin/cataloguePacks";
import {
  listCatalogueProducts,
  type CatalogueSealedRow,
} from "@/lib/admin/catalogueProducts";
import type { StoryMentionKind } from "@/core/enrich/storytelling/mentions";

export type StoryMentionPreview = {
  kind: StoryMentionKind;
  id: string;
  label: string;
  title: string | null;
  thumbUrl: string | null;
  artUrl: string | null;
  found: boolean;
  /** Sealed catalogue row for enlarge → CatalogueSealedDetailDialog. */
  sealedProduct?: CatalogueSealedRow | null;
};

function asPackId(raw: string | null | undefined): CataloguePackId | null {
  const resolved = resolveCataloguePackId(raw) ?? raw;
  return resolved && isCataloguePackId(resolved) ? resolved : null;
}

export async function resolveStoryMentionPreview(input: {
  packId: string;
  kind: StoryMentionKind;
  id: string;
  label?: string;
}): Promise<StoryMentionPreview> {
  const packId = asPackId(input.packId);
  const id = input.id.trim();
  const label = input.label?.trim() || id;
  const base: StoryMentionPreview = {
    kind: input.kind,
    id,
    label,
    title: null,
    thumbUrl: null,
    artUrl: null,
    found: false,
    sealedProduct: null,
  };
  if (!packId || !id) return base;

  if (input.kind === "sealed") {
    const page = listCatalogueProducts({
      pack: packId,
      q: id,
      offset: 0,
      limit: 24,
    });
    const hit =
      page.products.find((row) => row.slug.toLowerCase() === id.toLowerCase()) ??
      page.products[0] ??
      null;
    if (!hit) return base;
    const art = hit.image?.trim() || null;
    return {
      ...base,
      title: hit.name?.trim() || hit.slug,
      thumbUrl: art,
      artUrl: art,
      found: true,
      sealedProduct: hit,
    };
  }

  const page = await listCatalogueCards({
    pack: packId,
    q: id,
    offset: 0,
    limit: 24,
  });
  const hit =
    page.cards.find(
      (row) => row.printKey.toLowerCase() === id.toLowerCase(),
    ) ??
    page.cards.find((row) =>
      row.printKey.toLowerCase().includes(id.toLowerCase().split(":").pop()!),
    ) ??
    page.cards[0] ??
    null;
  if (!hit) return base;
  const art = hit.artUrl?.trim() || null;
  const thumb = hit.thumbUrl?.trim() || art;
  return {
    ...base,
    title: hit.name?.trim() || hit.label?.trim() || hit.printKey,
    thumbUrl: thumb,
    artUrl: art,
    found: Boolean(art || thumb),
  };
}
