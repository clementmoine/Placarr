/**
 * Kayou HR / MR / PR : certains tirages sont des cartes **paysage** que narutocards.ca
 * sert en scan portrait pivoté (ex. NRZ08-HR-001 ≈ 186×264, NRZ07-PR-060 ≈ 216×304).
 * lenticulaires classiques (320×450, deux faces empilées) restent portrait.
 */
import { readFileSync, writeFileSync } from "node:fs";

import { isCardsIndexV1, type CardsIndexV1 } from "@/effects/cardsIndex";
import { packCardsIndexPath } from "@/lib/packPaths";
import { resetCardsIndexOrientationCache } from "@/providers/shared/cardCatalogue/cardsIndexOrientation";

import { NARUTO_KAYOU_PACK_ID } from "./pack";

/** `nrz08.hr.001` / `nr.hr.121` / `nr.ss.hr.011` — rarity token before the number. */
export function kayouCardNumberIsCompactPivotRarity(cardNumber: string): boolean {
  const parts = cardNumber.trim().toLowerCase().split(".");
  if (parts.length < 2) return false;
  const tier = parts[parts.length - 2] ?? "";
  return tier === "hr" || tier === "mr" || tier === "pr";
}

/** @deprecated use kayouCardNumberIsCompactPivotRarity */
export function kayouCardNumberIsHrOrMr(cardNumber: string): boolean {
  return kayouCardNumberIsCompactPivotRarity(cardNumber);
}

/** `cc.*` or ledger `nr.cc.*` — Ninja Age Box wave. */
export function kayouCardNumberIsCcSeries(cardNumber: string): boolean {
  const parts = cardNumber.trim().toLowerCase().split(".");
  if (parts[0] === "cc") return true;
  return parts[0] === "nr" && parts[1] === "cc";
}

/** Tier token after `cc` (`cc.r.001` / `nr.cc.sr.024` / `nr.cc.mr.001s`). */
function kayouCcSeriesTier(cardNumber: string): string | null {
  const parts = cardNumber.trim().toLowerCase().split(".");
  if (parts[0] === "cc") return parts[1] ?? null;
  if (parts[0] === "nr" && parts[1] === "cc") return parts[2] ?? null;
  return null;
}

/**
 * Ninja Age story / wedding panels — portrait scan of a landscape card.
 * `r` / `sr` + wedding `mr.*s` (not character `mr.001`–`005`, ptr/qr/sp/ur…).
 */
export function kayouCardNumberIsCcRotatedLandscapeWave(cardNumber: string): boolean {
  const tier = kayouCcSeriesTier(cardNumber);
  if (tier === "r" || tier === "sr") return true;
  // Wedding MRs (`cc.mr.001s`) are landscape pivots; Akatsuki MRs stay portrait.
  if (tier === "mr") {
    const parts = cardNumber.trim().toLowerCase().split(".");
    return /s$/i.test(parts[parts.length - 1] ?? "");
  }
  return false;
}

const KAYOU_CC_WAVE_MIN_W = 250;
const KAYOU_CC_WAVE_MAX_W = 270;
const KAYOU_CC_WAVE_MIN_H = 350;
const KAYOU_CC_WAVE_MAX_H = 380;

function kayouScanIsCcWaveRotatedLandscape(
  width: number,
  height: number,
  cardNumber: string,
): boolean {
  if (!kayouCardNumberIsCcRotatedLandscapeWave(cardNumber)) return false;
  return (
    width >= KAYOU_CC_WAVE_MIN_W &&
    width <= KAYOU_CC_WAVE_MAX_W &&
    height >= KAYOU_CC_WAVE_MIN_H &&
    height <= KAYOU_CC_WAVE_MAX_H
  );
}

/** Set-prefixed wave promo pivots (`nrz07.pr.060`), not catalogue `nr.pr.*`. */
function kayouCardNumberIsWavePrPivot(cardNumber: string): boolean {
  const parts = cardNumber.trim().toLowerCase().split(".");
  if (parts.length < 3) return false;
  return /^nrz\d{2}$/.test(parts[0]!) && parts[1] === "pr";
}

/**
 * Catalogue `nr.pr.*` CDN scans (~400×560) attested as portrait-of-landscape
 * pivots (characters sideways in the file). Compact CapsuleCorp (~257×361)
 * and other CDN promos (055–057, 059, 071–072…) stay upright.
 */
