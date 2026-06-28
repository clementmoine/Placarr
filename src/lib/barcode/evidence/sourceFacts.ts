import { normalizeBoardGamePlayerCount } from "@/lib/metadata/boardGame";

import type { BarcodeSourceFact } from "./types";

export function barcodeSourceFactsFromFields(fields: {
  platformKey?: string | null;
  players?: string | null;
  playtime?: string | null;
  ageRating?: string | null;
  mediaFormat?: string | null;
}): BarcodeSourceFact[] {
  const facts: BarcodeSourceFact[] = [];

  if (fields.platformKey?.trim()) {
    facts.push({
      kind: "platform",
      label: "Plateforme",
      value: fields.platformKey.trim(),
    });
  }

  if (fields.players?.trim()) {
    facts.push({
      kind: "players",
      label: "Joueurs",
      value: normalizeBoardGamePlayerCount(fields.players.trim()),
    });
  }

  if (fields.playtime?.trim()) {
    facts.push({
      kind: "playtime",
      label: "Durée",
      value: fields.playtime.trim(),
    });
  }

  if (fields.ageRating?.trim()) {
    facts.push({
      kind: "age-rating",
      label: fields.ageRating.trim().startsWith("PEGI")
        ? "PEGI"
        : "Classification",
      value: fields.ageRating.trim().replace(/^PEGI\s*/i, "").trim(),
    });
  }

  if (fields.mediaFormat?.trim()) {
    facts.push({
      kind: "media-format",
      label: "Support",
      value: fields.mediaFormat.trim(),
    });
  }

  return facts;
}

export function mergeBarcodeSourceFacts(
  ...groups: Array<BarcodeSourceFact[] | undefined>
): BarcodeSourceFact[] | undefined {
  const seen = new Set<string>();
  const merged: BarcodeSourceFact[] = [];
  for (const group of groups) {
    for (const fact of group ?? []) {
      const key = `${fact.kind}:${fact.label}:${fact.value}`.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(fact);
    }
  }
  return merged.length > 0 ? merged : undefined;
}
