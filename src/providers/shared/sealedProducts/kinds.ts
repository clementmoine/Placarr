/**
 * Sealed SKU kinds the catalogue shows — retail product families, not the
 * host's nav slugs alone.
 *
 * Hierarchy (containers):
 *   booster → blister → display → case
 *   blister_case = shipping case of many blisters (not FR « blister carton »
 *   = single sleeved booster on cardboard)
 *   deck → deck_bundle (plusieurs decks distincts, ex. Naruto pack-découverte)
 *   multipack = N boosters ± promo (duopack / double-pack / tripack)
 *
 * `coffret` remains the catch-all when the category/title is unknown.
 * `puzzle` is merch with a **guaranteed promo insert** (not accessories).
 * `ephemera` is printed matter with **no cards** (sell sheet, poster).
 */
import { tcgCardsCategoryRole } from "@/providers/shared/tcgcards/sites";

export const SEALED_KINDS = [
  "booster",
  "blister",
  "display",
  "case",
  "blister_case",
  "deck",
  "deck_bundle",
  "multipack",
  "tin",
  "etb",
  "trove",
  "collector_box",
  "quest",
  "prerelease",
  "special",
  "puzzle",
  "coffret",
  "ephemera",
] as const;

export type SealedKind = (typeof SEALED_KINDS)[number];

export type SealedBehavior =
  | "random_pack"
  | "pack_container"
  | "known_bundle"
  | "mixed_bundle"
  | "no_cards";

export function isSealedKind(value: string): value is SealedKind {
  return (SEALED_KINDS as readonly string[]).includes(value);
}

/** Map TCG Cards `/products/{category}` onto a catalogue kind. */
export function sealedKindForCategory(category: string): SealedKind | null {
  if (tcgCardsCategoryRole(category) === "skip") return null;
  if (category === "puzzles") return "puzzle";
  if (category === "displays") return "display";
  if (category === "boosters") return "booster";
  if (category === "boosters-blister") return "blister";
  if (category === "decks" || category.endsWith("-decks")) return "deck";
  if (category === "double-packs" || category === "tripacks") {
    return "multipack";
  }
  if (category === "tins" || category === "minitins") return "tin";
  if (category === "elite-trainer") return "etb";
  if (category === "trove-packs") return "trove";
  if (category === "collector-boxes" || category === "pokebox") {
    return "collector_box";
  }
  if (category === "illumineers-quest") return "quest";
  if (category === "prerelease-packs") return "prerelease";
  if (category === "special-packs") return "special";
  return "coffret";
}

/**
 * Refine kind from category + slug/name heuristics.
 *
 * Used at ingest and when reading legacy indexes that still say `coffret`
 * for troves / duopacks / blister cartons.
 */
