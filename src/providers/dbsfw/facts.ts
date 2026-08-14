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
