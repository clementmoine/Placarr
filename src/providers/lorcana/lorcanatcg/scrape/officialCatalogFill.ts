/**
 * Boucher les trous de langue que LorcanaJSON laisse ouverts, via le catalogue
 * officiel Companion (`api.lorcana.ravensburger.com/v3/catalog/{lang}`).
 *
 * C’est la même API que `cards.disneylorcana.com/?cardId=…` : titres FR Hyperia
 * complets (ex. Mickey — Le meilleur de la ville) alors que LorcanaJSON n’en a
 * encore qu’une poignée.
 *
 * Contrat :
 * - pas d’invention de printKey : on ne pose une face que si le tirage existe
 *   déjà (LorcanaJSON / Lorcast) ;
 * - on ne remplace jamais un titre déjà tenu par LorcanaJSON ;
 * - images = même CDN Ravensburger que LorcanaJSON → stems plain (`art.jpg`).
 */
import { buildPrintKey } from "@/core/identify/printKey";
import { httpGet } from "@/lib/http/httpClient";
import {
  LORCANA_GAME,
  LORCANA_LANGUAGES,
  normalizeLorcanaSearchText,
  type LorcanaLanguage,
} from "@/providers/lorcana/lorcanajson/fetch";

export const OFFICIAL_CATALOG_UA = "Placarr-lorcana-catalog/1.0";

export function officialCatalogUrl(lang: LorcanaLanguage): string {
  return `https://api.lorcana.ravensburger.com/v3/catalog/${lang}`;
}

/** `241/204 FR 14` | `14/P4 FR 13` | `13/D23 EN 14` | `18/35 FR Q2` */
const CARD_IDENTIFIER_RE =
  /^(\d+)([a-zA-Z])?\/([A-Za-z0-9]+)\s+([A-Za-z]{2})\s+(.+)$/;

const SET_ID_RE = /^set(\d+)$/i;
const QUEST_ID_RE = /^quest(\d+)$/i;

const COLOR_LABELS: Record<
  string,
  Partial<Record<LorcanaLanguage, string>>
> = {
  AMBER: { fr: "Ambre", en: "Amber" },
  AMETHYST: { fr: "Améthyste", en: "Amethyst" },
  EMERALD: { fr: "Émeraude", en: "Emerald" },
  RUBY: { fr: "Rubis", en: "Ruby" },
  SAPPHIRE: { fr: "Saphir", en: "Sapphire" },
  STEEL: { fr: "Acier", en: "Steel" },
};

const RARITY_LABELS: Record<
  string,
  Partial<Record<LorcanaLanguage, string>>
> = {
  COMMON: { fr: "Commune", en: "Common" },
  UNCOMMON: { fr: "Inhabituelle", en: "Uncommon" },
  RARE: { fr: "Rare", en: "Rare" },
  SUPER: { fr: "Très Rare", en: "Super Rare" },
  LEGENDARY: { fr: "Légendaire", en: "Legendary" },
  ENCHANTED: { fr: "Enchantée", en: "Enchanted" },
  EPIC: { fr: "Épique", en: "Epic" },
  ICONIC: { fr: "Iconique", en: "Iconic" },
  SPECIAL: { fr: "Spécial", en: "Special" },
};

const CARD_TYPE_LABELS: Record<
  string,
  Partial<Record<LorcanaLanguage, string>>
> = {
  characters: { fr: "Personnage", en: "Character" },
  actions: { fr: "Action", en: "Action" },
  items: { fr: "Objet", en: "Item" },
  locations: { fr: "Lieu", en: "Location" },
};

export type OfficialCatalogVariant = {
  variantId: string | null;
  detailImageUrl: string | null;
  foilMaskUrl: string | null;
  varnishMaskUrl: string | null;
  foilType: string | null;
  hotFoilColor: string | null;
};

export type OfficialCatalogCard = {
  cultureInvariantId: number | null;
  cardIdentifier: string;
  cardSets: string[];
  name: string;
  subtitle: string | null;
  rarity: string | null;
  inkColors: string[];
  inkCost: number | null;
  lore: number | null;
  strength: number | null;
  willpower: number | null;
  inkwell: boolean | null;
  subtypes: string[];
  author: string | null;
  flavorText: string | null;
  thumbnailUrl: string | null;
  kind: string;
  variants: OfficialCatalogVariant[];
};

export type OfficialCatalogFillPrint = {
  printKey: string;
  language: LorcanaLanguage;
  setCode: string;
  number: string;
  variant: string | null;
  promoGrouping: string | null;
  setCardCount: number | null;
  providerId: string | null;
  fullName: string;
  name: string;
  version: string | null;
  searchName: string;
  setName: string | null;
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
  foilTypes: string[];
  varnishType: string | null;
  foilEffectColors: string[];
  imageUrl: string | null;
  thumbnailUrl: string | null;
  foilMaskUrl: string | null;
  varnishMaskUrl: string | null;
};

