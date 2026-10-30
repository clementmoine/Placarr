/**
 * Content-types — **ce qu'est un item** (chemin de lecture, style tako).
 *
 * Prisma persiste (`Item` / `Metadata` / `Type`) ; ce module est le contrat
 * *logique* : types de contenu, identité d'exemplaire, champs caractéristiques
 * par type, et regroupement domaine (sans déplacer les providers — hors
 * périmètre ADR-020).
 *
 * @see docs/ADR.md ADR-020
 * @see docs/structure_vs_tako.md §5
 */
import { z } from "zod";

import type { MediaType } from "@/types/providerRegistry";

/** Types de contenu — alignés sur `prisma.Type` et `MediaType`. */
export const CONTENT_TYPES = [
  "games",
  "movies",
  "musics",
  "books",
  "boardgames",
  "hardware",
  "tcg",
  "toys",
] as const satisfies readonly MediaType[];

export type ContentType = (typeof CONTENT_TYPES)[number];

export function isContentType(value: string): value is ContentType {
  return (CONTENT_TYPES as readonly string[]).includes(value);
}

/**
 * Regroupement métier (lecture / futur découpage). Les providers
 * multi-domaines (marketplaces / agrégateurs prix…) restent dans
 * `src/providers/<id>/` — un dossier par source, pas par domaine.
 */
export const CONTENT_DOMAINS = {
  video_games: ["games", "hardware"],
  audiovisual: ["movies"],
  music: ["musics"],
  print: ["books"],
  tabletop: ["boardgames"],
  cards: ["tcg"],
  toys: ["toys"],
} as const satisfies Record<string, readonly ContentType[]>;

export type ContentDomain = keyof typeof CONTENT_DOMAINS;

export function domainForContentType(type: ContentType): ContentDomain {
  for (const [domain, types] of Object.entries(CONTENT_DOMAINS) as Array<
    [ContentDomain, readonly ContentType[]]
  >) {
    if (types.includes(type)) return domain;
  }
  throw new Error(`content-types: aucun domaine pour "${type}"`);
}

/** État physique de l'exemplaire — aligné sur `prisma.Condition`. */
export const ITEM_CONDITIONS = ["new", "used", "loose", "damaged"] as const;
export type ItemCondition = (typeof ITEM_CONDITIONS)[number];

/**
 * Comment on ancre l'identité d'un exemplaire pour ce type.
 * - `barcode` : GTIN / ISBN (livres, beaucoup de retail)
 * - `printKey` : carte TCG (ce qui est imprimé — pas un code-barres)
 * - `title` : titre (+ plateforme souvent) quand il n'y a pas d'identifiant stable
 */
export type ContentIdentityKind = "barcode" | "printKey" | "title";

export type ContentTypeProfile = {
  /** Domaine de lecture (voir {@link CONTENT_DOMAINS}). */
  domain: ContentDomain;
  /** Ancres d'identité typiques, par ordre de préférence. */
  identity: readonly ContentIdentityKind[];
  /**
   * Clés `MetadataResult` / facts souvent peuplées pour ce type.
   * Informatif — le merge reste consensus-driven, pas un filtre Zod strict.
   */
  characteristicFields: readonly string[];
};

export const CONTENT_TYPE_PROFILES: Record<ContentType, ContentTypeProfile> = {
  games: {
    domain: "video_games",
    identity: ["barcode", "title"],
    characteristicFields: [
      "platformKey",
      "duration",
      "releaseDate",
      "description",
      "imageUrl",
    ],
  },
  hardware: {
    domain: "video_games",
    identity: ["barcode", "title"],
    characteristicFields: ["platformKey", "releaseDate", "imageUrl"],
  },
  movies: {
    domain: "audiovisual",
    identity: ["barcode", "title"],
    characteristicFields: [
      "duration",
      "releaseDate",
      "description",
      "imageUrl",
      "authors",
    ],
  },
  musics: {
    domain: "music",
    identity: ["barcode", "title"],
    characteristicFields: [
      "tracksCount",
      "releaseDate",
      "authors",
      "imageUrl",
    ],
  },
  books: {
    domain: "print",
    identity: ["barcode", "title"],
    characteristicFields: [
      "pageCount",
      "authors",
      "publishers",
      "releaseDate",
      "description",
      "imageUrl",
    ],
  },
  boardgames: {
    domain: "tabletop",
    identity: ["barcode", "title"],
    characteristicFields: [
      "duration",
      "releaseDate",
      "description",
      "imageUrl",
      "authors",
      "publishers",
    ],
  },
  tcg: {
    domain: "cards",
    identity: ["printKey", "title"],
    characteristicFields: [
      "imageUrl",
      "regionalTitles",
      "aliases",
      "externalIds",
    ],
  },
  toys: {
    domain: "toys",
    identity: ["barcode", "title"],
    characteristicFields: ["releaseDate", "description", "imageUrl", "authors"],
  },
};

// ---------------------------------------------------------------------------
// Zod — identité d'exemplaire + noyau metadata (pas un dump Prisma).
// ---------------------------------------------------------------------------

const languageCodeSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z]{2}([a-z]{2})?$/, "code langue attendu (ex. fr, ja, enus)");

/**
 * Ce qui distingue *cet* exemplaire dans une étagère — pas la fiche catalogue.
 * `barcode` et `printKey` coexistent volontairement (colonnes distinctes).
 */
export const coreItemIdentitySchema = z.object({
  name: z.string().trim().min(1, "name requis"),
  barcode: z.string().trim().min(1).nullable().optional(),
  printKey: z.string().trim().min(1).nullable().optional(),
  variant: z.string().trim().min(1).nullable().optional(),
  language: languageCodeSchema.nullable().optional(),
  condition: z.enum(ITEM_CONDITIONS),
});

export type CoreItemIdentity = z.infer<typeof coreItemIdentitySchema>;

/** Champs catalogue partagés — volontairement loose (providers partiels OK). */
export const coreMetadataSchema = z
  .object({
    title: z.string().trim().min(1).optional(),
    platformKey: z.string().trim().min(1).optional(),
    barcode: z.string().trim().min(1).nullable().optional(),
    description: z.string().optional(),
    releaseDate: z.string().optional(),
    imageUrl: z.string().optional(),
    heroImageUrl: z.string().optional(),
    duration: z.number().nonnegative().optional(),
    pageCount: z.number().int().positive().optional(),
    tracksCount: z.number().int().positive().optional(),
    aliases: z.array(z.string()).optional(),
  })
  .loose();

export type CoreMetadata = z.infer<typeof coreMetadataSchema>;

/**
 * Valide l'identité d'un exemplaire. Ne refuse pas l'absence de barcode/
 * printKey (vide honnête / titre seul) — encode seulement la forme.
 */
export function parseCoreItemIdentity(input: unknown): CoreItemIdentity {
  return coreItemIdentitySchema.parse(input);
}

export function safeParseCoreItemIdentity(input: unknown) {
  return coreItemIdentitySchema.safeParse(input);
}
