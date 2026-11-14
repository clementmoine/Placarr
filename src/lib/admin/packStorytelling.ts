/**
 * Admin enumerator for pack storytelling ledgers (+ dig drafts without prose).
 */
import "server-only";

import { sanitizePublicCitationUrl } from "@/core/enrich/citations/publicCitationUrl";
import { storyBodyPlainText } from "@/core/enrich/storytelling/mentions";
import type { CataloguePackId } from "@/lib/admin/cataloguePacks";
import { NARUTO_PACK_ID } from "@/providers/naruto/narutocarddass/packs";
import {
  listNarutoStorytellingEntries,
  storytellingSearchBlob,
  type StorytellingEntry,
} from "@/providers/naruto/narutocarddass/sources/storytelling";
import {
  narutoSealedDistributionCitation,
  narutoStoryFactsForSealedSlug,
} from "@/providers/naruto/narutocarddass/sources/digCitations";

export type PackStorySource = {
  claim: string;
  url: string;
};

export type PackStoryRow = {
  packId: string;
  id: string;
  /** Editorial live vs dig claim waiting for prose. */
  status: "editorial" | "draft";
  bodyFr: string;
  plainText: string;
  targets: {
    sealed: readonly string[];
    prints: readonly string[];
  };
  sources: readonly PackStorySource[];
};

function fromLedger(
  packId: string,
  entry: StorytellingEntry,
): PackStoryRow {
  return {
    packId,
    id: entry.id,
    status: "editorial",
    bodyFr: entry.bodyFr,
    plainText: storyBodyPlainText(entry.bodyFr),
    targets: entry.targets,
    sources: entry.sources.map((s) => ({ claim: s.claim, url: s.url })),
  };
}

/** Dig sealed stories that are not yet covered by an editorial target. */
function carddassDraftRows(packId: string): PackStoryRow[] {
  const editorialSlugs = new Set(
    listNarutoStorytellingEntries().flatMap((e) => e.targets.sealed),
  );
  const candidates = [
    "pack-decouverte",
    "tin-box",
    "tin-box-hobby",
    "booster-s28",
    "booster-s28-en",
    "duopack-s28",
    "display-s28-fr",
    "starter-detruire-konoha",
    "starter-sceller-le-malefice",
    "starter-la-quete",
    "starter-un-nouveau-depart",
    "booster-s3-es",
    "starter-il-fascino-del-male",
    "booster-s6-it",
    "booster-s7-it",
    "booster-tp3",
    "booster-s5-en",
  ];
  const out: PackStoryRow[] = [];
  for (const slug of candidates) {
    if (editorialSlugs.has(slug)) continue;
    const dig = narutoStoryFactsForSealedSlug(slug)[0];
    const dist = narutoSealedDistributionCitation(slug);
    const url =
      sanitizePublicCitationUrl(dig?.url) ??
      sanitizePublicCitationUrl(dist?.url);
    const claim = dig?.value?.trim() || dist?.label?.trim() || "";
    if (!url || !claim) continue;
    // Skip if dig value already looks like a long editorial (shouldn't).
    out.push({
      packId,
      id: `draft-sealed-${slug}`,
      status: "draft",
      bodyFr: claim,
      plainText: claim,
      targets: { sealed: [slug], prints: [] },
      sources: [{ claim, url }],
    });
  }
  return out;
}

export function listPackStorytelling(
  packId: CataloguePackId | string,
  opts?: { q?: string | null },
): PackStoryRow[] {
  const pack = packId.trim();
  if (!pack) return [];

  let rows: PackStoryRow[] = [];
  if (pack === NARUTO_PACK_ID) {
    rows = [
      ...listNarutoStorytellingEntries().map((e) => fromLedger(pack, e)),
      ...carddassDraftRows(pack),
    ];
  }

  const q = opts?.q?.trim().toLowerCase() || "";
  if (q) {
    rows = rows.filter((row) => {
      if (row.status === "editorial") {
        const entry = listNarutoStorytellingEntries().find((e) => e.id === row.id);
        if (entry && storytellingSearchBlob(entry).includes(q)) return true;
      }
      return (
        row.plainText.toLowerCase().includes(q) ||
        row.id.toLowerCase().includes(q) ||
        row.targets.sealed.some((s) => s.includes(q)) ||
        row.targets.prints.some((s) => s.toLowerCase().includes(q)) ||
        row.sources.some(
          (s) =>
            s.claim.toLowerCase().includes(q) ||
            s.url.toLowerCase().includes(q),
        )
      );
    });
  }
  return rows;
}
