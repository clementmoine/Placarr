/**
 * Lorcast, côté **catalogue** — la liste des sets et de leurs cartes.
 *
 * `fetch.ts` interroge Lorcast carte par carte pour un prix ; ici on lit le
 * catalogue en entier, parce que LorcanaJSON n'a pas tout et que le trou ne se
 * voit qu'en comparant deux listes complètes.
 *
 * Ce module ne sait rien de nos conventions de pack : il rend ce que Lorcast
 * publie, normalisé et rien de plus. Le rapprochement avec le catalogue Lorcana
 * — quelle carte manque, sous quelle clé la ranger — vit dans
 * `providers/lorcanatcg/lorcastFill.ts`, qui est le propriétaire du pack.
 *
 * L'API est publique, sans clé, et ne publie qu'en anglais.
 */
import { httpGet } from "@/lib/http/httpClient";

const BASE_URL = "https://api.lorcast.com/v0";

/** Lorcast ne publie qu'en anglais. */
export const LORCAST_LANGUAGE = "en";

/** Étiquette de source, posée dans le nom des fichiers venus d'ici. */
export const LORCAST_SOURCE = "lorcast";

/** Un catalogue entier tient en une vingtaine d'appels : laissons-leur du temps. */
const REQUEST_TIMEOUT_MS = 30_000;

export type LorcastSet = {
  /** Le code tel qu'il est imprimé : `P2`, `Coconut`, `9`. */
  code: string;
  name: string | null;
};

export type LorcastCataloguePrint = {
  /** Identifiant Lorcast (`crd_…`), gardé pour re-résoudre la fiche. */
  providerId: string;
  setCode: string;
  setName: string | null;
  /** Le numéro tel que Lorcast l'écrit : `36`, `24B`, `25ja`. */
  collectorNumber: string;
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
};

type RawSet = {
  code?: unknown;
  name?: unknown;
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
  image_uris?: {
    digital?: { small?: unknown; normal?: unknown; large?: unknown };
  };
  set?: RawSet;
};

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

function listRows(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload;
  const results = (payload as { results?: unknown } | null)?.results;
  return Array.isArray(results) ? results : [];
}

export function mapLorcastCataloguePrint(
  raw: RawCard,
): LorcastCataloguePrint | null {
  const providerId = text(raw.id);
  const setCode = text(raw.set?.code);
  const name = text(raw.name);
  const collectorNumber = text(raw.collector_number);
  if (!providerId || !setCode || !name || !collectorNumber) return null;

  // `version` vaut littéralement "None" sur les cartes sans sous-titre.
  const rawVersion = text(raw.version);

  return {
    providerId,
    setCode,
    setName: text(raw.set?.name),
    collectorNumber,
    name,
    version: rawVersion && rawVersion !== "None" ? rawVersion : null,
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
  };
}

export async function fetchLorcastSets(
  signal?: AbortSignal,
): Promise<LorcastSet[]> {
  const response = await httpGet<unknown>(`${BASE_URL}/sets`, {
    timeout: REQUEST_TIMEOUT_MS,
    signal,
  });
  const sets: LorcastSet[] = [];
  for (const raw of listRows(response.data)) {
    const code = text((raw as RawSet).code);
    if (code) sets.push({ code, name: text((raw as RawSet).name) });
  }
  return sets;
}

export async function fetchLorcastSetPrints(
  setCode: string,
  signal?: AbortSignal,
): Promise<LorcastCataloguePrint[]> {
  const response = await httpGet<unknown>(
    `${BASE_URL}/sets/${encodeURIComponent(setCode)}/cards`,
    { timeout: REQUEST_TIMEOUT_MS, signal },
  );
  const prints: LorcastCataloguePrint[] = [];
  for (const raw of listRows(response.data)) {
    const print = mapLorcastCataloguePrint(raw as RawCard);
    if (print) prints.push(print);
  }
  return prints;
}

export type LorcastCatalogue = {
  prints: LorcastCataloguePrint[];
  /** Sets lus, dans l'ordre où Lorcast les publie. */
  sets: LorcastSet[];
  /** Sets sautés à la demande de l'appelant, code → raison. */
  skipped: { setCode: string; reason: string }[];
  /** Sets dont la lecture a échoué — la moisson continue sans eux. */
  failed: { setCode: string; error: string }[];
};

/**
 * Tout le catalogue, set par set.
 *
 * Séquentiel : une vingtaine d'appels ne valent pas qu'on cogne un hôte public
 * en parallèle. Et l'échec d'un set n'emporte pas les autres — il est rendu à
 * l'appelant, qui décide quoi en dire.
 */
export async function loadLorcastCatalogue(
  options: {
    signal?: AbortSignal;
    /** Rend une raison pour sauter ce set, ou `null` pour le lire. */
    skipSet?: (set: LorcastSet) => string | null;
  } = {},
): Promise<LorcastCatalogue> {
  const sets = await fetchLorcastSets(options.signal);
  const prints: LorcastCataloguePrint[] = [];
  const failed: { setCode: string; error: string }[] = [];
  const skipped: { setCode: string; reason: string }[] = [];

  for (const set of sets) {
    const reason = options.skipSet?.(set) ?? null;
    if (reason) {
      skipped.push({ setCode: set.code, reason });
      continue;
    }
    try {
      prints.push(...(await fetchLorcastSetPrints(set.code, options.signal)));
    } catch (error) {
      failed.push({
        setCode: set.code,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return { prints, sets, skipped, failed };
}
