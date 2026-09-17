/**
 * Naruto Mythos pack extract — Catalogue Sync / worker (in-process).
 */
import { runLocalTcgPipeline } from "@/providers/shared/cardCatalogue/localTcgLinePipeline";
import {
  harvestGgArchiveCards,
  harvestGgArchivePrices,
} from "@/providers/shared/naruto/ggArchiveHarvest";

import { buildMythosFromLedgers } from "./buildFromLedgers";
import { harvestMythosFaces, installMythosFaces } from "./lorenzoneFaces";
import {
  harvestOfficialMythosFaces,
  installOfficialMythosFaces,
} from "./officialFaces";
import {
  harvestMythosScanflip,
  installMythosScanflipFaces,
} from "./scanflipFaces";
import {
  harvestMythosNarutopia,
  installMythosNarutopiaFaces,
} from "./narutopiaFaces";
import {
  harvestMythosNarutomythosSite,
  installMythosNarutomythosSiteFaces,
} from "./siteFaces";
import { ingestMythosSealedProducts } from "./sealedProducts";
import { NARUTO_MYTHOS_PACK_ID, narutoMythosCuratedDir } from "./pack";

export async function runNarutoMythosPackPipeline(
  argv: readonly string[] = [],
): Promise<{ cards: number; products: number }> {
  const force = argv.includes("--force");
  const skipFaces = argv.includes("--titles-only");
  const skipGg = argv.includes("--skip-gg");
  const skipOfficial = argv.includes("--skip-official");
  const skipLorenzone = argv.includes("--skip-lorenzone");
  const skipScanflip = argv.includes("--skip-scanflip");
  const skipNarutopia = argv.includes("--skip-narutopia");
  const skipNarutomythosSite = argv.includes("--skip-narutomythos-site");
  if (!skipGg) {
    try {
      const gg = await harvestGgArchiveCards({
        packId: NARUTO_MYTHOS_PACK_ID,
        line: "mythos",
      });
      console.log(`── narutocardgame.gg mythos — ${gg.cards} carte(s) indexées`);
      const prices = await harvestGgArchivePrices({
        packId: NARUTO_MYTHOS_PACK_ID,
        line: "mythos",
      });
      console.log(`── narutocardgame.gg mythos prices — ${prices.rows} ligne(s)`);
    } catch (err) {
      console.warn(
        `── narutocardgame.gg mythos — échec : ${err instanceof Error ? err.message : err}`,
      );
    }
  }
  if (!skipFaces && !skipOfficial) {
    try {
      const harvested = await harvestOfficialMythosFaces({ force });
      console.log(
        `── CICABOOM official — ${harvested.cards} carte(s), ${harvested.ok} WebP, ${harvested.skip} déjà là, ${harvested.fail} manqué${harvested.fail === 1 ? "" : "s"}`,
      );
    } catch (err) {
      console.warn(
        `── CICABOOM official — échec : ${err instanceof Error ? err.message : err}`,
      );
    }
  }
  if (!skipFaces && !skipLorenzone) {
    const harvested = await harvestMythosFaces({ force });
    console.log(
      `── LorenZone faces — ${harvested.ok} WebP, ${harvested.skip} déjà là, ${harvested.fail} manqué${harvested.fail === 1 ? "" : "s"}`,
    );
  }
  if (!skipNarutopia) {
    try {
      const nt = await harvestMythosNarutopia();
      console.log(`── Narutopia mythos S1 — ${nt.cards} carte(s) → ${nt.path}`);
    } catch (err) {
      console.warn(
        `── Narutopia mythos S1 — échec : ${err instanceof Error ? err.message : err}`,
      );
    }
  }
  if (!skipScanflip) {
    try {
      const sf = await harvestMythosScanflip();
      console.log(`── ScanFlip mythos — ${sf.cards} carte(s) → ${sf.path}`);
    } catch (err) {
      console.warn(
        `── ScanFlip mythos — échec : ${err instanceof Error ? err.message : err}`,
      );
    }
  }
  if (!skipNarutomythosSite) {
    try {
      const nm = await harvestMythosNarutomythosSite();
      console.log(
        `── narutomythos.com cards — ${nm.cards} carte(s) → ${nm.path}`,
      );
    } catch (err) {
      console.warn(
        `── narutomythos.com cards — échec : ${err instanceof Error ? err.message : err}`,
      );
    }
  }
  return runLocalTcgPipeline({
    packId: NARUTO_MYTHOS_PACK_ID,
    curatedDir: narutoMythosCuratedDir(),
    label: "Naruto Mythos",
    writeLocaleSpecificFacesFromIndex: {
      catalogueLocales: ["fr", "en"],
      note: "Mythos FR/EN portent le texte localisé — ne pas emprunter le recto cross-langue.",
    },
    seed: async (index) => {
      const built = buildMythosFromLedgers({ index });
      if (built.skipped.length) {
        console.log(
          `── Mythos — ${built.skipped.length} écartée(s) : ${built.skipped.join(", ")}`,
        );
      }
      if (!skipFaces && !skipOfficial) {
        const faces = await installOfficialMythosFaces(index);
        console.log(
          `── Faces — official ${faces.faces}${faces.missing.length ? `, manquant(s) ${faces.missing.length}` : ""}`,
        );
      }
      if (!skipFaces && !skipLorenzone) {
        const faces = await installMythosFaces(index);
        console.log(
          `── Faces — LorenZone ${faces.faces}${faces.missing.length ? `, manquant(s) ${faces.missing.length}` : ""}`,
        );
      }
      if (!skipFaces && !skipNarutopia) {
        const faces = await installMythosNarutopiaFaces(index, { force });
        console.log(
          `── Faces — Narutopia ${faces.faces} (match ${faces.matched}, skip ${faces.skipped})`,
        );
      }
      if (!skipFaces && !skipScanflip) {
        const faces = await installMythosScanflipFaces(index, { force });
        console.log(
          `── Faces — ScanFlip ${faces.faces} (match ${faces.matched}, mint ${faces.minted}, skip ${faces.skipped})`,
        );
      }
      if (!skipFaces && !skipNarutomythosSite) {
        const faces = await installMythosNarutomythosSiteFaces(index, { force });
        console.log(
          `── Faces — narutomythos.com ${faces.faces} (match ${faces.matched}, skip ${faces.skipped})`,
        );
      }
      return { prints: built.prints, titles: built.titles };
    },
    seedProducts: async () => ingestMythosSealedProducts(),
  });
}