export function refineSealedKind(input: {
  category?: string | null;
  slug?: string | null;
  name?: string | null;
  /** Existing kind from index / curated ledger (may be legacy `coffret`). */
  kind?: string | null;
}): SealedKind | null {
  const slug = (input.slug ?? "").trim().toLowerCase();
  const name = (input.name ?? "").trim().toLowerCase();
  const hay = `${slug} ${name}`;
  const fromCat = input.category
    ? sealedKindForCategory(input.category)
    : null;
  const existing =
    input.kind && isSealedKind(input.kind) ? input.kind : null;

  // Strong title/slug signals win over a stale coffret / booster.
  /*
    Illumineer's Quest before trove / decks category — official IQ packshots
    were minted as `*-trove` with byKind ×8 boosters.
  */
  if (
    /illumineer'?s?\s*quest|qu[eê]te\s+des\s+illumineurs|\/iq\d/.test(hay) ||
    /great-hunny-rescue|deep-trouble|palace-heist/.test(slug)
  ) {
    return "quest";
  }
  /*
    Gift box / `*-collector_box` before category `decks` — otherwise soft-migrate
    turns a 5-booster coffret into a known_bundle « deck » (promo only).
  */
  if (
    /gift[\s_-]*box|coffret[\s_-]*cadeau|gift[-_]?set|\bgiftset\b/.test(hay) ||
    /-collector_box(?:-|$)/.test(slug)
  ) {
    return "collector_box";
  }
  /*
    Shipping case of many blisters — NOT French retail « blister carton »
    / slug `booster-blister-carton-*` (one sleeved booster, ~booster price).
    Those used to become blister_case ×24 and bury real displays in buy advice.
  */
  if (
    /carton\s+de\s+\d+\s*blisters?|blisters?\s*case|case\s+of\s+\d+\s*blisters?/i.test(
      hay,
    )
  ) {
    return "blister_case";
  }
  if (
    /\b(shipping[\s_-]*case|factory[\s_-]*case|casier)\b/.test(hay) ||
    (/\bcase\b/.test(hay) && /\bdisplays?\b/.test(hay))
  ) {
    return "case";
  }
  if (
    slug === "pack-decouverte" ||
    /pack-decouverte|dual[\s_-]*deck|twin[\s_-]*deck|deux[\s_-]*decks|battle[\s_-]*arena|40\+40/.test(
      hay,
    )
  ) {
    return "deck_bundle";
  }
  if (
    slug.startsWith("duopack") ||
    /\bduopack\b|double[\s_-]*packs?|tripacks?|tri[\s_-]*packs?/.test(hay)
  ) {
    return "multipack";
  }
  // After multipack: FR « blister carton » / boosters-blister = one sleeved pack.
  if (
    /blister[\s_-]*carton|blister-carton|carton[\s_-]*blister/.test(hay) ||
    input.category === "boosters-blister"
  ) {
    return "blister";
  }
  if (
    slug.startsWith("tin-box") ||
    slug.startsWith("tin-") ||
    /\btin[\s_-]*box\b|\bminitins?\b/.test(hay)
  ) {
    // Keep explicit curated kinds that are already more specific.
    if (
      existing &&
      existing !== "coffret" &&
      existing !== "collector_box" &&
      existing !== "booster"
    ) {
      return existing;
    }
    return "tin";
  }

  if (fromCat && fromCat !== "coffret") return fromCat;
  if (existing) return existing;
  return fromCat;
}

export function sealedBehaviorForKind(kind: SealedKind): SealedBehavior {
  switch (kind) {
    case "booster":
      return "random_pack";
    case "blister":
      // FR « blister carton » = packaging autour d'1 booster → container ×1.
      // (blister_case = casier de N blisters, souvent ×24.)
      return "pack_container";
    case "display":
    case "case":
    case "blister_case":
      return "pack_container";
    case "deck":
      return "known_bundle";
    case "deck_bundle":
      // Several decks ± boosters (Naruto pack-découverte) — decks guaranteed,
      // sachets stay a lottery on the child boosters.
      return "mixed_bundle";
    case "multipack":
    case "tin":
    case "etb":
    case "trove":
    case "collector_box":
    case "quest":
    case "prerelease":
    case "special":
    case "coffret":
      return "mixed_bundle";
    case "puzzle":
      // Promo insert only (no boosters) — contents come from curated ledger.
      return "known_bundle";
    case "ephemera":
      return "no_cards";
  }
}

/** Pack / case / random face — never a known card list. */
export function sealedKindIsOpaqueContents(kind: SealedKind): boolean {
  return (
    kind === "booster" ||
    kind === "blister" ||
    kind === "display" ||
    kind === "case" ||
    kind === "blister_case" ||
    kind === "ephemera"
  );
}

/**
 * A booster / display is never "I know these cards", and a sell sheet has
 * none to know. A deck or exclusive box is known when the fiche is not a
 * labelled preview and lists prints.
 */
