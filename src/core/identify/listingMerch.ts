/**
 * Merch / non-book listing signals — structural patterns, not open product
 * vocabulary. Device-case compounds, toy brands (closed factual), controllers.
 *
 * Shelf-aware: controllers are identity on `hardware`; toy brands on `toys`;
 * TCG SKUs on `tcg`. Elsewhere they remain noise (game shelves especially).
 *
 * @see docs/word_list_audit.md
 */
import { normalizeForTokens } from "@/core/enrich/titles/normalize";
import {
  detectVideoGamePlatformKey,
  getVideoGamePlatform,
  normalizeVideoGamePlatformText,
} from "@/core/identify/platforms/platforms";

export type MerchShelfContext = {
  shelfType?: string | null;
};

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

/**
 * Controllers / pads — one closed merch class (identity on hardware shelves).
 * Shared by accessory gates, console-bundle detection, and "+ manette" strips.
 */
export const CONTROLLER_RE =
  /\b(?:manettes?|controllers?|joy[\s-]?cons?|dualsense|dualshock|gamepads?)\b/i;

export function listingLooksLikeControllerProduct(name: string): boolean {
  return CONTROLLER_RE.test(normalizeForTokens(name));
}

/** Catalog chrome naming a console/system SKU (not a pad). */
const CONSOLE_SYSTEM_PRODUCT_RE = /\b(?:console|system|systems)\b/i;

/**
 * Bundle connectors that attach an accessory clause to a primary product —
 * including FR marketplace dash clauses ("Nintendo NES - Manette Gris").
 */
const BUNDLE_CONNECTOR_SPLIT_RE =
  /\b(?:with|avec|\+|et)\b|(?:\s[-–—]\s*(?=manettes?|controllers?|joy[\s-]?cons?|dualsense|dualshock|gamepads?))/i;

/**
 * Pad product-class nouns. Joy-Con is excluded: Switch console SKUs often end
 * with Joy-Con color without meaning a pad-only listing.
 */
const CONTROLLER_PRODUCT_NOUN_RE =
  /\b(?:manettes?|controllers?|gamepads?|dualsense|dualshock)\b/i;

/**
 * Console/system SKU, including bundles where a pad clause follows a connector
 * ("Switch with Gray Joy-Con", "NES - Manette Gris").
 */
export function listingLooksLikeConsoleSystemProduct(name: string): boolean {
  const n = normalizeForTokens(name);
  if (!n) return false;
  if (CONSOLE_SYSTEM_PRODUCT_RE.test(n)) return true;
  const parts = n.split(BUNDLE_CONNECTOR_SPLIT_RE);
  if (parts.length < 2) return false;
  return parts.slice(1).some((part) => CONTROLLER_RE.test(part));
}

/**
 * Shelf shorthand that names a platform + included pads without a "with"
 * connector ("Nintendo Switch Joycon Gris" ≡ console bundle, not pad-only).
 * Pad-only / pad-primary titles ("Joy-Con Gray", "Manette DualSense PS5",
 * "GameCube Controller") stay controller products.
 */
export function listingLooksLikePlatformControllerBundle(
  name: string,
): boolean {
  if (!listingLooksLikeControllerProduct(name)) return false;
  if (listingLooksLikeConsoleSystemProduct(name)) return true;

  const normalized = normalizeForTokens(name);
  const tokens = normalized.split(/\s+/).filter(Boolean);
  // Pad-primary titles lead with the controller class ("Manette DualSense PS5").
  if (tokens[0] && CONTROLLER_RE.test(tokens[0])) return false;
  // "GameCube Controller" / "NES Manette" — pad noun is the product, platform
  // is context. Console + included-pad bundles use a connector / "console".
  if (CONTROLLER_PRODUCT_NOUN_RE.test(normalized)) return false;

  const platformKey = detectVideoGamePlatformKey(name);
  if (!platformKey) return false;
  const platform = getVideoGamePlatform(platformKey);
  if (!platform) return false;

  const coreTokens = tokens.filter((token) => {
    if (CONTROLLER_RE.test(token)) return false;
    // Finish / brand chrome around console SKUs.
    if (
      /^(nintendo|sony|microsoft|sega|atari|black|white|silver|gray|grey|gris|grise|blue|bleu|bleue|pink|rose|noir|noire|blanc|blanche)$/i.test(
        token,
      )
    ) {
      return false;
    }
    return true;
  });
  const core = coreTokens.join(" ");
  if (!core) return false;
  const normalizedCore = normalizeVideoGamePlatformText(core);
  return platform.aliases.some(
    (alias) => normalizeVideoGamePlatformText(alias) === normalizedCore,
  );
}

/**
 * On a hardware shelf, a controller listing is an accessory when the request
 * is a console/system (no pad tokens) — e.g. GameCube Black ≠ Controller Black.
 * DualSense / pad items keep controllers as identity. Console SKUs that merely
 * include a pad ("NES - Manette Gris", "Switch with Joy-Con") are not accessories.
 */
