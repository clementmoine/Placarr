/**
 * Naruto Mythos pack extract — Catalogue Sync / worker (in-process).
 *
 * STEPS (`--only` / `--skip` / `--offline`) : `seed` · `faces` · `products`.
 * `--titles-only` aliases `--skip faces`. Fine-grained `--skip-*` sources stay.
 */
import {
  catalogueArgList,
  selectCatalogueSteps,
} from "@/providers/shared/cardCatalogue/catalogueSteps";
import { runLocalTcgPipeline } from "@/providers/shared/cardCatalogue/localTcgLinePipeline";
import {
  harvestGgArchiveCards,
  harvestGgArchivePrices,
} from "@/providers/naruto/shared/gg/ggArchiveHarvest";

import { buildMythosFromLedgers } from "./pipeline/ledgers";
import {
  harvestMythosFaces,
  harvestMythosNarutomythosSite,
  harvestMythosNarutopia,
  harvestMythosScanflip,
  harvestOfficialMythosFaces,
  installMythosFaces,
  installMythosNarutomythosSiteFaces,
  installMythosNarutopiaFaces,
  installMythosScanflipFaces,
  installOfficialMythosFaces,
} from "./sources/faces";
import { ingestMythosSealedProducts } from "./sealed";
import { NARUTO_MYTHOS_PACK_ID, narutoMythosCuratedDir } from "./pack";

export const NARUTO_MYTHOS_STEPS = ["seed", "faces", "products"] as const;
export type NarutoMythosStep = (typeof NARUTO_MYTHOS_STEPS)[number];
const NARUTO_MYTHOS_ONLINE = new Set<NarutoMythosStep>(["faces"]);

export function selectNarutoMythosSteps(
  argv: readonly string[],
): NarutoMythosStep[] {
  return selectCatalogueSteps(withTitlesOnlyAlias(argv), NARUTO_MYTHOS_STEPS, {
    online: NARUTO_MYTHOS_ONLINE,
  });
}

function withTitlesOnlyAlias(argv: readonly string[]): readonly string[] {
  if (!argv.includes("--titles-only")) return argv;
  const skip = catalogueArgList(argv, "--skip");
  if (skip.includes("faces")) return argv.filter((t) => t !== "--titles-only");
  const next = argv.filter((t) => t !== "--titles-only");
  const idx = next.indexOf("--skip");
  if (idx >= 0 && next[idx + 1] && !next[idx + 1]!.startsWith("--")) {
    next[idx + 1] = `${next[idx + 1]},faces`;
    return next;
  }
  return [...next, "--skip", "faces"];
}

export async function runNarutoMythosPackPipeline(
  argv: readonly string[] = [],
): Promise<{ cards: number; products: number }> {
  const force = argv.includes("--force");
  const offline = argv.includes("--offline");
  const steps = selectNarutoMythosSteps(argv);
  console.log(
    `── Naruto Mythos — étapes : ${steps.join(" → ") || "(curated only)"}`,
  );

  const skipGg = argv.includes("--skip-gg");
  const skipOfficial = argv.includes("--skip-official");
  const skipLorenzone = argv.includes("--skip-lorenzone");
  const skipScanflip = argv.includes("--skip-scanflip");
  const skipNarutopia = argv.includes("--skip-narutopia");
  const skipNarutomythosSite = argv.includes("--skip-narutomythos-site");
  const wantFaces = steps.includes("faces");

  if (steps.includes("seed") && !skipGg) {
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

  if (wantFaces && !offline) {
    if (!skipOfficial) {
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
    if (!skipLorenzone) {
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
      let prints = 0;
      let titles = 0;
      if (steps.includes("seed")) {
        const built = buildMythosFromLedgers({ index });
        prints = built.prints;
        titles = built.titles;
        if (built.skipped.length) {
          console.log(
            `── Mythos — ${built.skipped.length} écartée(s) : ${built.skipped.join(", ")}`,
          );
        }
      }
      if (wantFaces) {
        if (!skipOfficial) {
          const faces = await installOfficialMythosFaces(index);
          console.log(
            `── Faces — official ${faces.faces}${faces.missing.length ? `, manquant(s) ${faces.missing.length}` : ""}`,
          );
        }
        if (!skipLorenzone) {
          const faces = await installMythosFaces(index);
          console.log(
            `── Faces — LorenZone ${faces.faces}${faces.missing.length ? `, manquant(s) ${faces.missing.length}` : ""}`,
          );
        }
        if (!skipNarutopia) {
          const faces = await installMythosNarutopiaFaces(index, { force });
          console.log(
            `── Faces — Narutopia ${faces.faces} (match ${faces.matched}, skip ${faces.skipped})`,
          );
        }
        if (!skipScanflip) {
          const faces = await installMythosScanflipFaces(index, { force });
          console.log(
            `── Faces — ScanFlip ${faces.faces} (match ${faces.matched}, mint ${faces.minted}, skip ${faces.skipped})`,
          );
        }
        if (!skipNarutomythosSite) {
          const faces = await installMythosNarutomythosSiteFaces(index, {
            force,
          });
          console.log(
            `── Faces — narutomythos.com ${faces.faces} (match ${faces.matched}, skip ${faces.skipped})`,
          );
        }
      }
      return { prints, titles };
    },
    seedProducts: steps.includes("products")
      ? async () => ingestMythosSealedProducts()
      : undefined,
  });
}
