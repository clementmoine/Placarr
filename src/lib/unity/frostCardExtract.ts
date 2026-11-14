/**
 * Translate every distinct EffectsLayer-count Frost/Card Metal fragment.
 * Mac-only extract path — pulls unityfs / metalToGlsl.
 */
import { variantKey } from "@/lib/unity/lorcanaShader";
import { metalSourcesFromBlob } from "@/lib/unity/metalBlob";
import { translateMetalSource } from "@/lib/unity/metalToGlsl";
import { toWebgl2Fragment } from "@/core/render/unity/webglFragment";
import { adaptClientFragment } from "@/lib/unity/webglAdapt";
import {
  FROST_EFFECTS_LAYER_COUNT_NAMES,
  frostEffectsLayerMax,
} from "@/lib/unity/frostCardVariants";

function scoreVariant(source: string, wantMax: number): number {
  const max = frostEffectsLayerMax(source);
  if (max !== wantMax) return -1;
  let score = source.length;
  if (wantMax === 0 && /HoloMap|_HoloMask|_FoilMask/.test(source)) {
    score += 1_000_000_000;
  }
  if (wantMax > 0 && /_EffectsLayer1Tex\b/.test(source)) {
    score += 1_000_000_000;
  }
  if (/_FrontTex|_FrameTex|_CharaTex/.test(source)) score += 100_000;
  return score;
}

export type FrostCardVariantFile = {
  /** Basename under `foil/shaders/`, e.g. `FrostCard__ARTWORK_ON__EFFECTS_LAYER_COUNT_FIVE.frag`. */
  fileName: string;
  /** Keyword key (empty for legacy `FrostCard.frag`). */
  key: string;
  countKeyword: string;
  glsl: string;
};

/**
 * Translate every distinct EffectsLayer-count Frost/Card fragment.
 * Always includes legacy `FrostCard.frag` = best ZERO/holo variant.
 */
export function extractFrostCardVariantFiles(
  metalBlob: Uint8Array,
): FrostCardVariantFile[] {
  const fragments = metalSourcesFromBlob(metalBlob).filter(
    (p) => p.stage === "fragment",
  );
  if (fragments.length === 0) return [];

  const byCount = new Map<number, string>();
  for (let want = 0; want <= 6; want += 1) {
    let best: string | null = null;
    let bestScore = -1;
    for (const frag of fragments) {
      const score = scoreVariant(frag.source, want);
      if (score > bestScore) {
        bestScore = score;
        best = frag.source;
      }
    }
    if (best && bestScore >= 0) byCount.set(want, best);
  }

  const out: FrostCardVariantFile[] = [];
  for (const [want, metal] of [...byCount.entries()].sort(
    (a, b) => a[0] - b[0],
  )) {
    const translated = translateMetalSource(metal);
    if (!translated?.glsl || translated.stage !== "fragment") continue;
    const wrapped = `#ifdef FRAGMENT\n${translated.glsl}\n#endif\n`;
    const glsl = adaptClientFragment(
      toWebgl2Fragment(wrapped, { stripControlChars: true }),
    );
    const countKeyword = `EFFECTS_LAYER_COUNT_${FROST_EFFECTS_LAYER_COUNT_NAMES[want]!}`;
    const keywords = ["ARTWORK_ON", countKeyword];
    const key = variantKey(keywords);
    const fileName = want === 0 ? "FrostCard.frag" : `FrostCard__${key}.frag`;
    out.push({ fileName, key: want === 0 ? "" : key, countKeyword, glsl });
    if (want === 0) {
      out.push({
        fileName: `FrostCard__${key}.frag`,
        key,
        countKeyword,
        glsl,
      });
    }
  }
  return out;
}
