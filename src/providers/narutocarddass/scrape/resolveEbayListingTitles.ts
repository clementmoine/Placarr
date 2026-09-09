/**
 * Resolve pasted eBay.it listing ids via the official Browse API (no HTML
 * scrape) into a report: title + gallery image URLs. Identification of the
 * cards is a separate, reviewed step.
 *
 * Run: pnpm tsx --env-file=.env src/providers/narutocarddass/scrape/resolveEbayListingTitles.ts <ids.txt>
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { dataRoot } from "@/lib/runtimeData";
import {
  ebayBrowseItemId,
  fetchEbayBrowseItem,
  type EbayBrowseItem,
} from "@/providers/ebay/browseItem";

import { NARUTO_PACK_ID } from "../packs";

export type EbayResolvedListing = {
  legacyItemId: string;
  ok: boolean;
  title: string | null;
  itemWebUrl: string | null;
  imageUrls: string[];
};

export async function resolveEbayListingTitles(
  legacyIds: readonly string[],
  opts: { root?: string; outFile?: string } = {},
): Promise<{ resolved: EbayResolvedListing[]; file: string }> {
  const outFile =
    opts.outFile ??
    path.join(
      opts.root ?? dataRoot(),
      NARUTO_PACK_ID,
      "staging",
      "ebay-it-2026-08-31",
      "resolved-listings.json",
    );
  mkdirSync(path.dirname(outFile), { recursive: true });

  const resolved: EbayResolvedListing[] = [];
  for (const legacyId of legacyIds) {
    const item: EbayBrowseItem | null = await fetchEbayBrowseItem(
      ebayBrowseItemId(legacyId),
      { marketplaceId: "EBAY_IT" },
    ).catch(() => null);
    resolved.push({
      legacyItemId: legacyId,
      ok: item !== null,
      title: item?.title ?? null,
      itemWebUrl: item?.itemWebUrl ?? null,
      imageUrls: item?.imageUrls ?? [],
    });
    writeFileSync(outFile, `${JSON.stringify(resolved, null, 2)}\n`, "utf8");
    console.log(
      `${resolved.length}/${legacyIds.length} ${legacyId} -> ${item?.title?.slice(0, 80) ?? "(échec)"}`,
    );
  }
  return { resolved, file: outFile };
}

const thisFile = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === thisFile) {
  const file = process.argv[2];
  if (!file) {
    console.error("usage: tsx resolveEbayListingTitles.ts <ids.txt>");
    process.exit(1);
  }
  const ids = [
    ...new Set(
      readFileSync(file, "utf8")
        .split(/\r?\n/)
        .map((line) => /(\d{9,})/.exec(line.trim())?.[1])
        .filter((v): v is string => Boolean(v)),
    ),
  ];
  console.log(`${ids.length} annonces à résoudre`);
  resolveEbayListingTitles(ids).catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
