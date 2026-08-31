/**
 * Node dump of Live card UV rect + card back (ADR-021 phase D).
 */

import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { dumpCardBackWebp } from "@/lib/unity/cardBack";
import { loadUvRectFromJson } from "@/lib/unity/cardCrop";
import { cardQuadFromApk, type CardQuadPayload } from "@/lib/unity/cardQuad";
import {
  foilPackDir,
  packCardsDir,
  packStagingDir,
} from "@/providers/shared/foilPaths";

export type DumpCardApkOpts = {
  repo: string;
  pack?: string;
};

export type DumpCardApkResult = {
  ok: boolean;
  cardQuad: CardQuadPayload | null;
  uvRectPath: string | null;
  cardBackPath: string | null;
  cardBackOk: boolean;
};

export async function dumpPokemonCardApk(
  opts: DumpCardApkOpts,
): Promise<DumpCardApkResult> {
  const pack = opts.pack ?? "pokemon";
  const apk = path.join(packStagingDir(opts.repo, pack), "apks", "base.apk");
  const foilDir = foilPackDir(opts.repo, pack);
  const cardsDir = packCardsDir(opts.repo, pack);
  mkdirSync(foilDir, { recursive: true });
  mkdirSync(cardsDir, { recursive: true });

  const quad = await cardQuadFromApk(apk);
  let uvRectPath: string | null = null;
  if (quad) {
    uvRectPath = path.join(foilDir, "card-uv-rect.json");
    writeFileSync(uvRectPath, `${JSON.stringify(quad, null, 2)}\n`, "utf8");
  }

  const cropRect = quad ? loadUvRectFromJson(quad) : null;
  const cardBackPath = path.join(cardsDir, "back.webp");
  const cardBackOk = await dumpCardBackWebp(apk, cardBackPath, cropRect);

  return {
    ok: quad != null,
    cardQuad: quad,
    uvRectPath,
    cardBackPath,
    cardBackOk,
  };
}
