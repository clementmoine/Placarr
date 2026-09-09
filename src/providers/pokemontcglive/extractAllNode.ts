/**
 * Full Node Unity extract for TCG Live (ADR-021) — replaces legacy UnityPy
 * ``extract.py``.
 */

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import {
  foilPackDir,
} from "@/providers/shared/foilPaths";
import {
  buildKeyedCards,
  writeFoilManifestDump,
  writeRuntimeCards,
} from "@/providers/pokemontcglive/buildRuntimeCards";
import { dumpPokemonCardApk } from "@/providers/pokemontcglive/dumpCardApk";
import { extractCardsNode } from "@/providers/pokemontcglive/extractCardsNode";
import { extractShadersBundle } from "@/providers/pokemontcglive/extractShadersBundle";
import { writeMaterialSheets } from "@/providers/pokemontcglive/writeMaterialSheets";
import { pokemonShadersDumpFresh } from "@/providers/pokemontcglive/shadersDumpFresh";
import type { TextureMode } from "@/providers/pokemontcglive/extractCardTextures";

export type ExtractAllNodeOpts = {
  repo: string;
  bundlesDir: string;
  textureMode?: TextureMode;
  limitCards?: number;
  extractWorkers?: number;
};

export type ExtractAllNodeReport = {
  shaders: Record<string, unknown>;
  cardBundlesProcessed: number;
  cardBundlesSkipped: number;
  manifestRows: number;
  keyedBundles: number;
  extractErrors: number;
  textureMode: string;
  workers: number;
  packDir: string;
  runtimeCards: string | null;
  cardQuad: unknown;
  nodeExtract: true;
};

export async function extractAllNode(
  opts: ExtractAllNodeOpts,
): Promise<ExtractAllNodeReport> {
  const textureMode = opts.textureMode ?? "cards";
  const packDir = foilPackDir(opts.repo, "pokemon");
  mkdirSync(packDir, { recursive: true });

  const { installFullFoilMask } = await import(
    "@/providers/shared/cardCatalogue/curatedAssets"
  );
  const mask = await installFullFoilMask("pokemon");
  if (mask.installed) {
    console.log(`  full foil mask → ${mask.dest}`);
  }

  let cardQuad: unknown = null;
  console.log("── extract card UV rect + back (Node, ADR-021 D)");
  const apkResult = await dumpPokemonCardApk({ repo: opts.repo });
  console.log(
    `  cardQuad ok=${Boolean(apkResult.ok)} back=${Boolean(apkResult.cardBackOk)} → ${apkResult.uvRectPath ?? "?"}`,
  );
  cardQuad = apkResult.cardQuad;

  const shadersBundle = path.join(opts.bundlesDir, "shadersbundle");
  let shaderReport: Record<string, unknown> = {};
  if (pathExists(shadersBundle)) {
    if (pokemonShadersDumpFresh(packDir, shadersBundle)) {
      console.log(
        "── shaders + material sheets already newer than shadersbundle — skip",
      );
      shaderReport = { skipped: true, reason: "artifacts-fresh" };
    } else {
      console.log("── extract shaders + shared textures (Node, ADR-021 C)");
      const shaderResult = await extractShadersBundle({
        shadersBundlePath: shadersBundle,
        packDir,
      });
      shaderReport = {
        shadersWritten: shaderResult.shadersWritten,
        foilNames: shaderResult.foilNames,
        sharedTextures: shaderResult.sharedTextures,
      };
      console.log(
        `  shaders done — frags=${shaderResult.shadersWritten.length} sharedTex=${shaderResult.sharedTextures}`,
      );

      console.log("── material sheets (Node)");
      const sheets = writeMaterialSheets(opts.repo, shadersBundle);
      console.log(
        `  material sheets → ${sheets.materialSheetsPath} + ${path.basename(sheets.sharedMotifsPath)}`,
      );

      if (Object.keys(shaderResult.textureFlags).length > 0) {
        writeFileSync(
          path.join(packDir, "textureFlags.json"),
          `${JSON.stringify(shaderResult.textureFlags, null, 1)}\n`,
          "utf8",
        );
      }
    }
  }

  console.log(`── extract card textures (Node, ADR-021 B) mode=${textureMode}`);
  const cardsResult = await extractCardsNode({
    repo: opts.repo,
    bundlesDir: opts.bundlesDir,
    textureMode,
    limitCards: opts.limitCards,
  });
  console.log(
    `  cards done — bundles=${cardsResult.bundles} written=${cardsResult.written} skipped=${cardsResult.skipped} errors=${cardsResult.errors}`,
  );

  const foilManifestPath = writeFoilManifestDump(opts.repo, cardsResult.rows);
  const runtimeCards = writeRuntimeCards(opts.repo, cardsResult.rows);
  console.log(
    `  runtime cards → ${runtimeCards} (${Object.keys(buildKeyedCards(cardsResult.rows)).length} bundles)`,
  );

  const workers = Math.max(1, opts.extractWorkers ?? 1);
  const meta: ExtractAllNodeReport = {
    shaders: shaderReport,
    cardBundlesProcessed: cardsResult.bundles,
    cardBundlesSkipped: cardsResult.skipped,
    manifestRows: cardsResult.rows.length,
    keyedBundles: Object.keys(buildKeyedCards(cardsResult.rows)).length,
    extractErrors: cardsResult.errors,
    textureMode,
    workers,
    packDir,
    runtimeCards,
    cardQuad,
    nodeExtract: true,
  };

  writeFileSync(
    path.join(packDir, "extract-report.json"),
    `${JSON.stringify({ ...meta, foilManifestPath }, null, 2)}\n`,
    "utf8",
  );

  return meta;
}

function pathExists(p: string): boolean {
  return existsSync(p);
}
