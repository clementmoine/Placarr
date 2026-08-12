/**
 * Local-first Lorcana per-card assets under `/assets/lorcana/cards/{set}/{lang}/{card}/`.
 */

import type { CardsIndexLangFiles, CardsIndexV1 } from "@/effects/cardsIndex";
import { isCardsIndexV1 } from "@/effects/cardsIndex";
import { loadCardsIndexJson } from "@/lib/foilMetaLoad";
import {
  assetsCardUrl,
  cardDiskIdFromPrintKey,
} from "@/lib/packAssetUrls";

type PackLang = "fr" | "en" | "de" | "it";
const PACK_LANGS = ["fr", "en", "de", "it"] as const;
const DEFAULT_PACK_LANG: PackLang = "fr";

function isPackLang(value: unknown): value is PackLang {
  return (
    typeof value === "string" &&
    (PACK_LANGS as readonly string[]).includes(value)
  );
}

function loadIndex(): CardsIndexV1 {
  const raw = loadCardsIndexJson("lorcana");
  return isCardsIndexV1(raw)
    ? raw
    : { version: 1, pack: "lorcana", cards: {} };
}

export const LORCANA_CARDS_BASE = "/assets/lorcana/cards";

function entry(printKey: string | null | undefined) {
  if (!printKey) return null;
  const INDEX = loadIndex();
  return INDEX.cards[printKey] ?? INDEX.cards[printKey.toLowerCase()] ?? null;
}

function pickLangFiles(
  row: NonNullable<ReturnType<typeof entry>>,
  preferred?: string | null,
): { language: string | null; files: CardsIndexLangFiles } {
  const wanted = isPackLang(preferred) ? preferred : DEFAULT_PACK_LANG;
  const order: PackLang[] = [
    wanted,
    ...PACK_LANGS.filter((lang) => lang !== wanted),
  ];

  for (const lang of order) {
    const files = row.langs[lang];
    if (
      files &&
      (files.art || files.mask || files.thumb || files.varnishMask)
    ) {
      return { language: lang, files };
    }
  }
  return { language: null, files: {} };
}

function fileUrl(
  printKey: string,
  language: string | null,
  file: string | undefined,
): string | null {
  if (!file || !language) return null;
  const id = cardDiskIdFromPrintKey(printKey, language);
  if (!id) return null;
  return assetsCardUrl("lorcana", id, file);
}

export function packHasCard(printKey: string | null | undefined): boolean {
  const row = entry(printKey);
  if (!row) return false;
  const { files } = pickLangFiles(row);
  return Boolean(files.art || files.mask || files.thumb || files.varnishMask);
}

export function packFoilMaskUrl(
  printKey: string | null | undefined,
  language?: string | null,
): string | null {
  const row = entry(printKey);
  if (!row || !printKey) return null;
  const picked = pickLangFiles(row, language);
  return fileUrl(printKey, picked.language, picked.files.mask);
}

export function packVarnishMaskUrl(
  printKey: string | null | undefined,
  language?: string | null,
): string | null {
  const row = entry(printKey);
  if (!row || !printKey) return null;
  const picked = pickLangFiles(row, language);
  return fileUrl(printKey, picked.language, picked.files.varnishMask);
}

export function packSecondVarnishMaskUrl(
  printKey: string | null | undefined,
  language?: string | null,
): string | null {
  const row = entry(printKey);
  if (!row || !printKey) return null;
  const picked = pickLangFiles(row, language);
  return fileUrl(printKey, picked.language, picked.files.secondVarnishMask);
}

export function packArtUrl(
  printKey: string | null | undefined,
  language?: string | null,
): string | null {
  const row = entry(printKey);
  if (!row || !printKey) return null;
  const picked = pickLangFiles(row, language);
  return fileUrl(printKey, picked.language, picked.files.art);
}

export function packThumbUrl(
  printKey: string | null | undefined,
  language?: string | null,
): string | null {
  const row = entry(printKey);
  if (!row || !printKey) return null;
  const picked = pickLangFiles(row, language);
  return (
    fileUrl(printKey, picked.language, picked.files.thumb) ??
    fileUrl(printKey, picked.language, picked.files.art)
  );
}

export function preferPackUrl(
  packUrl: string | null,
  fallback: string | null | undefined,
): string | null {
  return packUrl ?? fallback ?? null;
}

export function withPackCardUrls<
  T extends {
    printKey?: string | null;
    language?: string | null;
    imageUrl?: string | null;
    thumbnailUrl?: string | null;
    foilMaskUrl?: string | null;
    varnishMaskUrl?: string | null;
    secondVarnishMaskUrl?: string | null;
    variantImageUrls?: Record<string, string> | null;
  },
>(row: T): T {
  const printKey = row.printKey;
  if (!printKey || !packHasCard(printKey)) return row;
  const language = row.language;

  const art = packArtUrl(printKey, language);
  const thumb = packThumbUrl(printKey, language);
  const foil = packFoilMaskUrl(printKey, language);
  const varnish = packVarnishMaskUrl(printKey, language);
  const second = packSecondVarnishMaskUrl(printKey, language);

  const next: T = { ...row };
  if (art) {
    next.imageUrl = art as T["imageUrl"];
    if (row.variantImageUrls && Object.keys(row.variantImageUrls).length > 0) {
      next.variantImageUrls = Object.fromEntries(
        Object.keys(row.variantImageUrls).map((finish) => [finish, art]),
      ) as T["variantImageUrls"];
    }
  }
  if (thumb || art) {
    next.thumbnailUrl = (thumb ?? art) as T["thumbnailUrl"];
  }
  if (foil) next.foilMaskUrl = foil as T["foilMaskUrl"];
  if (varnish) next.varnishMaskUrl = varnish as T["varnishMaskUrl"];
  if (second) next.secondVarnishMaskUrl = second as T["secondVarnishMaskUrl"];
  return next;
}
