import type { MetadataFact } from "@/types/metadataProvider";

import { formatDbsReference } from "./printIdentity";
import type { DbsPrintDetail } from "./searchPrints";

export function dbsCgPrintFacts(
  row: DbsPrintDetail,
  providerId: string,
): MetadataFact[] {
  const facts: MetadataFact[] = [
    {
      kind: "format",
      label: "Numéro",
      value: formatDbsReference(row.setCode, row.number, row.grouping),
      source: providerId,
      confidence: 0.95,
      priority: 45,
    },
  ];

  if (row.setName) {
    facts.push({
      kind: "series",
      label: "Extension",
      value: row.setName,
      source: providerId,
      confidence: 0.9,
      priority: 36,
    });
  }

  if (row.rarity) {
    facts.push({
      kind: "category",
      label: "Rareté",
      value: row.rarity,
      source: providerId,
      confidence: 0.9,
      priority: 40,
    });
  }

  if (row.cardType) {
    facts.push({
      kind: "category",
      label: "Type",
      value: row.cardType,
      source: providerId,
      confidence: 0.9,
      priority: 26,
    });
  }

  if (row.color) {
    facts.push({
      kind: "category",
      label: "Couleur",
      value: row.color,
      source: providerId,
      confidence: 0.88,
      priority: 24,
    });
  }

  if (row.character) {
    facts.push({
      kind: "category",
      label: "Personnage",
      value: row.character,
      source: providerId,
      confidence: 0.88,
      priority: 22,
    });
  }

  if (row.power) {
    facts.push({
      kind: "category",
      label: "Puissance",
      value: row.power,
      source: providerId,
      confidence: 0.85,
      priority: 20,
    });
  }

  if (row.awakenedName) {
    facts.push({
      kind: "category",
      label: "Nom éveillé",
      value: row.awakenedName,
      source: providerId,
      confidence: 0.9,
      priority: 28,
    });
  }

  if (row.lang) {
    facts.push({
      kind: "category",
      label: "Langue",
      value: row.lang.toUpperCase(),
      source: providerId,
      confidence: 0.9,
      priority: 18,
    });
  }

  return facts;
}
