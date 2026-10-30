/**
 * Card face path remaps at serve time.
 *
 * Two layouts coexist:
 * - Lang-first (canonical URL / Dragon Ball / Naruto after cutover):
 *   `cards/{lang}/{set}/{card}/…`
 * - Set-first (Pokémon Live dumps still on disk):
 *   `cards/{set}/{lang}/{card}/…`
 *
 * Remap both ways so stale sqlite rows and client `assetsCardUrl` keep
 * rendering without a mass rewrite.
 */

const ASSET_LANGS = new Set([
  "fr",
  "en",
  "ja",
  "jp",
  "de",
  "it",
  "es",
  "pt",
  "pt-br",
  "ptbr",
  "ko",
  "zh",
  "zh-cn",
  "zh-tw",
  "nl",
  "pl",
  "ru",
]);

function isAssetLang(segment: string): boolean {
  return ASSET_LANGS.has(segment.trim().toLowerCase());
}

/**
 * `cards/{set}/{lang}/{card}/file…` → `cards/{lang}/{set}/{card}/file…`.
 * Returns `null` when already lang-first or the shape is not a card face path.
 */
export function legacySetFirstCardsRest(
  rest: readonly string[],
): string[] | null {
  if (rest.length < 5 || rest[0] !== "cards") return null;
  const set = rest[1]!;
  const lang = rest[2]!;
  const card = rest[3]!;
  if (!isAssetLang(lang)) return null;
  if (isAssetLang(set)) return null;
  return ["cards", lang.toLowerCase(), set, card, ...rest.slice(4)];
}

/**
 * `cards/{lang}/{set}/{card}/file…` → `cards/{set}/{lang}/{card}/file…`.
 * Pokémon Live still writes set-first on disk while URLs are lang-first.
 */
export function legacyLangFirstCardsRest(
  rest: readonly string[],
): string[] | null {
  if (rest.length < 5 || rest[0] !== "cards") return null;
  const lang = rest[1]!;
  const set = rest[2]!;
  const card = rest[3]!;
  if (!isAssetLang(lang)) return null;
  if (isAssetLang(set)) return null;
  return ["cards", set, lang.toLowerCase(), card, ...rest.slice(4)];
}

/**
 * Extra Pokémon candidates when the requested locale folder is empty.
 *
 * Live prune often keeps EN only while playroom seeds ask for `fr`. Also try
 * plate aliases (`mask.webp` ↔ `mask-ph.webp`) so a missing whiteplate name
 * does not 404 the whole foil init.
 */
export function pokemonCardsRestFallbacks(
  rest: readonly string[],
): string[][] {
  if (rest.length < 5 || rest[0] !== "cards") return [];
  const a = rest[1]!;
  const b = rest[2]!;
  const card = rest[3]!;
  const file = rest[4]!;
  const tail = rest.slice(5);

  let lang: string;
  let set: string;
  let order: "lang-first" | "set-first";
  if (isAssetLang(a) && !isAssetLang(b)) {
    lang = a.toLowerCase();
    set = b;
    order = "lang-first";
  } else if (!isAssetLang(a) && isAssetLang(b)) {
    set = a;
    lang = b.toLowerCase();
    order = "set-first";
  } else {
    return [];
  }

  const files = pokemonFaceFileFallbacks(file);
  const langs =
    lang === "en" ? ["en"] : [lang, "en"].filter((v, i, all) => all.indexOf(v) === i);

  const out: string[][] = [];
  const seen = new Set<string>();
  const push = (parts: string[]) => {
    const key = parts.join("/");
    if (seen.has(key)) return;
    seen.add(key);
    out.push(parts);
  };

  for (const code of langs) {
    for (const name of files) {
      if (order === "lang-first") {
        push(["cards", code, set, card, name, ...tail]);
        push(["cards", set, code, card, name, ...tail]);
      } else {
        push(["cards", set, code, card, name, ...tail]);
        push(["cards", code, set, card, name, ...tail]);
      }
    }
  }
  return out;
}

function pokemonFaceFileFallbacks(file: string): string[] {
  const base = file.trim();
  if (!base) return [];
  const low = base.toLowerCase();
  const alts: string[] = [base];
  if (low === "mask.webp") {
    alts.push("mask-ph.webp", "mask-mph.webp", "mask-sph.webp");
  } else if (/^mask-(ph|mph|sph)\.webp$/i.test(low)) {
    alts.push("mask.webp");
  }
  return alts;
}
