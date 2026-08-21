/**
 * Lorcast — seconde source du catalogue Lorcana, en **remplissage seul**.
 *
 * LorcanaJSON reste la source de vérité : il donne quatre langues, les masques
 * de foil et de vernis, bref tout ce qui fait une carte chez nous. Mais il ne
 * publie pas tout. Mesuré le 2026-08-21 contre nos 3 241 tirages : 28 tirages
 * réellement imprimés lui manquent — `36/P2` (Mickey Mouse – True Friend, la
 * promo puzzle) et cinq autres promos P2, quatre C2, et les dix-huit cartes du
 * Format Coconut, un set promo entier. Aucun n'était trouvable dans l'appli.
 *
 * Ce module ne remplace donc jamais un fait de LorcanaJSON. Il n'ajoute qu'un
 * tirage que celui-ci ignore, et il le dit : les fichiers qu'il pose portent
 * `.lorcast.` dans leur nom.
 *
 * Trois écarts de modèle, réglés ici et nulle part ailleurs :
 *
 * 1. **Le set d'une promo n'est pas le même des deux côtés.** LorcanaJSON range
 *    une promo sous l'extension de la carte qu'elle réimprime (`10/P3` est
 *    rangée en set 1, celui du Mickey d'origine) et note `P3` à part. Lorcast
 *    ne connaît que ce qui est imprimé : `P3`. On ne peut pas retrouver
 *    l'extension de base à partir de Lorcast, et la deviner par le nom de la
 *    carte serait une invention — `Mickey Mouse - True Friend` existe en set 1
 *    **et** en set 9. Une promo venue de Lorcast est donc rangée sous son code
 *    imprimé, qui devient à la fois son set et son groupe promo. Elle apparaît
 *    comme sa propre extension dans le sélecteur : le trou reste visible.
 * 2. **La numérotation de `cp` contredit celle de `C1`.** Ce sont les mêmes
 *    neuf cartes, numérotées autrement (Lorcast dit `25/41/42/43` là où
 *    LorcanaJSON dit `1/2/3/4`). Aucune n'est manquante ; les fusionner en
 *    créerait quatre fantômes. Le set est écarté, voir {@link LORCAST_SETS_NOT_FILLED}.
 * 3. **`25ja` / `25zh` ne sont pas des numéros de collection.** Ce sont les
 *    tirages japonais et chinois du même `25/P1`, que Lorcast départage par la
 *    langue. Chez nous la langue est portée par l'exemplaire, jamais par la
 *    clé de tirage — ces numéros sont donc refusés par {@link COLLECTOR_NUMBER}.
 *
 * L'API est publique, sans clé, et ne publie qu'en anglais : les cartes ajoutées
 * ici n'ont pas de titre français, et pas de masque de foil non plus.
 */
import { httpGet } from "@/lib/http/httpClient";

import { buildPrintKey } from "@/core/identify/printKey";
import {
  LORCANA_GAME,
  normalizeLorcanaSearchText,
} from "@/providers/lorcanajson/fetch";

const BASE_URL = "https://api.lorcast.com/v0";

/** Lorcast ne publie qu'en anglais. */
export const LORCAST_LANGUAGE = "en";

/** Source tag posé dans le nom des fichiers qu'on télécharge d'ici. */
export const LORCAST_SOURCE = "lorcast";

/** Un catalogue entier tient en une vingtaine d'appels ; laissons-leur du temps. */
const REQUEST_TIMEOUT_MS = 30_000;

/**
 * Ce qu'un numéro de collection peut être : des chiffres, et au plus **une**
 * lettre de variante (`24b`). Tout le reste — `25ja`, `25zh` — porte autre
 * chose que ce qui est imprimé, et n'ancre donc rien.
 */
const COLLECTOR_NUMBER = /^(\d+)([a-z]?)$/;

/** Un code purement numérique est une extension principale, pas une promo. */
const MAIN_SET_CODE = /^\d+$/;

/**
 * Sets de Lorcast qu'on ne fusionne pas, et pourquoi.
 *
 * Écrit ici plutôt que deviné : un set écarté en silence est un trou qu'on ne
 * retrouve plus. La clé est le code Lorcast en minuscules.
 */
