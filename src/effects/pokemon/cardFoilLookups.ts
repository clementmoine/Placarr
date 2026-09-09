/**
 * Per-print foil texture mapping — the **client-safe** face of it.
 *
 * This replaces a static `import cardsJson from "./cards.json"`, and the reason
 * is worth keeping: that file is a 10.7 MB Live dump with 41 546 entries, and
 * two `"use client"` components reach the pack that imported it. Webpack duly
 * tried to put the whole dump in the *browser* bundle — it never finished, and
 * the dev server accepted connections while compiling nothing, at 0 % CPU. The
 * page never logged `Compiling`. Swapping the 1.4 KB stub in made the same page
 * compile in 951 ms; that A/B is the whole diagnosis.
 *
 * SQLite does not merely fix that, it makes it unrepeatable: `node:sqlite`
 * cannot be bundled for a browser, so a client import fails loudly instead of
 * quietly dragging ten megabytes across the boundary. The same shape as
 * {@link ./liveCardsLookups} — stubs here, real implementation installed by
 * {@link ./cardFoilIndex} when something server-side loads it.
 *
 * A caller that gets `null` is on a client, or on a machine with no dump. Both
 * are ordinary: the playroom simply has no Live face to show.
 */

/** One printed variant's foil textures, as the dump records them. */
export type CardFoilVariant = {
  /** Live variant key: `std` (standard) or `ph` (reverse / parallel holo). */
  variant: "std" | "ph";
  cardTex: string;
  maskTex: string;
  etchTex: string;
  coldFoilTex: string;
  /** Raw Live `MaterialManifest` foil string. */
  foil: string;
  /** `.frag` stem the foil maps to (`Rainbow`, `SvUltra`, …). */
  shader: string;
};

export type CardFoilLookups = {
  /** Every dumped variant for one bundle id (`bw10_de_001`). */
  variantsForBundle: (bundleId: string) => CardFoilVariant[];
  /**
   * Bundles whose dump names this shader, newest-set-agnostic.
   *
   * Replaces a full `Object.entries(CARDS)` scan of 41 546 entries — the
   * playroom did that once per material to find faces to show.
   */
  bundlesForShader: (
    shader: string,
    opts?: { limit?: number },
  ) => { bundleId: string; variant: CardFoilVariant }[];
  /** Every dumped bundle id, sorted. */
  listBundleIds: () => string[];
  /** Distinct Live set stems (`bw10` from `bw10_de_001`), sorted. */
  listSetIds: () => string[];
  /** Whether a dump is actually present behind these lookups. */
  cardFoilIndexAvailable: (dbPath?: string) => boolean;
};

const stubs: CardFoilLookups = {
  variantsForBundle: () => [],
  bundlesForShader: () => [],
  listBundleIds: () => [],
  listSetIds: () => [],
  cardFoilIndexAvailable: () => false,
};

let impl: CardFoilLookups = stubs;

/** Wire SQLite lookups (called from `cardFoilIndex` on the server). */
export function installCardFoilLookups(next: CardFoilLookups): void {
  impl = next;
}

/** Test helper — restore empty stubs. */
export function resetCardFoilLookups(): void {
  impl = stubs;
}

export function variantsForBundle(bundleId: string): CardFoilVariant[] {
  return impl.variantsForBundle(bundleId);
}

export function bundlesForShader(
  shader: string,
  opts?: { limit?: number },
): { bundleId: string; variant: CardFoilVariant }[] {
  return impl.bundlesForShader(shader, opts);
}

export function listBundleIds(): string[] {
  return impl.listBundleIds();
}

export function listSetIds(): string[] {
  return impl.listSetIds();
}

export function cardFoilIndexAvailable(dbPath?: string): boolean {
  return impl.cardFoilIndexAvailable(dbPath);
}
