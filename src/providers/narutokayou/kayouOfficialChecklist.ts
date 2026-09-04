/**
 * Build Kayou checklist sets from kayouofficial.com catalog (Smriti series).
 * Ninja Age (`NRCCNA`) stays on `ninjaagebox` / `cc.*` via the existing enrich path.
 */
import type { KayouChecklist, KayouChecklistSet } from "./kayouLedgerTypes";
import {
  readKayouOfficialCatalog,
  type KayouOfficialCatalog,
} from "./kayouOfficialCrawl";
import {
  kayouOfficialIdToPrint,
  kayouOfficialSetLabel,
} from "./kayouOfficialId";

export function buildKayouOfficialChecklist(
  catalog: KayouOfficialCatalog | null = readKayouOfficialCatalog(),
): KayouChecklist | null {
  if (!catalog?.series?.length) return null;

  const bySet = new Map<string, KayouChecklistSet>();

  for (const series of catalog.series) {
    for (const card of series.cards) {
      const mapped = kayouOfficialIdToPrint(card.idCode);
      if (!mapped) continue;
      // Ninja Age already lives on narutocards / CCG as `cc.*`.
      if (mapped.setCode === "ninjaagebox") continue;

      let set = bySet.get(mapped.setCode);
      if (!set) {
        set = {
          slug: `kayouofficial-${mapped.setCode}`,
          code: mapped.setCode,
          label: kayouOfficialSetLabel(mapped.setCode),
          url: series.url ?? catalog.url ?? "https://www.kayouofficial.com/",
          cards: [],
        };
        bySet.set(mapped.setCode, set);
      }

      const name = card.name?.trim() || card.idCode;
      set.cards.push({
        printed: card.idCode,
        number: mapped.number,
        name,
        rarity: card.rarity?.trim() || null,
        faceUrl: card.frontImage?.trim() || null,
        faceSource: "kayouofficial",
      });
    }
  }

  const sets = [...bySet.values()]
    .map((set) => ({
      ...set,
      cards: set.cards.sort((a, b) => a.number.localeCompare(b.number)),
    }))
    .filter((set) => set.cards.length > 0)
    .sort((a, b) => a.code.localeCompare(b.code));

  if (!sets.length) return null;

  return {
    source: "kayouofficial.com",
    url: catalog.url ?? "https://www.kayouofficial.com/",
    sets,
  };
}