export const LORCAST_SETS_NOT_FILLED: Readonly<Record<string, string>> = {
  cp: "Mêmes neuf cartes que C1 chez LorcanaJSON, numérotées autrement (25/41/42/43 contre 1/2/3/4) : rien n'y manque, et les fusionner créerait des doublons.",
};

export type LorcastPrint = {
  /** Identifiant Lorcast (`crd_…`), gardé pour re-résoudre la fiche. */
  providerId: string;
  printKey: string;
  /** Le code tel qu'il est imprimé : `P2`, `Coconut`, `9`. */
  setCode: string;
  setName: string | null;
  /** Numéro de collection, lettre de variante comprise : `36`, `24b`. */
  number: string;
  /** Numéro sans la lettre — ce sur quoi porte la comparaison des trous. */
  baseNumber: string;
  variant: string | null;
  /** Le code promo, quand le set n'est pas une extension numérotée. */
  promoGrouping: string | null;
  fullName: string;
  name: string;
  version: string | null;
  rarity: string | null;
  cardType: string | null;
  color: string | null;
  cost: number | null;
  lore: number | null;
  strength: number | null;
  willpower: number | null;
  inkwell: boolean | null;
  subtypes: string[];
  artists: string[];
  flavorText: string | null;
  imageUrl: string | null;
  thumbnailUrl: string | null;
  searchName: string;
};

type RawSet = {
  code?: unknown;
  name?: unknown;
};

type RawImageUris = {
  digital?: {
    small?: unknown;
    normal?: unknown;
    large?: unknown;
  };
};

type RawCard = {
  id?: unknown;
  name?: unknown;
  version?: unknown;
  collector_number?: unknown;
  rarity?: unknown;
  cost?: unknown;
  inkwell?: unknown;
  ink?: unknown;
  type?: unknown;
  classifications?: unknown;
  illustrators?: unknown;
  flavor_text?: unknown;
  strength?: unknown;
  willpower?: unknown;
  lore?: unknown;
  image_uris?: RawImageUris;
  set?: RawSet;
};

type RawList = { results?: unknown } | unknown[];

function text(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function integer(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.trunc(value);
  }
  return null;
}