export function listingAddsUnrequestedControllerAccessory(
  requestTitle: string,
  candidateTitle: string,
  options?: MerchShelfContext,
): boolean {
  if (options?.shelfType !== "hardware") return false;
  if (!listingLooksLikeControllerProduct(candidateTitle)) return false;
  if (listingLooksLikeControllerProduct(requestTitle)) return false;
  if (listingLooksLikeConsoleSystemProduct(candidateTitle)) return false;
  if (listingLooksLikePlatformControllerBundle(candidateTitle)) return false;
  return true;
}

/**
 * Inverse: pad-only request must not match a console/system SKU.
 * Platform + pad shelf names ("Switch Joycon Gris") are console bundles.
 */
export function listingAddsUnrequestedConsoleSystem(
  requestTitle: string,
  candidateTitle: string,
  options?: MerchShelfContext,
): boolean {
  if (options?.shelfType !== "hardware") return false;
  if (!listingLooksLikeControllerProduct(requestTitle)) return false;
  if (listingLooksLikePlatformControllerBundle(requestTitle)) return false;
  if (listingLooksLikeConsoleSystemProduct(candidateTitle)) return true;
  if (
    !listingLooksLikeControllerProduct(candidateTitle) &&
    !listingLooksLikeConsoleSystemProduct(requestTitle)
  ) {
    return true;
  }
  return false;
}

/** Print merch glued onto a franchise title — never shelf identity. */
const PRINT_MERCH_RE = /\b(?:poster|affiche)\b/i;

/** TCG / booster SKUs — product-type markers, not title vocabulary. */
const TCG_OR_FIGURE_SKU_RE =
  /\b(?:booster|tcg|trading\s+cards?|etb|elite\s+trainer|playmat|deck|figurine|figure|statue|goodies|merchandising|merch|cartes?)\b/i;

/** Companion media that is accessory on a game shelf. */
const GAME_COMPANION_RE =
  /\b(?:artbook|soundtrack|ost|guide|vinyl|vinyle|\d+lp)\b/i;

/**
 * Console repair / dock / charging peripherals — never the console SKU itself.
 * Structural product-type markers (kit + restoration, capacitor, dock family).
 */
const HARDWARE_PERIPHERAL_OR_REPAIR_RE =
  /\b(?:kit\s+(?:restauration|restoration|recap|repar)|restauration\s+condensateur|restoration\s+capacitor|condensateurs?|capacitors?|station\s+d['’]?accueil|docking\s+station|usb\s+dock|\bdock\b|chargeur|charging\s+station|stand\s+de\s+charge|plug\s+and\s+play\s+uasp)\b/i;

/**
 * Board-game category chrome: "escape game" / "jeu d'enquête" compositions,
 * not an open list of title words.
 */
export const BOARDGAME_CATEGORY_CHROME_RE =
  /(?:(?:jeu\s+d['']?\s*)?(?:d['']?\s*)?escape\s+game|jeu\s+d['']?\s*enqu[eê]te)/i;

/**
 * After "+ / et / avec / sans", strip a trailing controller-family clause.
 * Alias of CONTROLLER_RE — one pad class, no parallel peripheral word list.
 */
export const BUNDLE_PERIPHERAL_RE = CONTROLLER_RE;

function acceptsControllers(shelfType?: string | null): boolean {
  return shelfType === "hardware";
}

function acceptsToyFigures(shelfType?: string | null): boolean {
  return shelfType === "toys";
}

function acceptsTcgSkus(shelfType?: string | null): boolean {
  return shelfType === "tcg";
}

export function listingLooksLikeMerchAccessory(
  name: string,
  options?: MerchShelfContext,
): boolean {
  const n = normalizeForTokens(name);
  if (!n) return false;

  if (
    DEVICE_CASE_RE.test(n) ||
    FRENCH_CASE_NOUN_RE.test(n) ||
    EMPTY_OR_CUSTOM_CASE_RE.test(n) ||
    PRINT_MERCH_RE.test(n) ||
    HARDWARE_PERIPHERAL_OR_REPAIR_RE.test(n)
  ) {
    return true;
  }

  if (TOY_FIGURE_BRAND_RE.test(n) && !acceptsToyFigures(options?.shelfType)) {
    return true;
  }

  if (CONTROLLER_RE.test(n) && !acceptsControllers(options?.shelfType)) {
    return true;
  }

  return false;
}

export function listingLooksLikeNonBookProduct(
  name: string,
  options?: MerchShelfContext,
): boolean {
  const n = normalizeForTokens(name);
  if (!n) return false;
  if (listingLooksLikeMerchAccessory(name, options)) return true;
  if (TCG_OR_FIGURE_SKU_RE.test(n) && !acceptsTcgSkus(options?.shelfType)) {
    return true;
  }
  return false;
}

export function listingLooksLikeGameAccessory(
  name: string,
  options?: MerchShelfContext,
): boolean {
  const n = normalizeForTokens(name);
  if (!n) return false;
  if (listingLooksLikeNonBookProduct(name, options)) return true;
  return GAME_COMPANION_RE.test(n);
}