export type ParsedCardIdentifier = {
  number: string;
  variant: string | null;
  /** Dénominateur numérique (`204`) ou code promo (`P4`, `D23`). */
  middle: string;
  promoGrouping: string | null;
  setCardCount: number | null;
  languageMark: string;
  setTail: string;
};

export function parseOfficialCardIdentifier(
  value: string | null | undefined,
): ParsedCardIdentifier | null {
  const raw = (value ?? "").trim();
  const match = CARD_IDENTIFIER_RE.exec(raw);
  if (!match) return null;
  const base = match[1]!;
  const letter = (match[2] ?? "").toLowerCase() || null;
  const middle = match[3]!;
  const languageMark = match[4]!;
  const setTail = match[5]!.trim();
  const middleIsDigits = /^\d+$/.test(middle);
  return {
    number: letter ? `${Number(base)}${letter}` : String(Number(base)),
    variant: letter,
    middle,
    promoGrouping: middleIsDigits ? null : middle.toUpperCase(),
    setCardCount: middleIsDigits ? Number(middle) : null,
    languageMark,
    setTail,
  };
}

/**
 * Chapitre / quête ancré pour la clé — `setN` gagne sur `questN` (réimpressions
 * duales), sinon queue-seul → `QN`.
 */
export function resolveOfficialSetCode(
  cardSets: readonly string[],
  setTail: string,
): string | null {
  for (const id of cardSets) {
    const set = SET_ID_RE.exec(id.trim());
    if (set) return set[1]!;
  }
  for (const id of cardSets) {
    const quest = QUEST_ID_RE.exec(id.trim());
    if (quest) return `Q${quest[1]}`;
  }
  const tail = setTail.trim();
  if (/^\d+$/.test(tail)) return tail;
  if (/^Q\d+$/i.test(tail)) return tail.toUpperCase();
  return null;
}

function text(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function numberOrNull(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && !Number.isNaN(Number(value))) {
    return Number(value);
  }
  return null;
}

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
    .filter(Boolean);
}

function httpsUrl(value: unknown): string | null {
  const raw = text(value);
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:") return null;
    return url.toString();
  } catch {
    return null;
  }
}

/**
 * Langue du chemin CDN Ravensburger (`…/images/fr/set14/…` → `fr`).
 * `null` si l’URL n’est pas ce CDN — on ne bloque pas les autres hosts.
 */
export function ravensburgerImageLang(
  url: string | null | undefined,
): string | null {
  if (!url) return null;
  const match = /\/images\/([a-z]{2})\//i.exec(url);
  return match?.[1]?.toLowerCase() ?? null;
}

/** True si une URL média contredit la langue demandée. */
export function ravensburgerMediaConflictsLang(
  language: string,
  ...urls: Array<string | null | undefined>
): boolean {
  const want = language.trim().toLowerCase();
  if (!want) return false;
  for (const url of urls) {
    const got = ravensburgerImageLang(url);
    if (got && got !== want) return true;
  }
  return false;
}

function labelFor(
  table: Record<string, Partial<Record<LorcanaLanguage, string>>>,
  key: string | null | undefined,
  lang: LorcanaLanguage,
): string | null {
  if (!key) return null;
  return (
    table[key]?.[lang] ??
    table[key.toUpperCase()]?.[lang] ??
    table[key.toLowerCase()]?.[lang] ??
    key
  );
}

function colorLabel(
  inkColors: readonly string[],
  lang: LorcanaLanguage,
): string | null {
  const parts = inkColors
    .map((c) => labelFor(COLOR_LABELS, c, lang))
    .filter((c): c is string => Boolean(c));
  return parts.length ? parts.join("-") : null;
}

function pickVariants(variants: OfficialCatalogVariant[]): {
  imageUrl: string | null;
  foilMaskUrl: string | null;
  varnishMaskUrl: string | null;
  foilTypes: string[];
  varnishType: string | null;
  foilEffectColors: string[];
} {
  const regular =
    variants.find((v) => (v.variantId ?? "").toLowerCase() === "regular") ??
    variants[0] ??
    null;
  const foiled =
    variants.find((v) => (v.variantId ?? "").toLowerCase() === "foiled") ??
    null;
  const maskSource = foiled?.foilMaskUrl ? foiled : regular;
  const foilTypes = [
    ...new Set(
      variants
        .map((v) => v.foilType)
        .filter((v): v is string => Boolean(v)),
    ),
  ];
  const hot = regular?.hotFoilColor ?? foiled?.hotFoilColor ?? null;
  return {
    imageUrl: regular?.detailImageUrl ?? null,
    foilMaskUrl: maskSource?.foilMaskUrl ?? null,
    varnishMaskUrl: regular?.varnishMaskUrl ?? foiled?.varnishMaskUrl ?? null,
    foilTypes,
    varnishType: null,
    foilEffectColors: hot ? [hot] : [],
  };
}