export function sealedContentsKnown(input: {
  kind: SealedKind;
  containsPrintsIsPreview: boolean;
  printCount: number;
}): boolean {
  if (sealedKindIsOpaqueContents(input.kind)) return false;
  return !input.containsPrintsIsPreview && input.printCount > 0;
}

/** Apply refine + matching behavior on a stored entry (soft migrate). */
export function withRefinedSealedKind<
  T extends {
    kind: SealedKind;
    behavior: SealedBehavior;
    category: string;
    slug: string;
    name: string | null;
    packsContained?: number | null;
    packsBySet?: Record<string, number> | null;
  },
>(entry: T): T {
  const kind =
    refineSealedKind({
      category: entry.category,
      slug: entry.slug,
      name: entry.name,
      kind: entry.kind,
    }) ?? entry.kind;
  /*
    Opaque kinds always re-derive behavior — stale `mixed_bundle` on a blister
    (shop ingest) made buy advice treat preview tiles as guaranteed cards.
  */
  const behavior = sealedKindIsOpaqueContents(kind)
    ? sealedBehaviorForKind(kind)
    : kind !== entry.kind
      ? sealedBehaviorForKind(kind)
      : entry.behavior;
  if (kind === entry.kind && behavior === entry.behavior) return entry;
  const next: T = {
    ...entry,
    kind,
    behavior,
  };
  /*
    Demote mis-tagged FR « blister carton » (was blister_case ×24) so buy
    advice does not treat an 8 € sleeved booster as a display.
  */
  if (
    entry.kind === "blister_case" &&
    kind === "blister" &&
    (entry.packsContained ?? 0) > 1
  ) {
    next.packsContained = 1;
    next.packsBySet = null;
  }
  // Quest mis-minted as trove: drop byKind trove 8×12 lottery.
  if (entry.kind === "trove" && kind === "quest") {
    next.packsContained = null;
    next.packsBySet = null;
    if ("cardsPerPack" in next) {
      (next as { cardsPerPack?: number | null }).cardsPerPack = null;
    }
  }
  return next;
}

const KIND_LABEL_FR: Record<SealedKind, string> = {
  booster: "Booster",
  blister: "Blister",
  display: "Display",
  case: "Case",
  blister_case: "Carton blister",
  deck: "Deck",
  deck_bundle: "Pack multi-decks",
  multipack: "Multipack",
  tin: "Tin",
  etb: "Elite Trainer",
  trove: "Trove",
  collector_box: "Coffret",
  quest: "Quête",
  prerelease: "Avant-première",
  special: "Special",
  puzzle: "Puzzle",
  coffret: "Coffret",
  ephemera: "Éphémère",
};

const KIND_LABEL_EN: Record<SealedKind, string> = {
  booster: "Booster",
  blister: "Blister",
  display: "Display",
  case: "Case",
  blister_case: "Blister case",
  deck: "Deck",
  deck_bundle: "Multi-deck pack",
  multipack: "Multipack",
  tin: "Tin",
  etb: "Elite Trainer",
  trove: "Trove",
  collector_box: "Collection box",
  quest: "Quest",
  prerelease: "Prerelease",
  special: "Special",
  puzzle: "Puzzle",
  coffret: "Box",
  ephemera: "Ephemera",
};

export function sealedKindLabel(
  kind: SealedKind,
  locale: "fr" | "en" = "en",
): string {
  return locale === "fr" ? KIND_LABEL_FR[kind] : KIND_LABEL_EN[kind];
}

/** Sort order for Catalogue → Scellés grid. */
export const SEALED_KIND_ORDER: Record<SealedKind, number> = {
  deck: 0,
  deck_bundle: 1,
  booster: 2,
  blister: 3,
  multipack: 4,
  display: 5,
  blister_case: 6,
  case: 7,
  tin: 8,
  etb: 9,
  trove: 10,
  quest: 11,
  prerelease: 12,
  special: 13,
  puzzle: 14,
  collector_box: 15,
  coffret: 16,
  ephemera: 17,
};