const KAYOU_CDN_LANDSCAPE_PROMO_NUMBERS: ReadonlySet<number> = new Set([
  58, 60, 61, 62, 68, 69, 70,
]);

function kayouCataloguePrCollectorNumber(cardNumber: string): number | null {
  const parts = cardNumber.trim().toLowerCase().split(".");
  if (parts.length < 3 || parts[0] !== "nr" || parts[1] !== "pr") return null;
  const n = Number.parseInt(parts[2]!, 10);
  return Number.isFinite(n) ? n : null;
}

function kayouScanIsCataloguePrRotatedLandscape(
  width: number,
  height: number,
  cardNumber: string,
): boolean {
  const num = kayouCataloguePrCollectorNumber(cardNumber);
  if (num == null || !KAYOU_CDN_LANDSCAPE_PROMO_NUMBERS.has(num)) return false;
  return (
    width >= 380 &&
    width <= 420 &&
    height >= 540 &&
    height <= 590
  );
}

/** Episode / comic panel titles end with a part number (`… 1`, `… 5`),
 * or CapsuleCorp stubs that only have the short rarity-number (`R-111`). */
export function kayouNameLooksLikeStoryPanel(
  name: string | null | undefined,
): boolean {
  const n = name?.trim() ?? "";
  if (!n) return false;
  if (/\s\d+\s*$/.test(n)) return true;
  return /^(R|SR)-\d+$/i.test(n);
}

/** Story-wave rarities that carry multi-part episode panels. */
function kayouCardNumberIsStoryPanelTier(cardNumber: string): boolean {
  const parts = cardNumber.trim().toLowerCase().split(".");
  if (parts.length < 2) return false;
  const tier = parts[parts.length - 2] ?? "";
  return tier === "r" || tier === "sr";
}

/**
 * CapsuleCorp / CDN portrait scans of landscape story panels
 * (t2w7 `nr.r.161` ≈ 400×568; Ninja Age `cc.r` handled separately).
 */
function kayouScanIsStoryPanelRotatedLandscape(
  width: number,
  height: number,
  cardNumber: string,
  name: string | null | undefined,
): boolean {
  if (!kayouNameLooksLikeStoryPanel(name)) return false;
  if (!kayouCardNumberIsStoryPanelTier(cardNumber)) return false;
  if (kayouCardNumberIsCcSeries(cardNumber)) return false;
  return (
    width >= 250 &&
    width <= 420 &&
    height >= 350 &&
    height <= 590
  );
}

/**
 * Portrait scan that should display as landscape (90° rotation), not a
 * lenticular strip kept upright.
 */
export function kayouScanIsRotatedLandscape(
  width: number,
  height: number,
  rarity: string | null | undefined,
  cardNumber?: string | null,
  name?: string | null,
): boolean {
  if (!(width > 0 && height > 0) || width > height) return false;
  if (cardNumber && kayouScanIsCcWaveRotatedLandscape(width, height, cardNumber)) {
    return true;
  }
  if (
    cardNumber &&
    kayouScanIsStoryPanelRotatedLandscape(width, height, cardNumber, name)
  ) {
    return true;
  }
  // Other cc.* tiers (ptr/qr/sp/ur…) — portrait cards, not story-panel pivots.
  if (cardNumber && kayouCardNumberIsCcSeries(cardNumber)) return false;
  if (
    cardNumber &&
    kayouScanIsCataloguePrRotatedLandscape(width, height, cardNumber)
  ) {
    return true;
  }
  // Other catalogue promos `nr.pr.*` are upright (CapsuleCorp compact / CDN).
  if (
    cardNumber &&
    /\.pr\./i.test(cardNumber) &&
    !kayouCardNumberIsWavePrPivot(cardNumber)
  ) {
    return false;
  }
  const rRaw = rarity?.trim().toUpperCase() ?? "";
  // Ledgers use `SS-HR` / `CC-R` prefixes for the same rarity tokens.
  const r = rRaw.replace(/^(SS|CC)-/, "");
  if (r !== "HR" && r !== "MR" && r !== "PR") return false;
  // Wave PR pivots only (`nrz07.pr.060`) — same compact window as NRZ08 HR.
  if (r === "PR" && cardNumber && !kayouCardNumberIsWavePrPivot(cardNumber)) {
    return false;
  }
  // Lenticular strip — 2–3 faces stacked (t4w4 `nr.hr.*`, Heaven Scrolls…).
  if (width >= 280 && height >= 400) return false;
  // NRZ08-style MR pivots only (~186×264). Larger CapsuleCorp scans
  // (`nrb07.mr.069` ≈ 268×378) are upright character cards.
  if (r === "MR") {
    if (width >= 240 || height >= 320) return false;
    return width >= 170 && height >= 230;
  }
  // NRZ08-style HR + New Year `nr.ss.hr.*` compact pivots (~257×361).
  const KAYOU_ROTATED_LANDSCAPE_MAX_W = 270;
  const KAYOU_ROTATED_LANDSCAPE_MAX_H = 380;
  if (width >= KAYOU_ROTATED_LANDSCAPE_MAX_W || height >= KAYOU_ROTATED_LANDSCAPE_MAX_H) {
    return false;
  }
  // Compact portrait scan ≈ NRZ08 wave and similar rotated landscape cards.
  return width >= 170 && height >= 230;
}

