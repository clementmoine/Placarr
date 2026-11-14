/**
 * Client-safe Live identity lookups.
 *
 * Default stubs return null (browser / no sqlite). Server code imports
 * {@link ./liveCardsIndex} which installs the real SQLite-backed impl.
 * Keeps `node:fs` / `node:sqlite` out of the client webpack graph.
 */

export type LiveCardRow = {
  bundleStem: string;
  liveSet: string;
  num: number;
  lang: string;
  variant: string;
  longFormId: string;
  cardId: string | null;
  nameEn: string | null;
  nameFr: string | null;
  collectorNum: string | null;
  foilEffect: string | null;
  foilMask: string | null;
  rarityCode: string | null;
  setCode: string | null;
};

export type LiveCardsLookups = {
  lookupByBundle: (
    bundleStem: string,
    opts?: { variant?: string; dbPath?: string },
  ) => LiveCardRow | null;
  lookupBySetNum: (
    liveSet: string,
    num: number | string,
    opts?: { lang?: string; variant?: string; dbPath?: string },
  ) => LiveCardRow | null;
  lookupByName: (
    liveSets: readonly string[],
    cardName: string,
    opts?: { lang?: string; dbPath?: string },
  ) => LiveCardRow | null;
  liveCardsIndexAvailable: (dbPath?: string) => boolean;
};

const stubs: LiveCardsLookups = {
  lookupByBundle: () => null,
  lookupBySetNum: () => null,
  lookupByName: () => null,
  liveCardsIndexAvailable: () => false,
};

let impl: LiveCardsLookups = stubs;

/** Wire SQLite lookups (called from liveCardsIndex on the server). */
export function installLiveCardsLookups(next: LiveCardsLookups): void {
  impl = next;
}

/** Test helper — restore null stubs. */
export function resetLiveCardsLookups(): void {
  impl = stubs;
}

export function lookupByBundle(
  ...args: Parameters<LiveCardsLookups["lookupByBundle"]>
): LiveCardRow | null {
  return impl.lookupByBundle(...args);
}

export function lookupBySetNum(
  ...args: Parameters<LiveCardsLookups["lookupBySetNum"]>
): LiveCardRow | null {
  return impl.lookupBySetNum(...args);
}

export function lookupByName(
  ...args: Parameters<LiveCardsLookups["lookupByName"]>
): LiveCardRow | null {
  return impl.lookupByName(...args);
}

export function liveCardsIndexAvailable(dbPath?: string): boolean {
  return impl.liveCardsIndexAvailable(dbPath);
}
