/**
 * TCG Cards products staging — durable logs + purge.
 */
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  packCatalogIngestLedgerPath,
  readCatalogIngestLedger,
  writeCatalogIngestLedger,
} from "@/providers/shared/catalogIngestLedger";

vi.mock("@/lib/packPaths", () => ({
  packLogsDir: (packId: string) => path.join(root, "data", packId, "logs"),
}));
vi.mock("@/lib/runtimeData", () => ({
  foilPackDataDir: (packId: string) => path.join(root, "data", packId),
}));
vi.mock("@/providers/shared/catalogIngestLedger", async () => {
  const actual = await vi.importActual<
    typeof import("@/providers/shared/catalogIngestLedger")
  >("@/providers/shared/catalogIngestLedger");
  return {
    ...actual,
    packCatalogIngestLedgerPath: (packId: string) =>
      path.join(root, "data", packId, "logs", "catalog-ingest-ledger.json"),
  };
});

import {
  promoteAndPurgeTcgCardsProductsStaging,
  resolveTcgCardsProductsDir,
  TCG_CARDS_PRODUCTS_MAX_AGE_MS,
  tcgCardsProductsArtefactId,
  tcgCardsProductsSkipCrawl,
} from "./productsStagingLifecycle";

let root = "";

beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), "tcgcards-prod-"));
});
afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("productsStagingLifecycle", () => {
  it("copies_json_to_logs_and_purges_staging", () => {
    const staging = path.join(
      root,
      "data",
      "pokemon",
      "staging",
      "pkmcards-products",
    );
    mkdirSync(path.join(staging, "pages"), { recursive: true });
    const body = JSON.stringify({
      meta: { productCount: 2, listingCount: 2, printsLinked: 4 },
      products: [{ slug: "a" }, { slug: "b" }],
    });
    writeFileSync(path.join(staging, "products.json"), body);
    writeFileSync(
      path.join(staging, "listings.json"),
      JSON.stringify({ products: [] }),
    );
    writeFileSync(path.join(staging, "pages", "x.html"), "<html/>");

    const out = promoteAndPurgeTcgCardsProductsStaging({
      packId: "pokemon",
      stagingFolder: "pkmcards-products",
      stagingDir: staging,
    });
    expect(out.purged).toBe(true);
    expect(existsSync(staging)).toBe(false);
    const durable = path.join(
      root,
      "data",
      "pokemon",
      "logs",
      "pkmcards-products",
      "products.json",
    );
    expect(existsSync(durable)).toBe(true);
    expect(readFileSync(durable, "utf8")).toBe(body);
    expect(resolveTcgCardsProductsDir("pokemon", "pkmcards-products")).toBe(
      path.dirname(durable),
    );
    const skip = tcgCardsProductsSkipCrawl({
      packId: "pokemon",
      stagingFolder: "pkmcards-products",
    });
    expect(skip.skip).toBe(true);
    expect(skip.meta?.productCount).toBe(2);
  });

  function promoteOne(): void {
    const staging = path.join(
      root,
      "data",
      "pokemon",
      "staging",
      "pkmcards-products",
    );
    mkdirSync(staging, { recursive: true });
    writeFileSync(
      path.join(staging, "products.json"),
      JSON.stringify({ meta: { productCount: 1 }, products: [{ slug: "a" }] }),
    );
    promoteAndPurgeTcgCardsProductsStaging({
      packId: "pokemon",
      stagingFolder: "pkmcards-products",
      stagingDir: staging,
    });
  }

  it("skips_crawl_when_freshly_promoted", () => {
    promoteOne();
    expect(
      tcgCardsProductsSkipCrawl({
        packId: "pokemon",
        stagingFolder: "pkmcards-products",
      }).skip,
    ).toBe(true);
  });

  it("re_crawls_when_promotedAt_older_than_ttl_even_if_hash_matches", () => {
    promoteOne();
    const ledgerPath = packCatalogIngestLedgerPath("pokemon");
    const ledger = readCatalogIngestLedger(ledgerPath);
    const id = tcgCardsProductsArtefactId("pokemon");
    ledger.entries[id]!.promotedAt = new Date(
      Date.now() - TCG_CARDS_PRODUCTS_MAX_AGE_MS - 60_000,
    ).toISOString();
    writeCatalogIngestLedger(ledgerPath, ledger);
    const out = tcgCardsProductsSkipCrawl({
      packId: "pokemon",
      stagingFolder: "pkmcards-products",
    });
    expect(out.skip).toBe(false);
    // Durable graph still resolvable for the crawl to diff against.
    expect(out.dir).not.toBeNull();
  });

  it("keepLedgerTimestamp_does_not_bump_promotedAt_on_skip_path", () => {
    promoteOne();
    const ledgerPath = packCatalogIngestLedgerPath("pokemon");
    const id = tcgCardsProductsArtefactId("pokemon");
    const ledger = readCatalogIngestLedger(ledgerPath);
    const old = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    ledger.entries[id]!.promotedAt = old;
    writeCatalogIngestLedger(ledgerPath, ledger);
    promoteAndPurgeTcgCardsProductsStaging({
      packId: "pokemon",
      stagingFolder: "pkmcards-products",
      keepLedgerTimestamp: true,
    });
    expect(readCatalogIngestLedger(ledgerPath).entries[id]!.promotedAt).toBe(old);
  });
});
