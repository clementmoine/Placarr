/**
 * Higher-resolution faces from dbscards.fr.
 *
 * Every other source in play serves the same 260x363 that Bandai publishes —
 * measured on the official `cardimg/` (its ceiling: `cardimg_l`, `card`,
 * `zoom` and `large` all 404), on the Deckplanet mirror this pack downloads
 * from, and on the Fandom wiki, which is those official scans re-uploaded in
 * 2018. dbscards.fr is the only one that carries 400x560, and it also has the
 * awakened side as `-back`.
 *
 * There is no id-addressable route to it: a bare code (`/cards/bt1-001`) 302s
 * to the index, the filter is a POST form behind a CSRF token, there is no
 * sitemap and pagination is XHR. What *is* stable is the slug their URLs are
 * built from, and we hold every part of it — code, rarity letters, printed
 * name. So we build the slug rather than crawl for it.
 *
 * Measured 39/40 on a random sample across sets. Misses are not an error:
 * `fetchFaces` keeps Deckplanet behind this.
 */

/** Ligatures NFKD drops entirely — `cœur` became `cur` and missed the file. */
const LIGATURES: ReadonlyArray<readonly [RegExp, string]> = [
  [/œ/g, "oe"],
  [/Œ/g, "OE"],
  [/æ/g, "ae"],
  [/Æ/g, "AE"],
  [/ß/g, "ss"],
];

/**
 * Their slug spells an apostrophe both ways across the corpus
 * (`vados-lassistante`, but `de-retour-de-l-enfer`), so both are offered and
 * the caller takes whichever answers.
 */
export function dbscardsNameSlug(
  name: string,
  opts: { apostropheAsSeparator?: boolean } = {},
): string {
  let value = name ?? "";
  for (const [pattern, replacement] of LIGATURES) {
    value = value.replace(pattern, replacement);
  }
  value = value.replace(/['’]/g, opts.apostropheAsSeparator ? " " : "");
  value = value.normalize("NFKD").replace(/[̀-ͯ]/g, "");
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** `Super Rare[SR]` → `sr`. The bracketed letters are what the slug carries. */
export function dbscardsRarityCode(rarity: string | null | undefined): string {
  return (/\[([A-Za-z]+)\]/.exec(rarity ?? "")?.[1] ?? "").toLowerCase();
}

const STATIC_ORIGIN = "https://static.dbscards.fr";

/*
  Two layouts live side by side on their CDN, and neither covers everything —
  19 of 40 sampled cards were only under `original/`, 20 only under `fr/<set>/`.
  Note the typo: the older path spells `collectioner` with one `n`. It is not a
  transcription slip, it is what the bytes are served under.
*/
/*
  The filename prefix is written in the locale's own language, and the English
  one carries an extra `-en-` before the slug. Building English URLs with the
  French prefix is why the English column held zero dbscards files while
  looking like it was being asked for — every request 404'd.

  Taken from their own markup:
    fr  /cards/fr/bt1/image-cartes-a-collectionner-…-dbscards-bt1-001-r-champa…
    en  /cards/en/bt1/image-trading-cards-…-dbscards-en-bt1-001-r-god-of-…
*/
const PREFIX_BY_LANG: Record<string, string> = {
  fr: "image-cartes-a-collectionner-dragon-ball-super-card-game-tcg-dbscards",
  en: "image-trading-cards-dragon-ball-super-card-game-tcg-dbscards-en",
};

/*
  The older pool sits flat under `original/`, with no language segment and the
  prefix misspelled `collectioner` (one `n`). Not a transcription slip — it is
  what the bytes are served under. French only: nothing marks its locale, so
  its filenames' own language is the only guarantee.
*/
const LEGACY_PREFIX =
  "image-cartes-a-collectioner-dragon-ball-super-card-game-tcg-dbscards";

export type DbscardsFaceInput = {
  setCode: string;
  /** Locale of the printing. Their CDN files faces under `/cards/<lang>/`. */
  lang?: string;
  /** Printed collector number, without the set (`001`). */
  number: string;
  rarity?: string | null;
  fullName: string;
  /**
   * Leader cards are filed under their awakened name — `bt1-001` is
   * `champa-dieu-de-la-destruction`, not `champa`.
   */
  awakenedName?: string | null;
};

/** The slug their card page and image share, e.g. `bt1-001-r-champa-…`. */
export function dbscardsSlugs(input: DbscardsFaceInput): string[] {
  const set = input.setCode.trim().toLowerCase();
  const number = input.number.trim().toLowerCase();
  const rarity = dbscardsRarityCode(input.rarity);
  const name = input.awakenedName?.trim() || input.fullName;
  return [false, true].map(
    (apostropheAsSeparator) =>
      `${set}-${number}-${rarity}-${dbscardsNameSlug(name, { apostropheAsSeparator })}`,
  );
}

/**
 * Every URL worth trying for one face, best-known layout first.
 *
 * `face: "back"` asks for the awakened side, which only Leader prints have —
 * a miss there is normal, not a failure.
 */
export function dbscardsFaceUrls(
  input: DbscardsFaceInput,
  opts: { face?: "front" | "back" } = {},
): string[] {
  const suffix = opts.face === "back" ? "-back" : "";
  const set = input.setCode.trim().toLowerCase();
  const lang = (input.lang || "fr").trim().toLowerCase();
  const prefix = PREFIX_BY_LANG[lang];
  if (!prefix) return [];
  const urls: string[] = [];
  for (const slug of dbscardsSlugs(input)) {
    urls.push(
      `${STATIC_ORIGIN}/cards/${lang}/${set}/${prefix}-${slug}${suffix}.webp`,
    );
    if (lang === "fr") {
      urls.push(
        `${STATIC_ORIGIN}/cards/original/${LEGACY_PREFIX}-${slug}${suffix}.webp`,
      );
    }
  }
  /*
    Both apostrophe spellings collapse to the same slug on a name without one,
    which is most of them — so the list held each URL twice and every card paid
    two round-trips to a host that can take half a minute to answer.
  */
  return [...new Set(urls)];
}