function optionalBool(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

function httpsUrl(value: unknown): string | null {
  const raw = text(value);
  if (!raw) return null;
  return raw.startsWith("https://") ? raw : null;
}

/** `Super_rare` chez Lorcast — la même rareté s'écrit `Super rare` ailleurs. */
function rarityLabel(value: unknown): string | null {
  const raw = text(value);
  return raw ? raw.replace(/_/g, " ") : null;
}

function rows(payload: RawList | undefined): unknown[] {
  if (Array.isArray(payload)) return payload;
  const results = (payload as { results?: unknown } | undefined)?.results;
  return Array.isArray(results) ? results : [];
}

/**
 * L'ancre d'un trou : le code imprimé et le numéro, sans la variante.
 *
 * Volontairement plus grossière que la clé de tirage. Une variante qu'on
 * ajouterait sous un numéro déjà connu — Lorcast liste `24` et `24B` là où
 * LorcanaJSON liste `24A` et `24B` — est bien plus probablement un désaccord de
 * modèle qu'un tirage réellement absent, et un doublon coûte plus cher qu'un
 * oubli.
 */
export function lorcanaGapKey(input: {
  setCode: string | null | undefined;
  promoGrouping?: string | null;
  number: string | number | null | undefined;
}): string | null {
  const code = (input.promoGrouping || input.setCode || "").trim().toUpperCase();
  const number = String(input.number ?? "")
    .trim()
    .toLowerCase();
  const match = COLLECTOR_NUMBER.exec(number);
  if (!code || !match) return null;
  return `${code}|${Number(match[1])}`;
}

export function mapLorcastCard(raw: RawCard): LorcastPrint | null {
  const providerId = text(raw.id);
  const setCode = text(raw.set?.code);
  const name = text(raw.name);
  if (!providerId || !setCode || !name) return null;

  const number = text(raw.collector_number)?.toLowerCase();
  const match = number ? COLLECTOR_NUMBER.exec(number) : null;
  if (!number || !match) return null;

  const promoGrouping = MAIN_SET_CODE.test(setCode)
    ? null
    : setCode.toUpperCase();
  const printKey = buildPrintKey({
    game: LORCANA_GAME,
    set: setCode,
    number,
  });
  if (!printKey) return null;

  // `version` vaut littéralement "None" sur les cartes sans sous-titre.
  const rawVersion = text(raw.version);
  const version = rawVersion && rawVersion !== "None" ? rawVersion : null;
  const fullName = version ? `${name} - ${version}` : name;

  return {
    providerId,
    printKey,
    setCode,
    setName: text(raw.set?.name),
    number,
    baseNumber: String(Number(match[1])),
    variant: match[2] || null,
    promoGrouping,
    fullName,
    name,
    version,
    rarity: rarityLabel(raw.rarity),
    cardType: stringList(raw.type)[0] ?? null,
    color: text(raw.ink),
    cost: integer(raw.cost),
    lore: integer(raw.lore),
    strength: integer(raw.strength),
    willpower: integer(raw.willpower),
    inkwell: optionalBool(raw.inkwell),
    subtypes: stringList(raw.classifications),
    artists: stringList(raw.illustrators),
    flavorText: text(raw.flavor_text),
    imageUrl:
      httpsUrl(raw.image_uris?.digital?.large) ??
      httpsUrl(raw.image_uris?.digital?.normal),
    thumbnailUrl: httpsUrl(raw.image_uris?.digital?.small),
    searchName: normalizeLorcanaSearchText(fullName),
  };
}

export async function fetchLorcastSetCodes(
  signal?: AbortSignal,
): Promise<string[]> {
  const response = await httpGet<RawList>(`${BASE_URL}/sets`, {
    timeout: REQUEST_TIMEOUT_MS,
    signal,
  });
  const codes: string[] = [];
  for (const raw of rows(response.data)) {
    const code = text((raw as RawSet).code);
    if (code) codes.push(code);
  }
  return codes;
}

export async function fetchLorcastSetPrints(
  setCode: string,
  signal?: AbortSignal,
): Promise<LorcastPrint[]> {
  const response = await httpGet<RawList>(
    `${BASE_URL}/sets/${encodeURIComponent(setCode)}/cards`,
    { timeout: REQUEST_TIMEOUT_MS, signal },
  );
  const prints: LorcastPrint[] = [];
  for (const raw of rows(response.data)) {
    const print = mapLorcastCard(raw as RawCard);
    if (print) prints.push(print);
  }
  return prints;
}

export type LorcastCatalogue = {
  prints: LorcastPrint[];
  /** Sets lus, dans l'ordre où Lorcast les publie. */
  setCodes: string[];
  /** Sets écartés d'office, code → raison. */
  notFilled: Record<string, string>;
  /** Sets dont la lecture a échoué — le remplissage continue sans eux. */
  failed: { setCode: string; error: string }[];
};

/**
 * Tout le catalogue Lorcast, set par set.
 *
 * Séquentiel : vingt-deux appels ne valent pas qu'on cogne un hôte public en
 * parallèle, et l'échec d'un set ne doit pas emporter les autres.
 */
export async function loadLorcastCatalogue(
  options: { signal?: AbortSignal } = {},
): Promise<LorcastCatalogue> {
  const setCodes = await fetchLorcastSetCodes(options.signal);
  const prints: LorcastPrint[] = [];
  const failed: { setCode: string; error: string }[] = [];
  const notFilled: Record<string, string> = {};

  for (const setCode of setCodes) {
    const reason = LORCAST_SETS_NOT_FILLED[setCode.toLowerCase()];
    if (reason) {
      notFilled[setCode] = reason;
      continue;
    }
    try {
      prints.push(...(await fetchLorcastSetPrints(setCode, options.signal)));
    } catch (error) {
      failed.push({
        setCode,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return { prints, setCodes, notFilled, failed };
}

/**
 * Ce que Lorcast apporte et que le catalogue n'a pas.
 *
 * `covered` porte les {@link lorcanaGapKey} déjà tenues par LorcanaJSON.
 */
export function selectLorcastFillPrints(
  prints: readonly LorcastPrint[],
  covered: ReadonlySet<string>,
): LorcastPrint[] {
  const fill: LorcastPrint[] = [];
  const seen = new Set<string>();
  for (const print of prints) {
    const gap = lorcanaGapKey(print);
    if (!gap || covered.has(gap) || seen.has(print.printKey)) continue;
    seen.add(print.printKey);
    fill.push(print);
  }
  return fill;
}
