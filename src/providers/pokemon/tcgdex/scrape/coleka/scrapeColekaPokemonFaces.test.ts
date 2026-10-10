/**
 * Coleka McDo staging purge once art.coleka is under cards/.
 */
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  colekaMcdoBranchContentHash,
  colekaMcdoBranchFacesComplete,
  promoteAndPurgeAllColekaMcdoStaging,
  promoteAndPurgeColekaMcdoStaging,
  type ColekaMcdoBranch,
} from "./scrapeColekaPokemonFaces";

let root = "";

beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), "coleka-mcdo-"));
});
afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

const branch: ColekaMcdoBranch = {
  id: "m23fr",
  setId: "2023sv",
  lang: "fr",
  label: "Promo 2023",
  listingPath: "/fr/x",
  listedCount: 2,
  scrape: true,
};

describe("coleka McDo staging purge", () => {
  it("content_hash_is_stable_for_ledger", () => {
    expect(colekaMcdoBranchContentHash(branch, "2026-09-04")).toContain(
      "m23fr|2023sv|fr|2",
    );
  });

  it("purges_staging_when_faces_complete_on_disk", () => {
    const cards = path.join(root, "cards");
    const staging = path.join(root, "staging", "coleka-mcdo-m23fr");
    mkdirSync(path.join(cards, "2023sv", "fr", "001"), { recursive: true });
    mkdirSync(path.join(cards, "2023sv", "fr", "002"), { recursive: true });
    writeFileSync(
      path.join(cards, "2023sv", "fr", "001", "art.coleka.webp"),
      "a",
    );
    writeFileSync(
      path.join(cards, "2023sv", "fr", "002", "art.coleka.webp"),
      "b",
    );
    mkdirSync(staging, { recursive: true });
    writeFileSync(path.join(staging, "001.webp"), "a");
    writeFileSync(path.join(staging, "listing-0.html"), "<html/>");

    expect(colekaMcdoBranchFacesComplete(branch, cards)).toBe(true);
    expect(
      promoteAndPurgeColekaMcdoStaging({
        branch,
        observed: "2026-09-04",
        stagingRoot: staging,
        cardsRoot: cards,
        packId: "pokemon",
      }),
    ).toBe(true);
    expect(existsSync(staging)).toBe(false);
  });

  it("keeps_staging_when_faces_incomplete", () => {
    const cards = path.join(root, "cards");
    const staging = path.join(root, "staging", "coleka-mcdo-m23fr");
    mkdirSync(path.join(cards, "2023sv", "fr", "001"), { recursive: true });
    writeFileSync(
      path.join(cards, "2023sv", "fr", "001", "art.coleka.webp"),
      "a",
    );
    mkdirSync(staging, { recursive: true });
    writeFileSync(path.join(staging, "001.webp"), "a");

    expect(colekaMcdoBranchFacesComplete(branch, cards)).toBe(false);
    expect(
      promoteAndPurgeColekaMcdoStaging({
        branch,
        observed: "2026-09-04",
        stagingRoot: staging,
        cardsRoot: cards,
      }),
    ).toBe(false);
    expect(existsSync(staging)).toBe(true);
  });

  it("purges_repo_staging_m23fr_m24fr_when_cards_complete", () => {
    const out = promoteAndPurgeAllColekaMcdoStaging();
    expect(out.purged).toEqual(expect.arrayContaining(["m23fr", "m24fr"]));
    expect(
      existsSync(
        path.join(process.cwd(), "data/pokemon/staging/coleka-mcdo-m23fr"),
      ),
    ).toBe(false);
    expect(
      existsSync(
        path.join(process.cwd(), "data/pokemon/staging/coleka-mcdo-m24fr"),
      ),
    ).toBe(false);
  });
});
