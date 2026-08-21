import type { MetadataFact } from "@/types/metadataProvider";

import { formatDbsFwReference } from "./printIdentity";
import type { DbsFwPrintDetail } from "./searchPrints";

export function dbsFwPrintFacts(
  row: DbsFwPrintDetail,
  providerId: string,
): MetadataFact[] {
  const facts: MetadataFact[] = [
    {
      kind: "format",
      label: "Numéro",
      value: formatDbsFwReference(row.setCode, row.number, row.grouping),
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

  /*
    Tout ce qui suit vient de la fiche détaillée (`facts.json`). La liste de
    cartes, seule source du pack jusqu'ici, ne donnait qu'un numéro, un nom et
    une image : 3 962 tirages sans une seule rareté.
  */
  const harvested = row.harvested;
  if (harvested?.rarity) {
    facts.push({
      kind: "category",
      label: "Rareté",
      value: harvested.rarity,
      source: providerId,
      confidence: 0.9,
      priority: 40,
    });
  }

  if (harvested?.cardType) {
    facts.push({
      kind: "category",
      label: "Type",
      value: harvested.cardType,
      source: providerId,
      confidence: 0.9,
      priority: 26,
    });
  }

  if (harvested?.color) {
    facts.push({
      kind: "category",
      label: "Couleur",
      value: harvested.color,
      source: providerId,
      confidence: 0.88,
      priority: 24,
    });
  }

  if (harvested?.cost) {
    facts.push({
      kind: "category",
      label: "Coût",
      value: harvested.cost,
      source: providerId,
      confidence: 0.88,
      priority: 22,
    });
  }

  if (harvested?.power.length) {
    facts.push({
      kind: "category",
      label: "Puissance",
      // Un Leader a deux faces, donc deux puissances : recto puis verso.
      value: harvested.power.join(" / "),
      source: providerId,
      confidence: 0.85,
      priority: 20,
    });
  }

  if (harvested?.comboPower) {
    facts.push({
      kind: "category",
      label: "Puissance de combo",
      value: harvested.comboPower,
      source: providerId,
      confidence: 0.85,
      priority: 19,
    });
  }

  if (harvested?.specialTraits.length) {
    facts.push({
      kind: "category",
      label: "Traits",
      value: harvested.specialTraits.join(", "),
      source: providerId,
      confidence: 0.85,
      priority: 21,
    });
  }

  if (harvested?.skills.length) {
    facts.push({
      kind: "description",
      label: "Texte",
      value: harvested.skills.join("\n"),
      source: providerId,
      confidence: 0.9,
      priority: 30,
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
