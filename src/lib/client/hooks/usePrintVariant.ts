"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";

import { resolveStoredVariant } from "@/core/enrich/variants";
import { getEffectPack } from "@/core/render/foil";
import {
  peekPrintVariant,
  requestPrintVariant,
  subscribeToPrintVariants,
} from "@/lib/client/printVariantStore";
import {
  holoShader,
  isHoloShaderId,
  varnishShader,
  type HoloShader,
} from "@/core/render/holoShaders";
import "@/effects";

/** What the provider says a printing exists as. Shape mirrors `PrintCandidate`. */
export type PrintVariantInfo = {
  finishes?: string[];
  plainFinishes?: string[];
  /** Effect pack id from `src/effects/<id>`. See `PrintCandidate.effectPack`. */
  effectPack?: string | null;
  /** Finish -> shader id. See `PrintCandidate.finishShaders`. */
  finishShaders?: Record<string, string>;
  /** Foil mask per catalogue finish. See `PrintCandidate.finishFoilMaskUrls`. */
  finishFoilMaskUrls?: Record<string, string>;
  /** Varnish name -> shader id, and which varnish this print carries. */
  varnishShaders?: Record<string, string>;
  varnishType?: string | null;
  /** Hue the stamped coat throws. See `PrintCandidate.varnishColor`. */
  varnishColor?: string | null;
  /** A second stamped coat. See `PrintCandidate.secondVarnishMaskUrl`. */
  secondVarnishMaskUrl?: string | null;
  secondVarnishColor?: string | null;
  variantImageUrls?: Record<string, string>;
  foilMaskUrl?: string | null;
  varnishMaskUrl?: string | null;
  /** Print-specific back / alt face when the catalogue supplies one. */
  cardBackUrl?: string | null;
  /** Set code for set-scoped pack backs. */
  setCode?: string | null;
  /**
   * Quarters of a turn for faces that share the shelf format but sit on their
   * side (Pokémon BREAK → 1). Omit / 0 = upright.
   */
  faceQuarterTurns?: 0 | 1 | 2 | 3;
};

/**
 * Ask the provider what this printing exists as.
 *
 * Asked live rather than read from storage: `Metadata.facts` is rebuilt from
 * field evidence after every store, so a persisted copy both has to survive two
 * allow-lists and drifts when a set is corrected. The provider's index is held
 * in memory server-side, so the answer is cheap.
 *
 * Every caller shares one store, so a page of cards costs one request per media
 * type rather than one per card — see `printVariantStore`. That is why this can
 * be called from a tile: it used to be too expensive to, which is how five
 * lists of cards ended up drawing foils as plain.
 */
export function usePrintVariant(
  printKey: string | null | undefined,
  shelfType: string | null | undefined,
): PrintVariantInfo | null {
  const snapshot = useCallback(
    () => peekPrintVariant(printKey, shelfType),
    [printKey, shelfType],
  );
  const info = useSyncExternalStore(
    subscribeToPrintVariants,
    snapshot,
    // Nothing is known during the server render, and a card with no effect is
    // the honest placeholder for one whose effect is not resolved yet.
    () => null,
  );

  useEffect(() => {
    requestPrintVariant(printKey, shelfType);
  }, [printKey, shelfType]);

  return info;
}

export type VariantRendering = {
  /** Artwork to show: the variant's own file when the provider has one. */
  imageUrl: string | null;
  /** Masks to composite, empty when this copy carries no effect. */
  foilMaskUrl: string | null;
  varnishMaskUrl: string | null;
  /**
   * How to draw it (CSS). Null when the pack has no web recipe — WebGL may
   * still run via {@link effectPackId} + finish. Never invent a pack default
   * here; that belongs in `pack.resolveCss`.
   */
  shader: HoloShader | null;
  /** How to draw the varnish coat. Null when the pack has no CSS varnish. */
  varnish: HoloShader | null;
  /** The hue that coat throws, when the provider knows it. */
  varnishColor: string | null;
  /** The second coat, on the prints that carry two. */
  secondVarnishMaskUrl: string | null;
  secondVarnishColor: string | null;
  /** Effect pack for WebGL foil *and* card-back resolve. Kept on plain finishes
   * so the pack default back still applies; null only when unknown. */
  effectPackId: string | null;
  /** Catalogue finish name for this copy. Null when plain or unknown. */
  finish: string | null;
  /** Catalogue varnish type for this copy. Null when plain or absent. */
  varnishType: string | null;
};

/**
 * How a copy should be drawn, given its variant.
 *
 * A plain finish gets nothing — the point of a foil effect is that it separates
 * a foil copy from a normal one, so shimmering on both would say nothing. An
 * unrecognized variant is treated as plain rather than guessed at.
 *
 * CSS looks come only from `pack.resolveCss`. Provider `finishShaders` may hold
 * Unity material names (Pokémon) and must not feed the CSS path.
 */
export function variantRendering(
  variant: string | null | undefined,
  info: PrintVariantInfo | null,
  fallbackImageUrl: string | null,
): VariantRendering {
  const plain = {
    imageUrl: fallbackImageUrl,
    foilMaskUrl: null,
    varnishMaskUrl: null,
    shader: null,
    varnish: null,
    varnishColor: null,
    secondVarnishMaskUrl: null,
    secondVarnishColor: null,
    effectPackId: null,
    finish: null,
    varnishType: null,
  };
  if (!info) return plain;

  const packId = info.effectPack ?? null;
  const resolved = resolveStoredVariant(variant, info.finishes);
  // Keep pack id even without a finish: backs (flip / skeleton) resolve from
  // the pack; foil layers stay null until a finish is known.
  if (!resolved) {
    return {
      ...plain,
      effectPackId: packId,
      varnishType: info.varnishType ?? null,
    };
  }

  const isPlainFinish = (info.plainFinishes ?? []).some(
    (finish) => finish.toLowerCase() === resolved.toLowerCase(),
  );
  // Plain finish: no foil layers, but keep the pack id so the card back
  // (pack default / set / print) still resolves for flip + skeleton.
  if (isPlainFinish) {
    return {
      ...plain,
      effectPackId: packId,
      finish: resolved,
      varnishType: info.varnishType ?? null,
    };
  }

  const pack = getEffectPack(info.effectPack);
  const css = pack?.resolveCss(resolved, info.varnishType) ?? null;
  // Prefer pack.resolveCss. If the pack id is missing (stale session cache,
  // partial candidate), accept provider finishShaders / varnishShaders only
  // when they are real CSS look ids — never Unity material names (Pokémon).
  const finishShaderId =
    css?.finishShaderId ??
    (isHoloShaderId(info.finishShaders?.[resolved])
      ? info.finishShaders![resolved]
      : null);
  const varnishShaderId =
    css?.varnishShaderId ??
    (info.varnishType && isHoloShaderId(info.varnishShaders?.[info.varnishType])
      ? info.varnishShaders![info.varnishType]
      : null);

  return {
    imageUrl: info.variantImageUrls?.[resolved] ?? fallbackImageUrl,
    foilMaskUrl:
      info.finishFoilMaskUrls?.[resolved] ?? info.foilMaskUrl ?? null,
    varnishMaskUrl: info.varnishMaskUrl ?? null,
    shader: holoShader(finishShaderId),
    varnish: varnishShader(varnishShaderId),
    varnishColor: info.varnishColor ?? null,
    secondVarnishMaskUrl: info.secondVarnishMaskUrl ?? null,
    secondVarnishColor: info.secondVarnishColor ?? null,
    effectPackId: info.effectPack ?? null,
    finish: resolved,
    varnishType: info.varnishType ?? null,
  };
}
