import type { FoilMaterial } from "@/core/render/foil/types";

import {
  LORCANA_MATERIAL_NAMES,
  lorcanaMaterial,
} from "./manifest";

/** Longest varnish suffixes first so ChromeRainbowHotFoil wins over RainbowHotFoil. */
const VARNISH_SUFFIXES = [
  "ChromeRainbowHotFoil",
  "RainbowHotFoil",
  "MetallicHotFoil",
  "MatteHotFoil",
  "SnowHotFoil",
  "HighGloss",
] as const;

function normalizeFinish(finish: string | null): string | null {
  if (!finish) return null;
  if (finish === "VertWave") return "VerticalWave";
  return finish;
}

function finishesMatch(
  parsed: string | null,
  requested: string,
): boolean {
  if (!parsed) return false;
  const p = normalizeFinish(parsed)!;
  const r = normalizeFinish(requested)!;
  return p.toLowerCase() === r.toLowerCase();
}

export function parseMaterialName(name: string): {
  finish: string | null;
  varnish: string | null;
} {
  let rest = name.replace(/^Card/, "").replace(/Material$/, "");

  let varnish: string | null = null;
  for (const suffix of VARNISH_SUFFIXES) {
    if (rest.endsWith(suffix)) {
      varnish = suffix;
      rest = rest.slice(0, -suffix.length);
      break;
    }
  }

  rest = rest.replace(/^Foil/, "").replace(/Foil$/, "");

  if (!rest || rest.startsWith("Varnish")) {
    return { finish: null, varnish };
  }

  const finish = normalizeFinish(rest);
  return { finish, varnish };
}

function scoreMaterial(
  parsed: { finish: string | null; varnish: string | null },
  requestedFinish: string,
  requestedVarnish: string | null | undefined,
): number {
  if (!parsed.finish) return -1;
  if (!finishesMatch(parsed.finish, requestedFinish)) return -1;

  if (requestedVarnish) {
    if (parsed.varnish === requestedVarnish) return 3;
    if (!parsed.varnish) return 1;
    return -1;
  }

  return parsed.varnish ? 1 : 2;
}

export function resolveMaterialName(
  finish: string,
  varnish: string | null | undefined,
): string | null {
  const normalized = finish.trim();
  if (
    !normalized ||
    normalized.toLowerCase() === "none" ||
    normalized.toLowerCase() === "plain"
  ) {
    return null;
  }

  let bestName: string | null = null;
  let bestScore = -1;

  for (const name of LORCANA_MATERIAL_NAMES) {
    const parsed = parseMaterialName(name);
    const score = scoreMaterial(parsed, finish, varnish);
    if (score > bestScore) {
      bestScore = score;
      bestName = name;
    }
  }

  return bestScore >= 0 ? bestName : null;
}

export function resolveMaterial(
  finish: string,
  varnish: string | null | undefined,
): FoilMaterial | null {
  const name = resolveMaterialName(finish, varnish);
  return name ? lorcanaMaterial(name) : null;
}
