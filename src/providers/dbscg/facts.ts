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

  /*
    Ce qui suit vient du dépôt Masters (`facts.json`), en anglais. Le catalogue
    tenait déjà nom, rareté, couleur, personnage et puissance ; il ne portait ni
    le texte de la carte, ni les traits, ni le statut tournoi.
  */
  const harvested = row.harvested;
  if (harvested?.traits.length) {
    facts.push({
      kind: "category",
      label: "Traits",
      value: harvested.traits.join(", "),
      source: providerId,
      confidence: 0.85,
      priority: 21,
    });
  }

  if (harvested?.era.length) {
    facts.push({
      kind: "series",
      label: "Ère",
      value: harvested.era.join(", "),
      source: providerId,
      confidence: 0.85,
      priority: 23,
    });
  }

  if (harvested?.keywords.length) {
    facts.push({
      kind: "category",
      label: "Mots-clés",
      value: harvested.keywords.join(", "),
      source: providerId,
      confidence: 0.85,
      priority: 19,
    });
  }

  if (harvested?.energyCost) {
    facts.push({
      kind: "category",
      label: "Coût en énergie",
      value: harvested.energyCost,
      source: providerId,
      confidence: 0.88,
      priority: 22,
    });
  }

  if (harvested?.comboPower) {
    facts.push({
      kind: "category",
      label: "Puissance de combo",
      value: harvested.comboPower,
      source: providerId,
      confidence: 0.85,
      priority: 17,
    });
  }

  if (harvested?.skill) {
    facts.push({
      kind: "description",
      label: "Texte",
      value: harvested.skill,
      source: providerId,
      confidence: 0.9,
      priority: 30,
    });
  }

  if (harvested?.back?.skill) {
    facts.push({
      kind: "description",
      label: "Texte du verso",
      value: harvested.back.skill,
      source: providerId,
      confidence: 0.9,
      priority: 29,
    });
  }

  if (harvested?.banned) {
    facts.push({
      kind: "category",
      label: "Statut tournoi",
      value: "Bannie",
      source: providerId,
      confidence: 0.85,
      priority: 34,
    });
  } else if (harvested?.limitedTo != null) {
    facts.push({
      kind: "category",
      label: "Statut tournoi",
      value: `Limitée à ${harvested.limitedTo}`,
      source: providerId,
      confidence: 0.85,
      priority: 34,
    });
  }

  if (harvested?.erratas.length) {
    facts.push({
      kind: "description",
      label: "Errata",
      value: harvested.erratas.join("\n"),
      source: providerId,
      confidence: 0.85,
      priority: 16,
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
