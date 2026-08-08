/**
 * Local Live foil assets for Pokémon TCG Live provider.
 * Server-only (imports liveCardsIndex / resolveEffect dump paths).
 */
import "@/effects/pokemon/liveCardsIndex";
import { lookupByBundle } from "@/effects/pokemon/liveCardsLookups";
import {
  paperArtUrl,
  paperCard,
  resolveLiveBundleForPrintKey,
} from "@/effects/pokemon/resolveEffect";

import type { MetadataAttachment } from "@/types/metadataProvider";

const PROVIDER_ID = "pokemontcglive";

export function liveFrontUrlForPrint(opts: {
  printKey: string;
  language?: string | null;
  name?: string | null;
}): string | null {
  const liveBundle = resolveLiveBundleForPrintKey(
    opts.printKey,
    opts.language,
    opts.name,
  );
  if (!liveBundle) return null;
  const entry = paperCard(liveBundle);
  return paperArtUrl(
    liveBundle,
    entry?.std?.cardTex ?? entry?.ph?.cardTex,
  );
}

export function buildPokemonLiveAttachments(opts: {
  printKey: string;
  language?: string | null;
  name?: string | null;
  title?: string | null;
}): MetadataAttachment[] {
  const url = liveFrontUrlForPrint(opts);
  if (!url) return [];
  return [
    {
      type: "cover",
      url,
      title: opts.title ?? opts.name ?? undefined,
      role: "tcglive-front",
      source: PROVIDER_ID,
    },
  ];
}

export function liveTitleForPrint(opts: {
  printKey: string;
  language?: string | null;
  name?: string | null;
}): string | null {
  const liveBundle = resolveLiveBundleForPrintKey(
    opts.printKey,
    opts.language,
    opts.name,
  );
  if (!liveBundle) return opts.name?.trim() || null;
  const row = lookupByBundle(liveBundle);
  if (!row) return opts.name?.trim() || null;
  const lang = opts.language?.toLowerCase();
  if (lang === "fr" && row.nameFr) return row.nameFr;
  if (row.nameEn) return row.nameEn;
  return row.nameFr ?? opts.name?.trim() ?? null;
}