/** Auto-managed `landscapePrint` flags from Kayou scan heuristics. */
export function kayouEntryUsesRotatedLandscapeHeuristic(entry: {
  card: string;
  rarity?: string | null;
  name?: string | null;
}): boolean {
  // All cc.* / nr.cc.* marks are pipeline-owned (incl. stale ptr/qr from old rules).
  if (kayouCardNumberIsCcSeries(entry.card)) return true;
  // All PR marks are pipeline-owned so stale `nr.pr.*` landscape flags clear.
  if (/\.pr\./i.test(entry.card)) return true;
  // Story R/SR panels (chapter titles) — pipeline-owned landscape pivots.
  if (
    kayouNameLooksLikeStoryPanel(entry.name) &&
    kayouCardNumberIsStoryPanelTier(entry.card)
  ) {
    return true;
  }
  const rarityRaw =
    entry.rarity?.trim().toUpperCase() ??
    (kayouCardNumberIsCompactPivotRarity(entry.card)
      ? (entry.card.trim().toLowerCase().split(".").at(-2) ?? "").toUpperCase()
      : null);
  const rarity = rarityRaw?.replace(/^(SS|CC)-/, "") ?? null;
  return rarity === "HR" || rarity === "MR" || rarity === "PR";
}

function firstArtDimensions(
  entry: CardsIndexV1["cards"][string],
): { width: number; height: number } | null {
  for (const slot of Object.values(entry.langs)) {
    if (
      typeof slot.artW === "number" &&
      typeof slot.artH === "number" &&
      slot.artW > 0 &&
      slot.artH > 0
    ) {
      return { width: slot.artW, height: slot.artH };
    }
  }
  return null;
}

/** Re-apply after `enrichCardsIndexArtDimensions` — pixels alone miss NRZ08 HR. */
export function markKayouRotatedLandscapePrints(
  packId: string = NARUTO_KAYOU_PACK_ID,
): { marked: number; cleared: number } {
  const dest = packCardsIndexPath(packId);
  const raw = JSON.parse(readFileSync(dest, "utf8")) as unknown;
  if (!isCardsIndexV1(raw)) {
    throw new Error(`cards-index invalide : ${dest}`);
  }
  const index = raw as CardsIndexV1;
  let marked = 0;
  let cleared = 0;

  for (const entry of Object.values(index.cards)) {
    const dims = firstArtDimensions(entry);
    if (!dims) continue;
    const rarity =
      entry.rarity ??
      (kayouCardNumberIsCompactPivotRarity(entry.card)
        ? (entry.card.trim().toLowerCase().split(".").at(-2) ?? "").toUpperCase()
        : null);
    const want = kayouScanIsRotatedLandscape(
      dims.width,
      dims.height,
      rarity,
      entry.card,
      entry.name,
    );
    if (want) {
      if (!entry.landscapePrint) marked += 1;
      entry.landscapePrint = true;
    } else if (
      entry.landscapePrint &&
      kayouEntryUsesRotatedLandscapeHeuristic(entry)
    ) {
      delete entry.landscapePrint;
      cleared += 1;
    }
  }

  writeFileSync(dest, `${JSON.stringify(index)}\n`);
  resetCardsIndexOrientationCache();
  return { marked, cleared };
}