export function parseOfficialCatalogCards(
  raw: unknown,
): OfficialCatalogCard[] {
  if (!raw || typeof raw !== "object") return [];
  const cards = (raw as { cards?: unknown }).cards;
  if (!cards || typeof cards !== "object") return [];
  const out: OfficialCatalogCard[] = [];
  for (const [kind, list] of Object.entries(cards as Record<string, unknown>)) {
    if (!Array.isArray(list)) continue;
    for (const entry of list) {
      if (!entry || typeof entry !== "object") continue;
      const row = entry as Record<string, unknown>;
      const name = text(row.name);
      const cardIdentifier = text(row.card_identifier);
      if (!name || !cardIdentifier) continue;
      const variantsRaw = Array.isArray(row.variants) ? row.variants : [];
      const variants: OfficialCatalogVariant[] = variantsRaw
        .filter((v): v is Record<string, unknown> => Boolean(v) && typeof v === "object")
        .map((v) => ({
          variantId: text(v.variant_id),
          detailImageUrl: httpsUrl(v.detail_image_url),
          foilMaskUrl: httpsUrl(v.foil_mask_url),
          varnishMaskUrl: httpsUrl(v.foil_top_layer_mask_url),
          foilType: text(v.foil_type),
          hotFoilColor: text(v.hot_foil_color),
        }));
      out.push({
        cultureInvariantId: numberOrNull(row.culture_invariant_id),
        cardIdentifier,
        cardSets: stringList(row.card_sets),
        name,
        subtitle: text(row.subtitle),
        rarity: text(row.rarity),
        inkColors: stringList(row.magic_ink_colors),
        inkCost: numberOrNull(row.ink_cost),
        lore: numberOrNull(row.quest_value),
        strength: numberOrNull(row.strength),
        willpower: numberOrNull(row.willpower),
        inkwell:
          typeof row.ink_convertible === "boolean" ? row.ink_convertible : null,
        subtypes: stringList(row.subtypes),
        author: text(row.author),
        flavorText: text(row.flavor_text),
        thumbnailUrl: httpsUrl(row.thumbnail_url),
        kind,
        variants,
      });
    }
  }
  return out;
}

export function parseOfficialSetNames(
  raw: unknown,
): Map<string, string> {
  const out = new Map<string, string>();
  if (!raw || typeof raw !== "object") return out;
  const list = (raw as { card_sets?: unknown }).card_sets;
  if (!Array.isArray(list)) return out;
  for (const entry of list) {
    if (!entry || typeof entry !== "object") continue;
    const row = entry as { id?: unknown; name?: unknown };
    const id = text(row.id)?.toLowerCase();
    const name = text(row.name);
    if (!id || !name) continue;
    const set = SET_ID_RE.exec(id);
    if (set) {
      out.set(set[1]!, name);
      continue;
    }
    const quest = QUEST_ID_RE.exec(id);
    if (quest) out.set(`Q${quest[1]}`, name);
  }
  return out;
}

/**
 * Carte officielle → face pack, ou `null` si l’identifiant n’ancre rien.
 *
 * Refuse les fuites EN→FR : le Companion `/v3/catalog/fr` liste encore des
 * Challenge / D23 / Promo dont l’identifiant dit `EN` et le CDN est
 * `/images/en/…`. Sans ce filtre on inventait un `print_titles` FR fantôme.
 */
