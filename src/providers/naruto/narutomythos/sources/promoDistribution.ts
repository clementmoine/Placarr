/**
 * Mythos promo distribution digs → MetadataFact + proof attachments.
 *
 * Curated research (Kana manga insert, official tweet) — not invented shelf
 * copy. Attached to printKey so Sync / enrich can densify items.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { sanitizePublicCitationUrl } from "@/core/enrich/citations/publicCitationUrl";
import { assetsCardUrl } from "@/lib/packAssetUrls";
import type {
  MetadataAttachment,
  MetadataFact,
} from "@/types/metadataProvider";

import {
  NARUTO_MYTHOS_PACK_ID,
  NARUTO_MYTHOS_PROVIDER_ID,
  narutoMythosCuratedDir,
} from "../pack";
import { mythosOfficialEventFacts } from "./officialEvents";

export const VV2_PROMO_PRINT_KEY = "mythos:ks1promo-0133-vv2";
export const VV2_PROMO_DIG_FILE = "kana-boruto-tbv6-vv2-promo.json";

export type MythosPromoTweetProof = {
  handle: string;
  statusUrl: string;
  claimFr: string;
  claimEn: string;
  media: readonly {
    lang: string;
    url: string;
    local: string;
  }[];
};

export type MythosPromoDistributionDig = {
  kind: string;
  verdict: string;
  printKey: string;
  lang: string;
  printed?: string;
  grouping?: string;
  summary?: string;
  officialAnnouncement: {
    publisher: string;
    product: string;
    isbn: string;
    releaseDate: string;
    printRun?: string;
    coverUrl?: string;
  };
  proof: {
    tweet: MythosPromoTweetProof;
    faceCrop?: { local: string; note?: string };
  };
};

let digCache: MythosPromoDistributionDig | null | undefined;

export function resetMythosPromoDistributionCache(): void {
  digCache = undefined;
}

export function mythosPromoDigPath(): string {
  return path.join(narutoMythosCuratedDir(), "sources", VV2_PROMO_DIG_FILE);
}

export function loadMythosPromoDistributionDig(): MythosPromoDistributionDig | null {
  if (digCache !== undefined) return digCache;
  try {
    const raw = JSON.parse(
      readFileSync(mythosPromoDigPath(), "utf8"),
    ) as MythosPromoDistributionDig;
    digCache =
      raw?.kind === "research-dig" &&
      raw.verdict === "confirmed" &&
      typeof raw.printKey === "string"
        ? raw
        : null;
  } catch {
    digCache = null;
  }
  return digCache;
}

/** Curated asset under `curated/sources/` (dig `local` paths are relative). */
export function mythosPromoCuratedAssetPath(local: string): string {
  return path.join(narutoMythosCuratedDir(), "sources", local);
}

export function mythosPromoCuratedAssetsExist(
  dig: MythosPromoDistributionDig = loadMythosPromoDistributionDig()!,
): boolean {
  if (!dig) return false;
  const locals = [
    ...dig.proof.tweet.media.map((m) => m.local),
    dig.proof.faceCrop?.local,
  ].filter((p): p is string => Boolean(p));
  return locals.every((rel) => existsSync(mythosPromoCuratedAssetPath(rel)));
}

/**
 * Distribution (+ optional citation) facts for a Mythos printKey.
 * Unknown keys → empty (no invented channel).
 */
export function mythosPrintFacts(printKey: string | null | undefined): MetadataFact[] {
  const key = printKey?.trim() || "";
  if (!key) return [];
  const facts: MetadataFact[] = [...mythosOfficialEventFacts(key)];
  const dig = loadMythosPromoDistributionDig();
  if (dig && dig.printKey === key) {
    const tweetUrl =
      sanitizePublicCitationUrl(dig.proof.tweet.statusUrl) ??
      dig.proof.tweet.statusUrl;
    const run = dig.officialAnnouncement.printRun?.trim() || "premier tirage";
    facts.push({
      kind: "category",
      label: "Distribution",
      value: `Insert manga — Boruto Two Blue Vortex t.6, ${run} (Kana)`,
      url: tweetUrl,
      source: NARUTO_MYTHOS_PROVIDER_ID,
      sourceNames: ["Naruto Mythos TCG", "Kana"],
      confidence: 0.9,
      priority: 34,
      providerLabel: "Naruto Mythos",
    });
    const claim = dig.proof.tweet.claimFr?.trim();
    if (claim && tweetUrl) {
      facts.push({
        kind: "story",
        label: "Le saviez-vous ?",
        value: claim,
        url: tweetUrl,
        source: NARUTO_MYTHOS_PROVIDER_ID,
        sourceNames: ["Naruto Mythos TCG", "Kana"],
        confidence: 0.9,
        priority: 28,
        providerLabel: "Naruto Mythos",
      });
    }
  }
  return facts;
}

/**
 * Flyer proof images installed next to the FR face under the card dir
 * (`proof.*.twitter.webp`), served via `/assets/.../cards/...`.
 */
export function mythosPromoProofAttachments(
  printKey: string | null | undefined,
): MetadataAttachment[] {
  const key = printKey?.trim() || "";
  if (!key) return [];
  const dig = loadMythosPromoDistributionDig();
  if (!dig || dig.printKey !== key) return [];

  const disk = {
    lang: dig.lang || "fr",
    set: "ks1promo",
    card: "0133-vv2",
  };

  const out: MetadataAttachment[] = [];
  for (const media of dig.proof.tweet.media) {
    const file =
      media.lang === "en"
        ? "proof.english.twitter.webp"
        : "proof.french.twitter.webp";
    out.push({
      type: "cover",
      url: assetsCardUrl(NARUTO_MYTHOS_PACK_ID, disk, file),
      title:
        media.lang === "en"
          ? "Annonce promo Mythos (flyer EN)"
          : "Annonce promo Mythos (flyer FR)",
      role: `mythos-proof-flyer-${media.lang}`,
      source: NARUTO_MYTHOS_PROVIDER_ID,
      coverProvenance: "catalog",
    });
  }
  return out;
}
