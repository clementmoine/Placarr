import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { createLocalPrintsIndex } from "@/providers/shared/cardCatalogue/localPrintsIndex";
import { packCardDir } from "@/lib/packPaths";

import { NARUTO_CARDGAME_PACK_ID } from "../pack";
import { narutoCardgameCuratedDir } from "../curatedPaths";
import { narutoCardgameSourcePath } from "../syncedSources";
import { installNarutoCardgameWelcomeGallery } from "./fromWelcomeGallery";

describe("naruto cardgame welcome gallery", () => {
  it("ships a curated ledger of 12 SAMPLE characters", () => {
    const ledger = JSON.parse(
      readFileSync(
        narutoCardgameSourcePath("bandai-welcome-gallery.json"),
        "utf8",
      ),
    ) as { cards: { number: string; nameEn: string }[] };
    expect(ledger.cards).toHaveLength(12);
    expect(ledger.cards[0]).toMatchObject({
      number: "g01",
      nameEn: "Orochimaru",
    });
    expect(ledger.cards[11]).toMatchObject({
      number: "g12",
      nameEn: "Naruto Uzumaki",
    });
  });

  it("seeds prints and downloads Bandai EN+FR+JP faces", async () => {
    const index = createLocalPrintsIndex(NARUTO_CARDGAME_PACK_ID);
    const out = await installNarutoCardgameWelcomeGallery(index, {
      downloadFaces: true,
    });
    expect(out.prints).toBe(12);
    expect(out.titles).toBeGreaterThanOrEqual(36);
    // Resume Sync : faces déjà sur disque → downloaded=0, art toujours là.

    for (const lang of ["en", "fr", "ja"] as const) {
      const art = path.join(
        packCardDir(NARUTO_CARDGAME_PACK_ID, {
          set: "preview",
          lang,
          card: "g01",
        }),
        "art.bandai.webp",
      );
      expect(existsSync(art)).toBe(true);
    }

    const row = index.lookupRow("narutocardgame:preview-g01", {
      language: "en",
    });
    expect(row?.fullName).toBe("Orochimaru");
    expect(row?.rarity).toBe("SAMPLE");
    expect(row?.art).toBe("art.bandai.webp");

    const fr = index.lookupRow("narutocardgame:preview-g01", {
      language: "fr",
    });
    expect(fr?.art).toBe("art.bandai.webp");
  }, 120_000);
});
