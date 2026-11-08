/**
 * Write one accepted shelf promote into a LocalPrintsIndex corpus.
 * Pack-agnostic — callers supply packId + expected printGame.
 */
import { parsePrintKey } from "@/core/identify/printKey";
import { createLocalPrintsIndex } from "@/providers/shared/cardCatalogue/localPrintsIndex";

export type ApplyCorpusPromotePrintInput = {
  packId: string;
  /** PrintKey game segment this corpus owns (`leclerc`, `lorcana`, …). */
  printGame: string;
  printKey: string;
  title?: string | null;
  language?: string | null;
};

export type ApplyCorpusPromotePrintResult =
  | { written: true; printKey: string }
  | { written: false; reason: string };

export function applyCorpusPromotePrint(
  input: ApplyCorpusPromotePrintInput,
): ApplyCorpusPromotePrintResult {
  const printKey = input.printKey.trim().toLowerCase();
  if (!printKey) {
    return { written: false, reason: "printKey required" };
  }
  const parsed = parsePrintKey(printKey);
  if (!parsed) {
    return { written: false, reason: `unparseable printKey: ${printKey}` };
  }
  const game = input.printGame.trim().toLowerCase();
  if (!game || parsed.game !== game) {
    return {
      written: false,
      reason: `printKey game ${parsed.game} ≠ corpus ${game || "(empty)"}`,
    };
  }

  const lang = (input.language?.trim() || "fr").toLowerCase();
  const fullName =
    input.title?.trim() ||
    `${parsed.set.toUpperCase()}-${parsed.number.toUpperCase()}`;

  const index = createLocalPrintsIndex(input.packId);
  index.writePrints([
    {
      printKey,
      setCode: parsed.set,
      number: parsed.number,
      cardType: "card",
      grouping: parsed.grouping,
      titles: [{ lang, fullName }],
    },
  ]);

  return { written: true, printKey };
}