export function toOfficialCatalogFillPrint(
  card: OfficialCatalogCard,
  language: LorcanaLanguage,
  setNames: ReadonlyMap<string, string> = new Map(),
): OfficialCatalogFillPrint | null {
  const parsed = parseOfficialCardIdentifier(card.cardIdentifier);
  if (!parsed) return null;
  if (parsed.languageMark.toLowerCase() !== language.toLowerCase()) {
    return null;
  }
  const setCode = resolveOfficialSetCode(card.cardSets, parsed.setTail);
  if (!setCode) return null;

  const printKey = buildPrintKey({
    game: LORCANA_GAME,
    set: setCode,
    number: parsed.number,
    grouping: parsed.promoGrouping,
  });
  if (!printKey) return null;

  const version = card.subtitle;
  const fullName = version ? `${card.name} - ${version}` : card.name;
  const media = pickVariants(card.variants);
  if (
    ravensburgerMediaConflictsLang(
      language,
      media.imageUrl,
      card.thumbnailUrl,
      media.foilMaskUrl,
      media.varnishMaskUrl,
    )
  ) {
    return null;
  }

  return {
    printKey,
    language,
    setCode,
    number: parsed.variant
      ? parsed.number.slice(0, -1) || parsed.number
      : parsed.number,
    variant: parsed.variant,
    promoGrouping: parsed.promoGrouping,
    setCardCount: parsed.setCardCount,
    providerId:
      card.cultureInvariantId != null
        ? String(card.cultureInvariantId)
        : null,
    fullName,
    name: card.name,
    version,
    searchName: normalizeLorcanaSearchText(fullName),
    setName: setNames.get(setCode) ?? null,
    rarity: labelFor(RARITY_LABELS, card.rarity, language),
    cardType: labelFor(CARD_TYPE_LABELS, card.kind, language),
    color: colorLabel(card.inkColors, language),
    cost: card.inkCost,
    lore: card.lore,
    strength: card.strength,
    willpower: card.willpower,
    inkwell: card.inkwell,
    subtypes: card.subtypes,
    artists: card.author ? [card.author] : [],
    flavorText: card.flavorText,
    foilTypes: media.foilTypes,
    varnishType: media.varnishType,
    foilEffectColors: media.foilEffectColors,
    imageUrl: media.imageUrl,
    thumbnailUrl: card.thumbnailUrl,
    foilMaskUrl: media.foilMaskUrl,
    varnishMaskUrl: media.varnishMaskUrl,
  };
}

/**
 * Faces officielles absentes du catalogue local (langue × printKey).
 *
 * `existingPrintKeys` — tirages déjà ancrés ; sans ça on n’invente rien.
 * `coveredTitles` — `${printKey}\0${lang}` déjà tenus (LorcanaJSON…).
 */
export function selectOfficialCatalogFill(
  cards: readonly OfficialCatalogCard[],
  language: LorcanaLanguage,
  coveredTitles: ReadonlySet<string>,
  existingPrintKeys: ReadonlySet<string>,
  setNames: ReadonlyMap<string, string> = new Map(),
): OfficialCatalogFillPrint[] {
  const fill: OfficialCatalogFillPrint[] = [];
  const seen = new Set<string>();
  for (const card of cards) {
    const mapped = toOfficialCatalogFillPrint(card, language, setNames);
    if (!mapped) continue;
    if (!existingPrintKeys.has(mapped.printKey)) continue;
    const titleKey = `${mapped.printKey}\0${language}`;
    if (coveredTitles.has(titleKey) || seen.has(titleKey)) continue;
    seen.add(titleKey);
    fill.push(mapped);
  }
  return fill;
}

export type OfficialCatalogFillResult = {
  fills: OfficialCatalogFillPrint[];
  notes: string[];
};

async function fetchOfficialCatalog(
  language: LorcanaLanguage,
  signal?: AbortSignal,
): Promise<unknown> {
  const response = await httpGet<unknown>(officialCatalogUrl(language), {
    headers: { "User-Agent": OFFICIAL_CATALOG_UA },
    timeout: 90_000,
    signal,
  });
  return response.data;
}

/**
 * Complément de langues depuis le catalogue Companion.
 *
 * Une panne d’une locale ne doit pas tuer la moisson : on journalise et on
 * continue (même esprit que {@link loadLorcastFill}).
 */
export async function loadOfficialCatalogFill(
  coveredTitles: ReadonlySet<string>,
  existingPrintKeys: ReadonlySet<string>,
  options: {
    languages?: readonly LorcanaLanguage[];
    signal?: AbortSignal;
  } = {},
): Promise<OfficialCatalogFillResult> {
  const languages = options.languages ?? LORCANA_LANGUAGES;
  const fills: OfficialCatalogFillPrint[] = [];
  const notes: string[] = [];

  for (const language of languages) {
    try {
      const raw = await fetchOfficialCatalog(language, options.signal);
      const cards = parseOfficialCatalogCards(raw);
      const setNames = parseOfficialSetNames(raw);
      const selected = selectOfficialCatalogFill(
        cards,
        language,
        coveredTitles,
        existingPrintKeys,
        setNames,
      );
      fills.push(...selected);
      notes.push(
        `${language}: ${cards.length} cartes lues, ${selected.length} titres manquants`,
      );
    } catch (error) {
      notes.push(
        `${language}: catalogue illisible — ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  return { fills, notes };
}
