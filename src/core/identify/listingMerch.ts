/**
 * Merch / non-book listing signals — structural patterns, not open product
 * vocabulary. Device-case compounds, toy brands (closed factual), controllers.
 *
 * @see docs/word_list_audit.md
 */
import { normalizeForTokens } from "@/core/enrich/titles/normalize";

/** Phone/tablet case sold with a franchise print — never the shelf media. */
const DEVICE_CASE_RE =
  /\b(?:coque|housse|etui|fourreau|sleeve|skin)\b[\s\S]{0,48}\b(?:ipod|iphone|ipad)\b|\b(?:ipod|iphone|ipad)\b[\s\S]{0,48}\b(?:coque|housse|etui|sleeve|skin|case)\b/i;

/**
 * French case/sleeve nouns as product-type markers (rarely integral titles).
 * English bare "case" stays compound-only (empty/custom/device) to avoid
 * false hits on game titles.
 */
const FRENCH_CASE_NOUN_RE = /\b(?:coque|housse|etui|fourreau)\b/i;

/** Empty / custom / steel replacement shell. */
const EMPTY_OR_CUSTOM_CASE_RE =
  /\b(?:empty|replacement|custom|vierge|personnalise)\s+case\b|\bboitier\s+vierge\b|\bsteelbook\b/i;

/**
 * Construction / figure brands — closed real-world brand taxonomy (like
 * publishers), not guessed product words.
 */
const TOY_FIGURE_BRAND_RE =
  /\b(?:lego|playmobil|funko|nendoroid|amiibo|fun\s*ko)\b/i;

/** Controllers / print merch glued onto a franchise title. */
const CONTROLLER_OR_PRINT_RE =
  /\b(?:manette|controller|joycon|poster|affiche)\b/i;

/** TCG / booster SKUs — product-type markers, not title vocabulary. */
const TCG_OR_FIGURE_SKU_RE =
  /\b(?:booster|tcg|trading\s+cards?|etb|elite\s+trainer|playmat|deck|figurine|figure|statue|goodies|merchandising|merch|cartes?)\b/i;

/** Companion media that is accessory on a game shelf. */
const GAME_COMPANION_RE =
  /\b(?:artbook|soundtrack|ost|guide|vinyl|vinyle|\d+lp)\b/i;

/**
 * Board-game category chrome: "escape game" / "jeu d'enquête" compositions,
 * not an open list of title words.
 */
export const BOARDGAME_CATEGORY_CHROME_RE =
  /(?:(?:jeu\s+d['']?\s*)?(?:d['']?\s*)?escape\s+game|jeu\s+d['']?\s*enqu[eê]te)/i;

/**
 * Bundle peripherals after "+ / et / avec" — controller / packaging family.
 */
export const BUNDLE_PERIPHERAL_TOKENS = [
  "manette",
  "controller",
  "volant",
  "wheel",
  "gun",
  "zapper",
  "fusil",
  "notice",
] as const;

export const BUNDLE_PERIPHERAL_RE = new RegExp(
  `(?:${BUNDLE_PERIPHERAL_TOKENS.join("|")}|wii\\s+wheel)`,
  "i",
);

/** Phrases for display-title noise scoring (same chrome as the strip regex). */
export const BOARDGAME_CATEGORY_DISPLAY_NOISE = [
  "escape game",
  "jeu d enquete",
  "jeu d'enquete",
] as const;

export function listingLooksLikeMerchAccessory(name: string): boolean {
  const n = normalizeForTokens(name);
  if (!n) return false;
  return (
    DEVICE_CASE_RE.test(n) ||
    FRENCH_CASE_NOUN_RE.test(n) ||
    EMPTY_OR_CUSTOM_CASE_RE.test(n) ||
    TOY_FIGURE_BRAND_RE.test(n) ||
    CONTROLLER_OR_PRINT_RE.test(n)
  );
}

export function listingLooksLikeNonBookProduct(name: string): boolean {
  const n = normalizeForTokens(name);
  if (!n) return false;
  if (listingLooksLikeMerchAccessory(name)) return true;
  return TCG_OR_FIGURE_SKU_RE.test(n);
}

export function listingLooksLikeGameAccessory(name: string): boolean {
  const n = normalizeForTokens(name);
  if (!n) return false;
  if (listingLooksLikeNonBookProduct(name)) return true;
  return GAME_COMPANION_RE.test(n);
}
