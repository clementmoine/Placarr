export function cleanCode(barcode?: string | null): string {
  if (!barcode) return "";

  return barcode.replace(/[^\d]/g, "").trim();
}

export function detectPlatformKey(name: string): string | null {
  const lower = name.toLowerCase().replace(/[._-]+/g, " ");
  const has = (pattern: RegExp) => pattern.test(lower);

  // 1. Nintendo
  if (has(/\bwii\s*u\b|\bwiiu\b/)) return "wiiu";
  if (has(/\bwii\b/)) return "wii";
  if (has(/\bnintendo\s+switch\b|\bswitch\b/))
    return "switch";
  if (
    has(/\bgamecube\b/) ||
    has(/\bgame\s+cube\b/) ||
    has(/\bgcn\b/)
  )
    return "gamecube";
  if (has(/\bn64\b|\bnintendo\s+64\b/)) return "n64";
  if (
    has(/\bsuper\s+nintendo\b/) ||
    has(/\bsnes\b/) ||
    has(/\bsuper\s+nes\b/)
  )
    return "snes";
  if (
    has(/\bnintendo\s+nes\b/) ||
    has(/\bnes\b/) ||
    has(/\bnintendo\s+entertainment\s+system\b/)
  )
    return "nes";
  if (has(/\bnintendo\s+3ds\b|\b3ds\b/)) return "3ds";
  if (has(/\bnintendo\s+ds\b|\bnds\b|\bds\b/)) return "ds";
  if (has(/\bgame\s+boy\s+advance\b|\bgba\b/)) return "gba";
  if (has(/\bgame\s+boy\s+color\b|\bgbc\b/)) return "gbc";
  if (
    has(/\bgame\s+boy\b/) ||
    has(/\bgameboy\b/) ||
    has(/\bgb\b/)
  )
    return "gb";

  // 2. PlayStation
  if (has(/\bplaystation\s+5\b|\bps5\b/)) return "ps5";
  if (has(/\bplaystation\s+4\b|\bps4\b/)) return "ps4";
  if (has(/\bplaystation\s+3\b|\bps3\b/)) return "ps3";
  if (has(/\bplaystation\s+2\b|\bps2\b/)) return "ps2";
  if (has(/\bplaystation\s+portable\b|\bpsp\b/))
    return "psp";
  if (
    has(/\bplaystation\s+vita\b/) ||
    has(/\bps\s+vita\b/) ||
    has(/\bvita\b/)
  )
    return "psvita";
  if (
    has(/\bplaystation\s+1\b/) ||
    has(/\bps1\b/) ||
    has(/\bpsone\b/)
  )
    return "ps1";
  if (/\bplaystation\b/i.test(lower)) return "ps1";

  // 3. Xbox
  if (
    has(/\bxbox\s+series\b/) ||
    has(/\bxbox\s+sx\b/) ||
    has(/\bxbox\s+s\/x\b/)
  )
    return "xboxseries";
  if (has(/\bxbox\s+one\b|\bxboxone\b/)) return "xboxone";
  if (has(/\bxbox\s+360\b|\bxbox360\b/)) return "xbox360";
  if (
    has(/\bxbox\s+original\b/) ||
    has(/\bxbox\s+1\b/) ||
    has(/\bxbox1\b/)
  )
    return "xbox";
  if (/\bxbox\b/i.test(lower)) return "xbox";

  // 4. Sega & Retro
  if (has(/\bdreamcast\b/)) return "dreamcast";
  if (
    has(/\bmega\s+drive\b/) ||
    has(/\bmegadrive\b/) ||
    has(/\bgenesis\b/)
  )
    return "megadrive";
  if (has(/\bmaster\s+system\b|\bmastersystem\b/))
    return "mastersystem";
  if (has(/\bgame\s+gear\b|\bgamegear\b/))
    return "gamegear";
  if (has(/\bneo\s+geo\b|\bneogeo\b/)) return "neogeo";
  if (
    has(/\batari\s+2600\b/) ||
    has(/\batari2600\b/) ||
    has(/\batari\b/)
  )
    return "atari2600";

  return null;
}

export function guessBestShelf(
  productTitle: string,
  shelves: { id: string; name: string; type: string }[],
): { shelfId: string; isGuessed: boolean } | null {
  if (!productTitle || !shelves || shelves.length === 0) return null;

  const titlePlatformKey = detectPlatformKey(productTitle);
  if (titlePlatformKey) {
    // Look for a shelf of type 'games' that matches this platform key
    const matchingShelf = shelves.find((shelf) => {
      if (shelf.type !== "games") return false;
      const shelfPlatformKey = detectPlatformKey(shelf.name);
      return shelfPlatformKey === titlePlatformKey;
    });

    if (matchingShelf) {
      return { shelfId: matchingShelf.id, isGuessed: true };
    }
  }

  // 2. If no platform match, try simple substring containment for category keyword matching.
  const titleLower = productTitle.toLowerCase();
  for (const shelf of shelves) {
    const shelfNameLower = shelf.name.toLowerCase().trim();
    // Ignore extremely short or generic shelf names
    if (
      shelfNameLower.length >= 3 &&
      ![
        "jeux",
        "games",
        "livres",
        "books",
        "films",
        "movies",
        "musics",
        "music",
      ].includes(shelfNameLower)
    ) {
      if (
        titleLower.includes(shelfNameLower) ||
        shelfNameLower.includes(titleLower)
      ) {
        return { shelfId: shelf.id, isGuessed: true };
      }
    }
  }

  return null;
}

export function guessShelfByPlatformKey(
  platformKey: string | null | undefined,
  shelves: { id: string; name: string; type: string }[],
): { shelfId: string; isGuessed: boolean } | null {
  if (!platformKey || !shelves || shelves.length === 0) return null;

  const matchingShelf = shelves.find((shelf) => {
    if (shelf.type !== "games") return false;
    return detectPlatformKey(shelf.name) === platformKey;
  });

  return matchingShelf ? { shelfId: matchingShelf.id, isGuessed: true } : null;
}
