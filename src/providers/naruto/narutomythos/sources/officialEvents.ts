/**
 * Official CICABOOM events dig (FR/EN/ES pages) → Distribution facts.
 *
 * Curated snapshot of https://www.narutotcgmythos.com/{fr/evenements,events,es/eventos}.
 * Rewards with a resolved printKey densify Sync / enrich; unmatched Shippuden
 * promos stay listed on the event without inventing catalogue rows.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { sanitizePublicCitationUrl } from "@/core/enrich/citations/publicCitationUrl";
import type { MetadataFact } from "@/types/metadataProvider";

import {
  NARUTO_MYTHOS_PROVIDER_ID,
  narutoMythosCuratedDir,
} from "../pack";

export const OFFICIAL_EVENTS_DIG_FILE = "official-events.json";

export type MythosOfficialEventReward = {
  tier?: string;
  name: string;
  printKey?: string;
};

export type MythosOfficialEvent = {
  id: string;
  kind: string;
  dateStart?: string;
  dateEnd?: string;
  dateLabel?: Record<string, string>;
  titles: Record<string, string>;
  location?: string[];
  rewards?: MythosOfficialEventReward[];
  sourceUrls: string[];
};

export type MythosOfficialStampFace = {
  printKey: string;
  lang: string;
  art: string;
  cdn: string;
  local: string;
};

export type MythosOfficialEventsDig = {
  kind: string;
  verdict: string;
  observed?: string;
  summary?: string;
  pages: readonly { lang: string; url: string }[];
  events: MythosOfficialEvent[];
  /** CDN event stamps densified onto existing printKeys (`art.regional`…). */
  stampFaces?: {
    observed?: string;
    note?: string;
    cdnBase?: string;
    faces: MythosOfficialStampFace[];
  };
};

const TIER_FR: Record<string, string> = {
  participation: "participation",
  winner: "vainqueur",
  "side-participation": "side event (participation)",
  "side-winner": "side event (vainqueur)",
  top4: "Top 4",
  top8: "Top 8",
  top16: "Top 16",
  top32: "Top 32",
  top64: "Top 64",
  judge: "arbitre",
  demo: "démo",
  "box-purchase": "achat box",
  "goodie-bag": "goodie bag",
  "exclusive-promo": "promo exclusive",
};

let digCache: MythosOfficialEventsDig | null | undefined;
let factsByPrint:
  | Map<string, MetadataFact[]>
  | undefined;

export function resetMythosOfficialEventsCache(): void {
  digCache = undefined;
  factsByPrint = undefined;
}

export function mythosOfficialEventsDigPath(): string {
  return path.join(
    narutoMythosCuratedDir(),
    "sources",
    OFFICIAL_EVENTS_DIG_FILE,
  );
}

export function loadMythosOfficialEventsDig(): MythosOfficialEventsDig | null {
  if (digCache !== undefined) return digCache;
  try {
    const raw = JSON.parse(
      readFileSync(mythosOfficialEventsDigPath(), "utf8"),
    ) as MythosOfficialEventsDig;
    digCache =
      raw?.kind === "research-dig" &&
      raw.verdict === "confirmed" &&
      Array.isArray(raw.events)
        ? raw
        : null;
  } catch {
    digCache = null;
  }
  return digCache;
}

function eventTitle(event: MythosOfficialEvent): string {
  return (
    event.titles.fr?.trim() ||
    event.titles.en?.trim() ||
    event.titles.es?.trim() ||
    event.id
  );
}

function eventCitationUrl(event: MythosOfficialEvent): string {
  const fr =
    event.sourceUrls.find((u) => u.includes("/fr/")) ||
    event.sourceUrls[0] ||
    "https://www.narutotcgmythos.com/fr/evenements";
  return sanitizePublicCitationUrl(fr) ?? fr;
}

function tierLabel(tier: string | undefined): string | null {
  if (!tier) return null;
  return TIER_FR[tier] ?? tier;
}

function formatEventFactValue(
  event: MythosOfficialEvent,
  reward: MythosOfficialEventReward,
): string {
  const title = eventTitle(event);
  const when =
    event.dateStart && event.dateEnd && event.dateStart !== event.dateEnd
      ? `${event.dateStart} → ${event.dateEnd}`
      : event.dateStart ||
        event.dateLabel?.fr ||
        event.dateLabel?.en ||
        null;
  const place = event.location?.filter(Boolean).slice(0, 2).join(" · ") || null;
  const tier = tierLabel(reward.tier);
  const parts = [
    `Événement — ${title}`,
    when,
    place,
    tier ? `récompense : ${tier}` : null,
  ].filter(Boolean);
  return parts.join(" · ");
}

function buildFactsIndex(
  dig: MythosOfficialEventsDig,
): Map<string, MetadataFact[]> {
  const byKey = new Map<string, MetadataFact[]>();
  for (const event of dig.events) {
    const url = eventCitationUrl(event);
    for (const reward of event.rewards ?? []) {
      const printKey = reward.printKey?.trim();
      if (!printKey) continue;
      const value = formatEventFactValue(event, reward);
      const fact: MetadataFact = {
        kind: "category",
        label: "Distribution",
        value,
        url,
        source: NARUTO_MYTHOS_PROVIDER_ID,
        sourceNames: ["Naruto Mythos TCG"],
        confidence: 0.85,
        priority: 33,
        providerLabel: "Naruto Mythos",
      };
      const list = byKey.get(printKey) ?? [];
      if (!list.some((f) => f.value === fact.value && f.url === fact.url)) {
        list.push(fact);
      }
      byKey.set(printKey, list);
    }
  }
  return byKey;
}

/** Distribution facts from the official events calendar for a printKey. */
export function mythosOfficialEventFacts(
  printKey: string | null | undefined,
): MetadataFact[] {
  const key = printKey?.trim() || "";
  if (!key) return [];
  const dig = loadMythosOfficialEventsDig();
  if (!dig) return [];
  if (!factsByPrint) factsByPrint = buildFactsIndex(dig);
  return factsByPrint.get(key) ?? [];
}

/** Events that list a reward for this printKey (tests / diagnostics). */
export function mythosOfficialEventsForPrint(
  printKey: string | null | undefined,
): MythosOfficialEvent[] {
  const key = printKey?.trim() || "";
  if (!key) return [];
  const dig = loadMythosOfficialEventsDig();
  if (!dig) return [];
  return dig.events.filter((event) =>
    (event.rewards ?? []).some((r) => r.printKey === key),
  );
}
