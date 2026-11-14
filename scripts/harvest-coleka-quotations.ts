/**
 * One-shot: Coleka premium quotations (`action=update`) for every staged
 * Carddass Coleka item id, merged into coleka-prices.json.
 *
 *   COLEKA_COOKIE='PHPSESSID=…; colekaID2=…' pnpm exec tsx scripts/harvest-coleka-quotations.ts
 */
import { readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import path from "node:path";

import { httpPost } from "@/lib/http/httpClient";
import {
  COLEKA_ORIGIN,
  parseColekaEuro,
} from "@/providers/shared/coleka/deals";
import {
  colekaEuroToCents,
  type ColekaPriceLedger,
  type ColekaPriceRow,
  writeColekaPriceLedger,
} from "@/providers/shared/coleka/dealsHarvest";
import { mintNarutoPrintKey } from "@/providers/naruto/narutocarddass/identity";
import {
  colekaCarddassPrefixToCollector,
  colekaEuPrefixToCollector,
  colekaRampagePrefixToCollector,
  colekaUsPromoRefToCollector,
} from "@/providers/naruto/narutocarddass/parse/coleka";
import { colekaCarddassPriceLedgerPath } from "@/providers/naruto/narutocarddass/harvest/colekaPrices";

const QUOTATION_URL = `${COLEKA_ORIGIN}/_scripts/js/quotation/ajax.php`;
const STAGING = path.join(process.cwd(), "data/naruto/carddass/staging");

type StagedCard = {
  colekaId: string;
  number: string;
  colekaRef?: string | null;
  name?: string | null;
  folder: string;
};

function resolvePrinted(folder: string, card: StagedCard): string | null {
  const ref = (card.colekaRef ?? "").trim();
  if (folder.includes("us-promos")) {
    return colekaUsPromoRefToCollector(ref || card.number);
  }
  if (folder.includes("rampage")) {
    return colekaRampagePrefixToCollector(ref || card.number);
  }
  if (
    folder.includes("s24") ||
    folder.includes("s28") ||
    folder.includes("sages") ||
    folder.includes("storm")
  ) {
    return colekaEuPrefixToCollector(ref || card.number);
  }
  // Carddass FR / S6 IT — disk ids are already ni#### / te####.
  if (/^(ni|te|ta|cl|ki|pr|n|j|m)\d/i.test(card.number)) {
    return card.number.toLowerCase();
  }
  return (
    colekaCarddassPrefixToCollector(ref) ??
    colekaEuPrefixToCollector(ref || card.number)
  );
}

function rubriqueGuess(folder: string): string {
  if (folder.includes("s24")) return "15466";
  if (folder.includes("s28")) return "16649";
  if (folder.includes("s6-it")) return "41388";
  if (folder.includes("rampage")) return "16963";
  if (folder.includes("us-promos")) return "38199";
  if (folder.includes("carddass-fr")) return "4108";
  return "";
}

function loadStagedCards(): StagedCard[] {
  const out: StagedCard[] = [];
  for (const name of readdirSync(STAGING)) {
    if (!name.startsWith("coleka-")) continue;
    const file = path.join(STAGING, name, "cards.json");
    if (!existsSync(file)) continue;
    const raw = JSON.parse(readFileSync(file, "utf8")) as {
      cards?: Array<Record<string, unknown>>;
    };
    for (const row of raw.cards ?? []) {
      const colekaId = String(row.colekaId ?? "").trim();
      const number = String(row.number ?? "").trim();
      if (!colekaId || !number) continue;
      out.push({
        colekaId,
        number,
        colekaRef: row.colekaRef != null ? String(row.colekaRef) : null,
        name: row.name != null ? String(row.name) : null,
        folder: name,
      });
    }
  }
  return out;
}

async function fetchQuotation(
  colekaId: string,
  cookie: string,
): Promise<{ euro: number | null; raw: string }> {
  const params = new URLSearchParams({ id: colekaId, action: "update" });
  const res = await httpPost<unknown>(QUOTATION_URL, params.toString(), {
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Origin: COLEKA_ORIGIN,
      Referer: `${COLEKA_ORIGIN}/fr/`,
      Cookie: cookie,
    },
    hostProfile: "scrape",
    validateStatus: (s) => s >= 200 && s < 500,
  });
  const raw =
    typeof res.data === "string" ? res.data : JSON.stringify(res.data ?? "");
  let parsed: { change?: unknown; price?: unknown } = {};
  try {
    parsed = JSON.parse(raw) as { change?: unknown; price?: unknown };
  } catch {
    return { euro: null, raw };
  }
  if (parsed.change !== true) return { euro: null, raw };
  return { euro: parseColekaEuro(parsed.price), raw };
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function main(): Promise<void> {
  const cookie = process.env.COLEKA_COOKIE?.trim();
  if (!cookie) {
    console.error("COLEKA_COOKIE required");
    process.exit(1);
  }
  const staged = loadStagedCards();
  console.log(`── ${staged.length} staged Coleka items`);

  const ledgerPath = colekaCarddassPriceLedgerPath();
  const ledger: ColekaPriceLedger = existsSync(ledgerPath)
    ? (JSON.parse(readFileSync(ledgerPath, "utf8")) as ColekaPriceLedger)
    : {
        source: "coleka.com quotation ajax (naruto/carddass)",
        sourceId: "coleka-deals",
        packId: "naruto/carddass",
        fetchedAt: new Date().toISOString(),
        rubriques: [],
        offerCount: 0,
        uniqueItems: 0,
        withQuotation: 0,
        withPrintKey: 0,
        cards: [],
      };

  const byId = new Map<string, ColekaPriceRow>();
  for (const row of ledger.cards) byId.set(row.colekaId, row);

  let fetched = 0;
  let filled = 0;
  let skippedZero = 0;
  let errors = 0;

  for (const card of staged) {
    fetched += 1;
    if (fetched % 50 === 0) {
      console.log(
        `… ${fetched}/${staged.length} (filled ${filled}, zero ${skippedZero}, err ${errors})`,
      );
    }
    try {
      const { euro } = await fetchQuotation(card.colekaId, cookie);
      await sleep(80);
      if (euro == null || euro <= 0) {
        skippedZero += 1;
        continue;
      }
      const printed = resolvePrinted(card.folder, card);
      const printKey = printed ? mintNarutoPrintKey(printed) : null;
      const prev = byId.get(card.colekaId);
      const next: ColekaPriceRow = {
        printKey: printKey ?? prev?.printKey ?? null,
        printed: printed ?? prev?.printed ?? null,
        colekaId: card.colekaId,
        rubriqueId: prev?.rubriqueId || rubriqueGuess(card.folder),
        refItem: card.colekaRef ?? prev?.refItem ?? null,
        title: card.name ?? prev?.title ?? null,
        quotationEuro: euro,
        quotationCents: colekaEuroToCents(euro),
        offerEuro: prev?.offerEuro ?? null,
        offerCents: prev?.offerCents ?? null,
        shippingEuro: prev?.shippingEuro ?? null,
        marketplace: prev?.marketplace ?? null,
        observedAt: new Date().toISOString(),
        affiliatePath: prev?.affiliatePath ?? null,
      };
      // Keep a better prior cote if somehow higher-confidence — prefer any positive.
      if (
        prev?.quotationCents != null &&
        prev.quotationCents > 0 &&
        next.quotationCents != null &&
        next.quotationCents === prev.quotationCents
      ) {
        // same
      }
      byId.set(card.colekaId, next);
      filled += 1;
    } catch (err) {
      errors += 1;
      if (errors < 5) {
        console.warn(
          `! ${card.colekaId}: ${err instanceof Error ? err.message : err}`,
        );
      }
      await sleep(250);
    }
  }

  const cards = [...byId.values()].sort((a, b) =>
    (a.printKey ?? a.printed ?? a.colekaId).localeCompare(
      b.printKey ?? b.printed ?? b.colekaId,
    ),
  );
  ledger.cards = cards;
  ledger.fetchedAt = new Date().toISOString();
  ledger.uniqueItems = cards.length;
  ledger.withQuotation = cards.filter((c) => c.quotationCents != null).length;
  ledger.withPrintKey = cards.filter((c) => c.printKey).length;
  ledger.offerCount = Math.max(ledger.offerCount, cards.length);
  ledger.source = `coleka.com deals+quotation ajax (naruto/carddass)`;

  const out = writeColekaPriceLedger(ledgerPath, ledger);
  console.log(
    `✓ quotation harvest — filled ${filled} / ${staged.length} (zero ${skippedZero}, err ${errors})`,
  );
  console.log(
    `  ledger ${ledger.withPrintKey} printKey / ${ledger.uniqueItems} items / cote ${ledger.withQuotation} → ${out}`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
