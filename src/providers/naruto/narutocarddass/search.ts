/**
 * Action module: search.ts
 * Merged from: printOrientation.ts, searchPrints.ts
 */

import type { DatabaseSync } from "node:sqlite";
import {
  NARUTO_CARDDASS_EFFECT_PACK_ID,
  NARUTO_CARDDASS_FINISHES,
  NARUTO_CARDDASS_FULL_FOIL_MASK_URL,
  NARUTO_CCG_SLEEVE_BACK_URL,
} from "@/effects/narutocarddass";
import { assetsPrintFaceUrl } from "@/lib/packAssetUrls";
import { assetsPackBackUrl, assetsSetBackUrl } from "@/lib/packPaths";
import type { ArtFaceOrientation } from "@/lib/text/artFaceOrientation";
import {
  finalizeSetOptions,
  isAnsweredQuery,
  setScopedWhere,
} from "@/providers/shared/cardCatalogue/sets";
import { artOrientationForPackPrint } from "@/providers/shared/cardCatalogue/cardsIndexOrientation";
import type { PrintCandidate } from "@/types/providerModule";
import ledgerLandscape from "./curated/sources/landscape-prints.json";
import ledgerDoubleIllustrations from "./curated/sources/carddas-jp-double-illustrations.json";
import {
  canonicalizeNarutoPrintKey,
  canonicalNarutoDiskPrefix,
  compareNarutoCollectors,
  compareNarutoLangs,
  formatNarutoReference,
  isNarutoCatalogueSetCode,
  mintNarutoPrintKey,
  narutoCatalogueLineForCard,
  narutoCollectorNumberKey,
  narutoCollectorSearchNeedles,
  narutoRetailDiskNumber,
  narutoSetLabel,
  narutoSetShippedLanguages,
  narutoSetsUnreleasedInFrench,
  isNarutoFrUnpublishedHtmlNumber,
  narutoDetailIsPrinted,
  officialFrChecklistIds,
  officialFrChecklistSetsForNumber,
  NARUTO_PACK_ID,
  parseNarutoCollector,
  type NarutoPrintDetail,
} from "./identity";
import { resolveNarutoArtDiskNumber } from "./diskArtAttachments";
import { resolveNarutoPrintFace } from "./printFaceResolve";
import {
  ensureNarutoPackIndex,
  narutoIndexPacks,
  type NarutoPrintRow,
} from "./indexStore";
import { RAMPAGE_TORNADO_SET } from "./parse/coleka";
import {
  parsePrintKey,
  registerPrereleaseHomeSet,
} from "@/core/identify/printKey";
import { SEALED_FINISH } from "@/core/render/sealedBag";
import { attestedNarutoCarddassFinishes } from "./sources/faces";
import { belongsOnNarutoPromoChecklist } from "./sources/promos";
import { listJapaneseReleases } from "./sources/sealed";
import { loadSealedProductEntries } from "@/lib/collect/sealedProductsLoad";
import { isNarutoS6FrPrintedNumber } from "./sources/titles";

// Brief `prerelease` catalogue set folds into Série 1 — ownership aliases both keys.
registerPrereleaseHomeSet("naruto", "s1");

// --- from printOrientation.ts ---

/**
 * Orientation d'affichage d'une face, pour `toCandidate`.
 *
 * Deux sources :
 *
 * 1. Le relevé éditorial `curated/sources/landscape-prints.json` — autorité pour les
 *    cartes paysage dont la face choisie est un scan portrait couché (PR-060).
 *    Le probe pixel ne mesure que la face choisie : il ne peut pas voir qu'un
 *    fichier portrait contient une carte couchée, et son repli sans dimensions
 *    répondrait `landscapeFace` — faux pour un scan couché.
 * 2. Le probe pixel éditorial (`artW`/`artH` + `landscapePrint`),
 *    partagé avec les autres packs locaux, pour tout le reste.
 */


export type EditorialLandscapePrint = {
  printKey: string;
  lang?: string;
  artW?: number;
  artH?: number;
};

const EDITORIAL_BY_KEY = new Map<string, EditorialLandscapePrint>(
  (ledgerLandscape.prints as EditorialLandscapePrint[]).map((row) => [
    row.printKey.trim().toLowerCase(),
    row,
  ]),
);

/** Relevé éditorial paysage — pour l'export d'index (flag + dims du scan couché). */
export function narutoEditorialLandscapePrints(): readonly EditorialLandscapePrint[] {
  return [...EDITORIAL_BY_KEY.values()];
}

export function narutoCarddassPrintOrientation(
  printKey: string,
  lang: string | null | undefined,
): (ArtFaceOrientation & { landscapePrint?: boolean }) | null {
  const key = printKey?.trim().toLowerCase();
  if (!key) return null;
  if (EDITORIAL_BY_KEY.has(key)) {
    // Carte paysage, scan affiché portrait couché : on tourne d'un quart de tour.
    return { landscapePrint: true, faceQuarterTurns: 1 };
  }
  return artOrientationForPackPrint(NARUTO_PACK_ID, printKey, lang);
}

// --- from searchPrints.ts ---

/**
 * Print search for the Naruto CCG local catalogue.
 *
 * A card carries no barcode, so a shelf can never scan its way to one: the app
 * asks providers for candidates and the user picks a print. Everything is read
 * from `data/naruto/carddass/catalog.sqlite` — the pack is a closed corpus, so there
 * is no network call and no pagination to chase.
 */


/** Langues catalogue : original japonais + retail EU (FR / EN / IT). */
export const NARUTO_CATALOGUE_LANGUAGES = ["fr", "en", "ja", "it"] as const;

function isNarutoCatalogueLanguage(lang: string | null | undefined): boolean {
  const code = (lang ?? "").trim().toLowerCase();
  return (NARUTO_CATALOGUE_LANGUAGES as readonly string[]).includes(code);
}

function printedColumnSql(db: DatabaseSync): string {
  const cols = db.prepare("PRAGMA table_info(print_assets)").all() as {
    name: string;
  }[];
  return cols.some((col) => col.name === "printed") ? "a.printed" : "1";
}

/**
 * Admin (`includeUnprinted`): FR (etc.) asset slots with no title in that
 * language — cancelled S6 preprod keeps `print_assets.fr` without a FR title,
 * so the titled JOIN never emits a row. Surface them as nameless shells.
 */
function loadUnprintedOrphanLangRows(
  db: DatabaseSync,
  lang: string,
  setId: string | null | undefined,
  limit: number,
): NarutoPrintDetail[] {
  const code = lang.trim().toLowerCase();
  if (!code || !isNarutoCatalogueLanguage(code)) return [];
  const membership = !setId ? null : setMembershipScope(db, setId);
  const cap = Math.max(1, Math.min(limit, 5000));
  /*
    Always stamp `printed: false` — a locale asset without a locale title is
    not shelf cardboard in that language (cancelled S6, HTML phantoms, stray
    EU shells on CCG keys). Admin keeps the tile; checklist never asks for it.
  */
  return db
    .prepare(
      `SELECT p.print_key AS printKey,
              p.set_code   AS setCode,
              p.number     AS number,
              p.card_type  AS cardType,
              ?            AS lang,
              NULL         AS fullName,
              NULL         AS rarity,
              a.art        AS art,
              a.thumb      AS thumb,
              0            AS printed
         FROM prints p
         JOIN print_assets a
           ON a.print_key = p.print_key AND a.lang = ?
         LEFT JOIN print_titles t
           ON t.print_key = p.print_key AND t.lang = ?
        WHERE t.print_key IS NULL
          ${membership ? `AND ${membership.clause}` : ""}
        ORDER BY p.number
        LIMIT ?`,
    )
    .all(
      code,
      code,
      code,
      ...(membership?.params ?? []),
      cap,
    ) as NarutoPrintDetail[];
}

function hasPrintSetsTable(db: DatabaseSync): boolean {
  return (
    (
      db
        .prepare(
          `SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'print_sets'`,
        )
        .all() as { name: string }[]
    ).length > 0
  );
}

/** Appartenance multi-set (`print_sets`) avec repli sur `prints.set_code`. */
function setMembershipScope(
  db: DatabaseSync,
  setId: string | null | undefined,
): { clause: string; params: (string | number)[] } | null {
  const id = setId?.trim().toLowerCase();
  if (!id) return null;
  /*
    Set-scoped keys already mint `s6-ni0232` etc. Do **not** OR on number —
    that pulled `maki10-ni0232` into the S6 FR chapter.
  */
  if (hasPrintSetsTable(db)) {
    /*
      `print_sets` porte les multi-séries (NI-049 → s1+s5). Un tirage sans
      ligne (legacy / 巻ノ-only) doit encore matcher sa `set_code` primaire —
      sinon toute la check-list tombe à « Sans catalogue » dès que la table
      existe mais qu'une passe d'index a mal peuplé les memberships.
    */
    return {
      clause: `(
                EXISTS (
                  SELECT 1 FROM print_sets ps
                   WHERE ps.print_key = p.print_key
                     AND LOWER(ps.set_code) = ?
                )
                OR (
                  NOT EXISTS (
                    SELECT 1 FROM print_sets ps2
                     WHERE ps2.print_key = p.print_key
                  )
                  AND LOWER(p.set_code) = ?
                )
              )`,
      params: [id, id],
    };
  }
  return {
    clause: `LOWER(p.set_code) = ?`,
    params: [id],
  };
}


// ─── double illustrations (official JP art B) ───────────────────


export const NARUTO_ILLUSTRATION_B_LABEL = "illustration B";

/** `normal` → `normal (illustration B)` — l'option du sélecteur de variante. */
export function narutoIllustrationBFinish(finish: string): string {
  return `${finish} (${NARUTO_ILLUSTRATION_B_LABEL})`;
}

type DoubleIllustrationCard = {
  number: string;
  artB: string;
};

const ART_B_BY_NUMBER = new Map<string, string>(
  (ledgerDoubleIllustrations.cards as DoubleIllustrationCard[]).map((card) => [
    card.number.trim().toLowerCase(),
    card.artB,
  ]),
);

/**
 * Fichier de l'illustration B pour un numéro de disque (`te0358`),
 * `null` pour tout autre tirage. L'illustration A reste la face affichée.
 */
export function narutoIllustrationBArt(number: string): string | null {
  return ART_B_BY_NUMBER.get(number.trim().toLowerCase()) ?? null;
}

/**
 * Card families, as carddass.fr itself spelled them: the site filed faces under
 * `cartes/5/ninjas/`, `tactique/`, `technique/` and `clients/`. The stored
 * `card_type` is the two-letter prefix of the collector number.
 */
const CARD_FAMILY: Record<string, string> = {
  ni: "Ninja",
  ta: "Tactique",
  te: "Technique",
  cl: "Client",
  ki: "Chevalier",
  pr: "Promo",
  n: "Ninja",
  j: "Jutsu",
  m: "Mission",
  st: "Tactique",
  c: "Client",
};

export { formatNarutoReference };

/**
 * s1–s6 exist on two lines (Carddass NI/TE/TA vs CCG N/J/M). A FR title on
 * CCG `M-092` must not fill the Carddass Série 3 checklist — different back,
 * different game. Tempête / s24 / s28 stay CCG.
 *
 * `promo` is intentionally unsplit: Carddass shuriken reprints (`NI-023 · promo`)
 * and EU CCG tin / Storm 3 window PRs (`PR-095` Day One, `PR-096` duopack,
 * `PR-100`) share the set and often share a printKey with titles in several
 * languages. The language filter alone scopes the checklist — forcing
 * `carddass-fr` for Promo FR hid every bare `PR-nnn`.
 */
function narutoSetListingLine(
  setId: string | undefined,
  language: string | undefined,
): "carddass-fr" | "en-ccg" | null {
  const id = setId?.trim().toLowerCase();
  if (!id || !language) return null;
  if (id === "promo") return null;
  if (/^s(?:[7-9]|1\d|2[0-8])$/.test(id) || /^tp\d+$/.test(id) || /^tin\d+$/.test(id)) {
    return "en-ccg";
  }
  if (/^s[1-6]$/.test(id)) {
    if (language === "en") return "en-ccg";
    if (language === "fr" || language === "it" || language === "ja") {
      return "carddass-fr";
    }
  }
  return null;
}

/**
 * CCG prints share the USA sleeve. Carddass uses a set verso when installed
 * (S6 FR `backs/fr/sets/s6`); otherwise the pack sleeve (`backs/fr`) so the
 * fiche can flip before / without the effect registry (promo, S1–S5).
 */
export function narutoCandidateCardBackUrl(
  number: string,
  setCode?: string,
  lang?: string | null,
): string | undefined {
  if (narutoCatalogueLineForCard(number, setCode) === "en-ccg") {
    return NARUTO_CCG_SLEEVE_BACK_URL;
  }
  const set = (setCode ?? "").trim().toLowerCase();
  if (!set) return undefined;
  const code = lang ?? "fr";
  return (
    assetsSetBackUrl(NARUTO_PACK_ID, set, code) ??
    assetsPackBackUrl(NARUTO_PACK_ID, code) ??
    undefined
  );
}

export type { NarutoPrintDetail } from "./identity";

/** Canonical vocabulary (`items.finishes.normal`), not an invented word. */
const PLAIN_FINISH = "normal";

/**
 * Default outside Bandai-attested S1: plain + holo on every print.
 * Rarity alone is too dirty to gate (`ta158` commune + physical holo).
 * S1–S3 / S5 FR use {@link attestedNarutoCarddassFinishes} instead.
 */
const NARUTO_FINISHES = [PLAIN_FINISH, ...NARUTO_CARDDASS_FINISHES];

/** `te0034-promo` / `TE-034` → `te0034` (dossier retail, sans grouping). */
function narutoBaseDiskNumber(raw: string): string | null {
  const id = parseNarutoCollector(raw);
  if (!id) return null;
  const prefix = canonicalNarutoDiskPrefix(id.printedPrefix);
  return `${prefix}${String(id.number).padStart(4, "0")}`;
}

function artDonorScore(setCode: string, artFile: string): number {
  let score = 0;
  if (setCode.trim().toLowerCase() !== "promo") score += 100;
  if (/\.reconstructed\./i.test(artFile)) score += 30;
  else if (/\.corrected\./i.test(artFile)) score += 20;
  return score;
}

type ArtDonorHit = {
  number: string;
  art: string;
  thumb: string | null;
  lang: string;
  setCode: string;
  score: number;
};

/**
 * Faces retail (même préfixe + numéro) pour les stubs promo / cdf sans art.
 *
 * Même règle que le catalogue admin (`sameNumberArtFallback`) : sans ça, la
 * check-list et les tuiles restent vides alors que `te0034` / `ni0024` existent.
 */
function loadSameNumberArtDonors(
  numbers: readonly string[],
  lang: string,
): Map<string, ArtDonorHit> {
  const bases = [
    ...new Set(
      numbers
        .map((n) => narutoBaseDiskNumber(n))
        .filter((n): n is string => Boolean(n)),
    ),
  ];
  const out = new Map<string, ArtDonorHit>();
  if (bases.length === 0) return out;

  const wantLang = lang.toLowerCase();
  const clause = bases
    .map(() => `(LOWER(p.number) = ? OR LOWER(p.number) LIKE ?)`)
    .join(" OR ");
  const params = bases.flatMap((base) => [base, `${base}-%`]);

  for (const pack of narutoIndexPacks()) {
    const db = ensureNarutoPackIndex(pack);
    if (!db) continue;
    const rows = db
      .prepare(
        `SELECT p.number   AS number,
                p.set_code AS setCode,
                a.art      AS art,
                a.thumb    AS thumb,
                a.lang     AS lang
           FROM prints p
           JOIN print_assets a
             ON a.print_key = p.print_key
          WHERE a.art IS NOT NULL AND TRIM(a.art) <> ''
            AND (${clause})
          ORDER BY (LOWER(a.lang) = ?) DESC`,
      )
      .all(...params, wantLang) as {
      number: string;
      setCode: string;
      art: string;
      thumb: string | null;
      lang: string;
    }[];

    for (const row of rows) {
      // Same locale only — never park EN Drive under a FR fallback key.
      if (row.lang.toLowerCase() !== wantLang) continue;
      const key = narutoCollectorNumberKey(row.number);
      if (!key) continue;
      const mapKey = `${key}\0${wantLang}`;
      /*
        Donor must be the **base** printing (or at least not the needy stub's
        own empty promo folder). Prefer exact `te0034` over another grouping.
      */
      const base = narutoBaseDiskNumber(row.number);
      if (!base) continue;
      const exact = row.number.toLowerCase() === base;
      const score = artDonorScore(row.setCode, row.art) + (exact ? 50 : 0);
      const prev = out.get(mapKey);
      if (prev && prev.score >= score) continue;
      out.set(mapKey, {
        number: exact ? row.number : base,
        art: row.art,
        thumb: row.thumb,
        lang: row.lang,
        setCode: row.setCode,
        score,
      });
    }
  }
  return out;
}

/** Emprunte la face retail quand le tirage n'a pas d'art propre. */
export function withNarutoRetailArtFallback(
  rows: readonly NarutoPrintDetail[],
): NarutoPrintDetail[] {
  const needing = rows.filter((row) => !row.art?.trim());

  const byLang = new Map<string, string[]>();
  for (const row of needing) {
    const lang = (row.lang || "fr").toLowerCase();
    const list = byLang.get(lang) ?? [];
    list.push(row.number);
    byLang.set(lang, list);
  }
  const donorsByLang = new Map<string, Map<string, ArtDonorHit>>();
  for (const [lang, numbers] of byLang) {
    donorsByLang.set(lang, loadSameNumberArtDonors(numbers, lang));
  }

  return rows.map((row) => {
    const lang = (row.lang || "fr").toLowerCase();
    if (row.art?.trim()) {
      /*
        Index mirror may list art on a promo stub while bytes stay under the
        retail folder (`ta0081/fr/art.carddass.jpg`). Point artNumber there so
        asset URLs do not 404 on a missing `ta0081-promo/` tree.
      */
      if (row.artNumber?.trim()) return row;
      const diskNumber = resolveNarutoArtDiskNumber({
        number: row.number,
        lang,
        artFile: row.art,
      });
      if (diskNumber.toLowerCase() !== row.number.toLowerCase()) {
        return { ...row, artNumber: diskNumber };
      }
      return row;
    }
    const key = narutoCollectorNumberKey(row.number);
    if (!key) return row;
    /*
      Unattested JA tourney stubs must not borrow FR/IT retail faces at read
      time (same gate as scrape mirror + Promo checklist).
    */
    if (
      isNarutoPromoChannelDetail(row) &&
      !belongsOnNarutoPromoChecklist(row.number) &&
      (lang === "fr" || lang === "it")
    ) {
      return row;
    }
    const donor = donorsByLang.get(lang)?.get(`${key}\0${lang}`);
    if (!donor) return row;
    // Ne pas s'emprunter soi-même (même numéro disque, pas d'art ailleurs).
    if (donor.number.toLowerCase() === row.number.toLowerCase()) return row;
    // Carddass ≠ CCG — never glue NI-100 onto N-100.
    if (
      narutoCatalogueLineForCard(row.number, row.setCode) !==
      narutoCatalogueLineForCard(donor.number, donor.setCode)
    ) {
      return row;
    }
    // Same locale only — no EN Drive on a FR tile.
    if (donor.lang.toLowerCase() !== lang) return row;
    return {
      ...row,
      art: donor.art,
      thumb: donor.thumb ?? row.thumb,
      artNumber: donor.number,
    };
  });
}

function toCandidate(row: NarutoPrintDetail): PrintCandidate {
  /*
    Double illustration officielle (術-192/348/358, voir doubleIllustrations) :
    la copie choisit son illustration comme elle choisit sa finition. L'axe
    reste unique, donc chaque finition existe aussi en « (illustration B) »,
    avec l'art B en visuel propre au lieu du masque de foil.
  */
  const illustrationBArt =
    row.lang?.trim().toLowerCase() === "ja"
      ? narutoIllustrationBArt(row.number)
      : null;
  /*
    Manga S1 prerelease printKey = the bag only (`sealed`). Opened, the card is
    the retail non-foil (`normal`) — same object, so we do not offer a second
    Normale on the prerelease key.
  */
  const isPrereleasePrint =
    parseNarutoCollector(row.number)?.grouping?.toLowerCase() ===
      "prerelease" ||
    /-prerelease$/i.test(row.number) ||
    /-prerelease$/i.test(row.printKey);
  // S1 FR: Bandai-attested finishes. Elsewhere keep dual (rarity too dirty to gate).
  const baseFinishes = isPrereleasePrint
    ? ([SEALED_FINISH] as string[])
    : (attestedNarutoCarddassFinishes(row.setCode, row.number) ??
      NARUTO_FINISHES);
  const finishes = illustrationBArt
    ? [...baseFinishes, ...baseFinishes.map(narutoIllustrationBFinish)]
    : [...baseFinishes];
  /*
    Cardboard flag: HTML phantoms / cancelled S6 stay false. Attested S6 FR
    inserts (Kana / DVD) are real cardboard despite set-level unprinted
    (sqlite often stamps the whole S6 FR channel as printed=0).
  */
  let printed = narutoDetailIsPrinted(row.printed);
  const rowLang = (row.lang ?? "").trim().toLowerCase();
  const rowSet = (row.setCode ?? "").trim().toLowerCase();
  if (rowLang === "fr" && isNarutoFrUnpublishedHtmlNumber(row.number)) {
    printed = false;
  } else if (isNarutoS6FrPrintedNumber(row.number)) {
    printed = true;
  } else if (rowLang === "fr" && rowSet === "s6") {
    printed = false;
  }
  const sleeveBack = narutoCandidateCardBackUrl(
    row.number,
    row.setCode,
    row.lang,
  );
  const orient = narutoCarddassPrintOrientation(row.printKey, row.lang);
  /*
    Role URLs only when disk resolves — stale print_assets basenames must not
    mint 404 thumbs (e.g. s6 FR claiming art.carddass.jpg with no folder).
  */
  const faceLang = (row.lang ?? "fr").trim().toLowerCase() || "fr";
  const diskHit = resolveNarutoPrintFace({
    printKey: row.printKey,
    lang: faceLang,
    role: "face",
  });
  const imageUrl = diskHit
    ? assetsPrintFaceUrl(NARUTO_PACK_ID, row.printKey, faceLang, "face")
    : null;
  const thumbnailUrl = diskHit
    ? assetsPrintFaceUrl(NARUTO_PACK_ID, row.printKey, faceLang, "thumb")
    : null;
  return {
    printKey: row.printKey,
    // A print with no title yet still deserves to be pickable: the reference
    // alone identifies it, and hiding it would make the card unaddable.
    title:
      row.fullName?.trim() ||
      formatNarutoReference(row.setCode, row.number, row.lang),
    reference: formatNarutoReference(row.setCode, row.number, row.lang),
    // `CL-001` ne dit pas la série ; le sélecteur de catalogue en a besoin.
    setLabel: narutoSetLabel(row.setCode, row.number, row.lang),
    ...(row.rarity ? { rarity: row.rarity } : {}),
    ...(row.cardType
      ? { category: CARD_FAMILY[row.cardType.toLowerCase()] ?? row.cardType }
      : {}),
    ...(imageUrl ? { imageUrl } : {}),
    ...(thumbnailUrl ? { thumbnailUrl } : {}),
    language: row.lang,
    setCode: row.setCode,
    printed,
    finishes,
    // Derived from the same array, as Lorcana and TCGdex do, so the two can
    // never drift apart.
    plainFinishes: finishes.filter(
      (finish) =>
        finish === PLAIN_FINISH ||
        finish === SEALED_FINISH ||
        finish === narutoIllustrationBFinish(PLAIN_FINISH),
    ),
    // Manga FR prereleases ship with heat-seals top + bottom (double pinch).
    ...(isPrereleasePrint ? { sealedBag: true } : {}),
    ...(illustrationBArt
      ? {
          variantImageUrls: Object.fromEntries(
            baseFinishes.map((finish) => [
              narutoIllustrationBFinish(finish),
              assetsPrintFaceUrl(
                NARUTO_PACK_ID,
                row.printKey,
                faceLang,
                "face-b",
              ),
            ]),
          ),
        }
      : {}),
    // Read only once a shiny finish is resolved, so a plain copy stays flat.
    foilMaskUrl: NARUTO_CARDDASS_FULL_FOIL_MASK_URL,
    /**
     * One effect pack. CCG prints stamp the USA sleeve so Storm 3 FR does
     * not flip to the Carddass verso.
     */
    effectPack: NARUTO_CARDDASS_EFFECT_PACK_ID,
    ...(sleeveBack ? { cardBackUrl: sleeveBack } : {}),
    ...(orient?.landscapeFace ? { landscapeFace: true } : {}),
    ...(orient?.faceQuarterTurns
      ? { faceQuarterTurns: orient.faceQuarterTurns }
      : {}),
    ...(orient?.landscapePrint ? { landscapePrint: true } : {}),
  };
}

/**
 * Rows matching a free-text query: card name, printed number (`NI-232`, `ni232`,
 * or bare `232`) or print key. One row per print — the preferred language wins,
 * so a card is never offered twice for the same printing.
 */
/**
 * Les extensions du catalogue, telles qu'un joueur les nomme.
 *
 * Énumérées depuis la base plutôt que depuis `sets.json` : le relevé curé ne
 * couvre pas les sets dérivés — les `maki` et `maku` japonais n'y sont pas — et
 * une liste qui omet des extensions réelles est pire qu'une liste brute.
 */
/** Les deux découpes du jeu, telles que le sélecteur les titre. */
const EUROPEAN_CUT = "Séries (Europe / US)";
const JAPANESE_CUT = "巻ノ (Japon)";

/**
 * Le japonais, et lui seul, pour les 巻ノ.
 *
 * **Écrit en dur, et c'est voulu.** Les cartes d'un 巻ノ portent souvent un titre
 * français : les mêmes numéros ont été réimprimés dans les séries européennes,
 * et une clé de tirage vaut pour toutes ses localisations. Mesurer les langues
 * des cartes rendrait donc « français » pour un volume qui n'a jamais été vendu
 * en France. Ce que la découpe japonaise déclare, c'est où elle est **parue**.
 */
const JAPANESE_LANGUAGES = ["ja"];

/**
 * Les langues d'une série européenne, **mesurées** carte par carte.
 *
 * Ici l'inverse est vrai : ces séries n'ont pas toutes paru partout. Le
 * français s'arrête à la Série 5 — la 6 fut annulée — puis les séries 7 à 23
 * et 25–27 sont anglaises seules. Sage's Legacy (s24) et Storm 3 (s28) ont
 * reçu une impression française tardive.
 * Une liste en bloc proposait donc « Quest for Power », le set 7 américain,
 * à qui filtrait sur le français.
 *
 * Le japonais est **retiré** de ce que la mesure rend : une carte japonaise
 * n'a jamais appartenu à une série européenne, elle n'est dans cette ligne que
 * parce que le tirage est partagé. C'est la même asymétrie que ci-dessus, prise
 * par l'autre bout.
 */
function europeanSetLanguages(): Map<string, string[]> {
  /*
    Ce que le registre **sait** prime sur ce que la mesure compte. La Série 6
    fut annulée en France : ses cartes existent, imprimées en Italie, et ses
    entrées françaises sont des rendus de pré-production trouvés sur
    `carddass.fr`. Vingt-neuf titres français la faisaient apparaître sous
    « FR », pour des cartes qu'on ne peut pas posséder.
  */
  const unreleasedInFrench = narutoSetsUnreleasedInFrench();
  /*
    Le français retail s'arrête à la Série 5 ; Sage's Legacy (s24), Storm 3
    (s28) et le deck Tempête approche ont une impression FR tardive. Les
    séries 7–23 / 25–27 sont EN — des titres FR collés sur des reprints
    partagés ne doivent pas rouvrir le filtre FR sur « Quest for Power ».
    L’italien retail couvre S1–S6 (Rivalità Eterna sortie, FR annulée).
  */
  /*
    Retail FR s'arrête à S5, sauf sorties tardives (s24 / s28 / Tempête) et le
    chapitre **S6** des inserts Kana / DVD (pas le retail boosters annulé).
  */
  const frenchLateSeries = new Set([
    "s6",
    "s24",
    "s28",
    RAMPAGE_TORNADO_SET,
  ]);
  const found = new Map<string, Set<string>>();
  for (const pack of narutoIndexPacks()) {
    const db = ensureNarutoPackIndex(pack);
    if (!db) continue;
    const langSql = `SELECT p.set_code AS setCode, t.lang AS lang
           FROM prints p JOIN print_titles t ON t.print_key = p.print_key
          WHERE t.lang IS NOT NULL AND TRIM(t.lang) <> ''
          GROUP BY 1, 2`;
    for (const row of db.prepare(langSql).all() as {
      setCode: string;
      lang: string;
    }[]) {
      const code = row.setCode?.trim();
      const lang = row.lang?.trim().toLowerCase();
      if (!code || lang === "ja") continue;
      if (lang === "fr") {
        const id = code.toLowerCase();
        /*
          `released: false` sur s6 = retail boosters annulé. Les inserts Kana
          ont quand même un chapitre checklist FR séparé — on n'occulte pas s6.
        */
        if (unreleasedInFrench.has(id) && id !== "s6") continue;
        const series = /^s(\d+)$/i.exec(code);
        if (series) {
          const n = Number(series[1]);
          if (n > 5 && !frenchLateSeries.has(id)) continue;
        }
      }
      if (lang === "it") {
        const id = code.toLowerCase();
        // Retail IT Carddass = S1–S6 (+ promo / prerelease channels).
        if (id === "promo" || id === "prerelease") {
          // keep
        } else {
          const series = /^s(\d+)$/i.exec(code);
          if (!series || Number(series[1]) > 6) continue;
        }
      }
      const set = found.get(code) ?? new Set<string>();
      set.add(lang);
      found.set(code, set);
    }
  }
  return new Map([...found].map(([code, langs]) => [code, [...langs].sort()]));
}

/**
 * Toutes les extensions du jeu, chacune sous le nom de sa découpe.
 *
 * Le catalogue range selon la découpe **européenne**, faute d'une seconde
 * colonne — 766 tirages portent à la fois un titre japonais et un titre
 * français, et les forcer en `maki*` les sortirait de leur série. La découpe
 * japonaise se calcule donc depuis le numéro imprimé, qui la détermine
 * entièrement.
 */
export function listNarutoPrintSets(language?: string | null): {
  id: string;
  label: string;
  group?: string;
  languages?: string[];
  sortKey?: number;
}[] {
  const labelLang = language?.trim().toLowerCase() || null;
  if (labelLang && !isNarutoCatalogueLanguage(labelLang)) return [];
  /*
    Les deux découpes sont rendues **ensemble**, jamais l'une à la place de
    l'autre. Elles ne décrivent pas le même objet : le Japon compte dix-sept
    巻ノ de 2002 à 2006, l'Europe vingt-huit séries à partir de 2006, et le
    巻ノ十 recoupe les séries 4 et 5. Les fondre dirait qu'elles sont
    interchangeables ; n'en montrer qu'une selon la langue cachait l'autre —
    et cherchait à deviner ce que le collectionneur voulait ranger.

    Chacune porte donc son nom de découpe, et le sélecteur les présente côte à
    côte sous deux en-têtes.
  */
  const japanese = listJapaneseReleases();
  /*
    Dix codes `maki*` sont **écrits** dans `set_code` — les cartes qu'une passe
    antérieure avait déjà rangées en volumes. Ils appartiennent à la découpe
    japonaise, que ce module calcule de toute façon : les laisser du côté
    européen produisait le même identifiant dans les deux listes, donc un choix
    ambigu et un tri incompréhensible.
  */
  const japaneseIds = new Set(japanese.map((release) => release.setCode));

  const europeanLanguages = europeanSetLanguages();
  const european = new Set<string>();
  for (const pack of narutoIndexPacks()) {
    const db = ensureNarutoPackIndex(pack);
    if (!db) continue;
    const setSql = hasPrintSetsTable(db)
      ? `SELECT DISTINCT set_code AS setCode FROM prints
         UNION
         SELECT DISTINCT set_code AS setCode FROM print_sets`
      : `SELECT DISTINCT set_code AS setCode FROM prints`;
    for (const row of db.prepare(setSql).all() as { setCode: string }[]) {
      const code = row.setCode?.trim();
      if (
        code &&
        code !== "unknown" &&
        !japaneseIds.has(code) &&
        !code.startsWith("maki")
      )
        european.add(code);
    }
  }

  return [
    ...finalizeSetOptions(
      [...european].map((code) => ({
        id: code,
        label: narutoSetLabel(code, null, labelLang),
        group: EUROPEAN_CUT,
        languages:
          narutoSetShippedLanguages(code) ?? europeanLanguages.get(code) ?? [],
        /*
          Le rang est dans le **code** — `s5` — pas dans le libellé, qui porte
          souvent le nom anglais du set. Trié par texte, la liste s'ouvrait sur
          « A New Chronicle », qui est la douzième série.
        */
        sortKey:
          code === "prerelease"
            ? 0
            : /^s(\d+)$/.exec(code)
              ? Number(code.slice(1))
              : null,
      })),
    ),
    ...finalizeSetOptions(
      japanese.map((release, index) => ({
        id: release.setCode,
        label: release.releaseName,
        group: JAPANESE_CUT,
        languages: JAPANESE_LANGUAGES,
        /*
          Les 巻ノ se numérotent en kanji, que le tri par libellé rangerait
          一, 三, 二… Les sorties hors volume (boîtes, feuilles d'extension)
          gardent leur rang de parution : c'est leur seul ordre naturel.
        */
        sortKey: release.volume ?? 100 + index,
      })),
    ),
  ];
}

export function searchNarutoPrints(
  query: string,
  opts: {
    language?: string;
    limit?: number;
    setId?: string | null;
    catalogueBrowse?: boolean;
    /** Admin catalogue — keep `printed: false` rows. */
    includeUnprinted?: boolean;
  } = {},
): PrintCandidate[] {
  const trimmed = query.trim();
  const setId = opts.setId?.trim().toLowerCase();
  // Une extension seule — ou un parcours catalogue — est une question complète.
  if (!isAnsweredQuery(trimmed, setId, opts.catalogueBrowse)) return [];

  const requestedLang = opts.language?.trim().toLowerCase() || "";
  if (requestedLang && !isNarutoCatalogueLanguage(requestedLang)) return [];
  const lang = requestedLang || "fr";
  const includeUnprinted = opts.includeUnprinted === true;
  /*
    Le plafond monte à cinq mille pour la check-list, qui doit énumérer un set
    entier : compter les manquantes d'un set de 452 cartes sur les deux cents
    premières annoncerait une complétion fausse, et fausse par excès.
  */
  const limit = Math.max(1, Math.min(opts.limit ?? 40, 5000));
  // `NI-232` and `ni 232` must both reach `ni232` as stored.
  const compact = trimmed.toLowerCase().replace(/[\s-]/g, "");
  const like = `%${trimmed.toLowerCase()}%`;
  const likeCompact = `%${compact}%`;
  /*
    Collector needles must not be wrapped in `%n14%` : that substring matches
    `n1400` (Sage's Legacy FR `NI-1400`) and, with enough French hits, fills
    the SQL LIMIT before `ni0014` can be sorted first. Exact id or grouping
    suffix (`n0014-ps`) keeps `ni14` on the printed Carddass ref.
  */
  const siblingNeedles = [
    ...new Set([
      ...narutoCollectorSearchNeedles(trimmed),
      ...narutoCollectorSearchNeedles(compact),
    ]),
  ].map((needle) => needle.toLowerCase());
  const numberClause =
    siblingNeedles.length > 0
      ? siblingNeedles
          .map(() => "(LOWER(p.number) = ? OR LOWER(p.number) LIKE ?)")
          .join(" OR ")
      : "LOWER(p.number) LIKE ?";
  const numberParams =
    siblingNeedles.length > 0
      ? siblingNeedles.flatMap((needle) => [needle, `${needle}-%`])
      : [likeCompact];
  /*
    L'extension borne la requête, le texte l'affine. Sans texte, `1 = 1` laisse
    passer tout le set — c'est la question « montre-moi la Série 1 », qui n'a
    pas de mot-clé à donner.
  */
  /*
    Un 巻ノ ne se lit pas dans `set_code`, qui porte la série européenne. On le
    traduit en bornes de numéros — la seule chose qui le définisse — et le SQL
    filtre là-dessus.

    C'est l'**identifiant demandé** qui dit la découpe, pas la langue : `maki10`
    est un volume japonais qu'on le cherche en japonais ou non, et `s5` une
    série européenne. Passer par la langue revenait à deviner ce qu'on nous a
    déjà dit.

    **Les six numéros disputés paraissent dans les deux volumes.** La source
    donne 巻ノ十 = 忍-205〜239 et 巻ノ十一 = 忍-234〜254 ; ses décomptes
    valident chacune des plages prise seule, donc rien ne départage. Ranger
    `naruto:ni-0234` d'un côté serait affirmer ce qu'on ignore, et le retirer
    des deux le rendrait introuvable à qui le tient en main. On le montre deux
    fois : c'est l'état réel de ce qu'on sait.

    C'est pourquoi on lit les **bornes** et non `japaneseVolumeForNumber`, qui
    rend `null` sur ces six-là — les deux répondent à des questions
    différentes : « à quel volume appartient cette carte ? » n'a pas de réponse,
    « quelles cartes ce volume peut-il contenir ? » en a une.
  */
  /*
    Set-scoped keys : 巻ノ = `naruto:maki1-ni0001` (minté à l'index depuis les
    bornes). Plus de filtre SQL par plage numérique — sinon on retombait sur
    les clés européennes `s1-ni0001` qui partagent le numéro.
  */
  const scope = setScopedWhere({
    setColumn: "p.set_code",
    setId: null,
    textClause: trimmed
      ? `LOWER(t.full_name) LIKE ?
               OR LOWER(p.print_key) LIKE ?
               OR LOWER(p.print_key) LIKE ?
               OR ${numberClause}`
      : null,
    textParams: [like, like, likeCompact, ...numberParams],
  });

  const rows: NarutoPrintDetail[] = [];
  for (const pack of narutoIndexPacks()) {
    const db = ensureNarutoPackIndex(pack);
    if (!db) continue;
    const printedSql = printedColumnSql(db);
    const membership = !setId ? null : setMembershipScope(db, setId);
    rows.push(
      ...(db
        .prepare(
          `SELECT p.print_key AS printKey,
                  p.set_code   AS setCode,
                  p.number     AS number,
                  p.card_type  AS cardType,
                  t.lang       AS lang,
                  t.full_name  AS fullName,
                  t.rarity     AS rarity,
                  a.art        AS art,
                  a.thumb      AS thumb,
                  ${printedSql} AS printed
             FROM prints p
             LEFT JOIN print_titles t
                    ON t.print_key = p.print_key
             LEFT JOIN print_assets a
                    ON a.print_key = p.print_key AND a.lang = t.lang
            WHERE ${scope.where}${membership ? ` AND ${membership.clause}` : ""}
            ORDER BY (t.lang = ?) DESC, p.number
            LIMIT ?`,
        )
        .all(
          ...scope.params,
          ...(membership?.params ?? []),
          lang,
          limit * 3,
        ) as NarutoPrintDetail[]),
    );
    /*
      Cancelled S6 / HTML phantoms often keep a locale asset without a title
      in that language — the JOIN above never emits them. Admin needs the slot.
    */
    if (includeUnprinted && requestedLang) {
      rows.push(
        ...loadUnprintedOrphanLangRows(
          db,
          requestedLang,
          setId,
          limit * 3,
        ),
      );
    }
  }

  rows.sort((a, b) => {
    const byNumber = compareNarutoCollectors(a.number, b.number);
    if (byNumber !== 0) return byNumber;
    /*
      La langue demandée d'abord. Sans ça, `compareNarutoLangs` mettait le FR
      devant, `seen` gardait cette ligne, et la check-list IT de la Série 1
      tombait à zéro alors que les titres italiens sont dans l'index.
    */
    if (requestedLang) {
      const aHit = (a.lang ?? "").toLowerCase() === requestedLang ? 0 : 1;
      const bHit = (b.lang ?? "").toLowerCase() === requestedLang ? 0 : 1;
      if (aHit !== bHit) return aHit - bHit;
    }
    return compareNarutoLangs(a.lang, b.lang);
  });

  const listingLine = narutoSetListingLine(setId, requestedLang || undefined);
  const promoSet = setId?.trim().toLowerCase() === "promo";
  /*
    EU picker languages share the Promo checklist attestation (dig / PR / PS).
    JA-only tourney stubs (`te0107-promo` eBay) hang FR/IT titles + borrow S3
    art — without this gate, unfiltered search offers « TE-107 · promo » for
    the S3 commune (catalogue admin already skips those tiles).
  */
  const gateUnattestedPromo =
    promoSet || requestedLang === "fr" || requestedLang === "it";
  const seen = new Set<string>();
  const out: PrintCandidate[] = [];
  const enriched = withNarutoRetailArtFallback(rows);
  for (const row of enriched) {
    if (!narutoDetailIsPrinted(row.printed) && !includeUnprinted) {
      /*
        Index : s6 FR « unreleased » → printed=0 (préprod carddass.fr).
        Les inserts Kana / DVD attestés restent pickables.
      */
      const s6FrInsert =
        (!requestedLang || requestedLang === "fr") &&
        isNarutoS6FrPrintedNumber(row.number);
      if (!s6FrInsert) continue;
    }
    /*
      HTML-only phantoms (TA-090 « Le don de la copie ») — never FR paper.
      Checklist hides them; admin (`includeUnprinted`) keeps the slot.
    */
    if (
      !includeUnprinted &&
      (!requestedLang || requestedLang === "fr") &&
      isNarutoFrUnpublishedHtmlNumber(row.number)
    ) {
      continue;
    }
    if (
      gateUnattestedPromo &&
      isNarutoPromoChannelDetail(row) &&
      !belongsOnNarutoPromoChecklist(row.number)
    ) {
      continue;
    }
    if (
      listingLine &&
      narutoCatalogueLineForCard(row.number, row.setCode) !== listingLine
    )
      continue;
    if (setId === "s6" && requestedLang === "fr" && !includeUnprinted) {
      /*
        Chapitre FR checklist = inédites Kana / DVD + reprints MIJ attestés
        (`s6-fr-printed.json`). Admin (`includeUnprinted`) keeps cancelled S6.
      */
      if (!isNarutoS6FrPrintedNumber(row.number)) continue;
    }
    /*
      巻ノ cuts are Japanese-only titles. The set id already named the volume —
      a FR/EN language preference must not empty the checklist (see search.test
      « reads the cut from the set asked for »).
    */
    const japaneseVolumeCut = Boolean(setId?.startsWith("maki"));
    if (
      requestedLang &&
      !japaneseVolumeCut &&
      (row.lang ?? "").trim().toLowerCase() !== requestedLang
    )
      continue;
    if (seen.has(row.printKey)) continue;
    seen.add(row.printKey);
    out.push(toCandidate(row));
    if (out.length >= limit) break;
  }
  /*
    Parcours / recherche bornés à une extension : même pool que la check-list
    (papier + decks). Sinon NI-050 (garantie starter S4, hors `print_sets`)
    apparaît en check-list mais pas dans le sélecteur filtré sur S4.
  */
  if (setId) {
    const lang = requestedLang || undefined;
    let merged = unionNarutoSetPrintsWithOfficialFrChecklist(
      out,
      setId,
      lang,
    );
    merged = unionNarutoSetPrintsWithSeriesDeckGuarantees(
      merged,
      setId,
      lang,
    );
    if (trimmed) {
      const baseKeys = new Set(out.map((row) => row.printKey));
      merged = merged.filter(
        (row) =>
          baseKeys.has(row.printKey) ||
          narutoPrintCandidateMatchesQuery(row, trimmed, compact),
      );
    }
    merged.sort((a, b) => {
      const byNumber = compareNarutoCollectors(a.reference, b.reference);
      if (byNumber !== 0) return byNumber;
      return compareNarutoLangs(a.language, b.language);
    });
    /*
      Filtre set actif : chaque ligne porte **ce** set (reprints multi-séries,
      garanties deck). Sinon le sélecteur affichait encore le set_code primaire
      (TA-074 → s2) alors qu'on parcourt S3.
    */
    return merged
      .map((row) => stampNarutoCandidateSet(row, setId))
      .slice(0, limit);
  }
  /*
    Paper FR checklist may list one number in several series while sqlite still
    has a single set-scoped row (ex. TA-074 on S2+S3). Surface each set-scoped
    key in unfiltered search so the picker matches the check-list.
  */
  const expanded = expandFrChecklistSetScopedSiblings(out, requestedLang);
  return expanded.slice(0, limit);
}

function expandFrChecklistSetScopedSiblings(
  rows: readonly PrintCandidate[],
  language?: string | null,
): PrintCandidate[] {
  const lang = language?.trim().toLowerCase();
  if (lang && lang !== "fr") return [...rows];
  const out = [...rows];
  const seen = new Set(rows.map((row) => row.printKey));
  for (const row of rows) {
    /*
      Tourney `promo-ta0074` is not a retail S2/S3 twin. Expanding it would
      paint « TA-074 · promo » / rarity promo onto Series 2–3 checklist slots.
    */
    if (isNarutoPromoCandidate(row)) continue;
    const tail = narutoCollectorRawFromPrintKey(row.printKey);
    if (!tail) continue;
    const sets = officialFrChecklistSetsForNumber(tail);
    if (sets.length < 2) continue;
    for (const set of sets) {
      const key = mintNarutoPrintKey(tail, set);
      if (!key || seen.has(key)) continue;
      const looked = lookupNarutoPrint(key, {
        language: lang || row.language || undefined,
      });
      out.push(
        looked ?? {
          ...stampNarutoCandidateSet(row, set),
          printKey: key,
        },
      );
      seen.add(key);
    }
  }
  return out;
}

/** Texte / n° collectionneur — pour garder les extras deck après union. */
function narutoPrintCandidateMatchesQuery(
  row: PrintCandidate,
  trimmed: string,
  compact: string,
): boolean {
  const hay = [row.printKey, row.reference, row.title]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  const q = trimmed.toLowerCase();
  if (hay.includes(q)) return true;
  const hayCompact = hay.replace(/[\s-]/g, "");
  if (compact && hayCompact.includes(compact)) return true;
  for (const needle of narutoCollectorSearchNeedles(trimmed)) {
    const n = needle.toLowerCase().replace(/[\s-]/g, "");
    if (n && hayCompact.includes(n)) return true;
  }
  return false;
}

/**
 * Collector / disk id from a set-scoped key.
 * `naruto:s2-ta0074` → `ta0074` (not `s2-ta0074`, which `narutoCatalogueLineForCard`
 * misreads as EN CCG and then stamps USA series titles on FR rows).
 */
function narutoCollectorRawFromPrintKey(printKey: string): string {
  const parsed = parsePrintKey(printKey);
  if (!parsed) return printKey.replace(/^naruto:/i, "").trim();
  if (parsed.grouping) return `${parsed.number}-${parsed.grouping}`;
  if (parsed.set === "promo" && !parsed.number.endsWith("-promo")) {
    return `${parsed.number}-promo`;
  }
  if (
    parsed.set === "prerelease" &&
    !parsed.number.endsWith("-prerelease")
  ) {
    return `${parsed.number}-prerelease`;
  }
  return parsed.number;
}

function isNarutoPromoChannelDetail(row: {
  setCode?: string | null;
  number?: string | null;
}): boolean {
  const code = (row.setCode ?? "").trim().toLowerCase();
  if (code === "promo") return true;
  const id = parseNarutoCollector(row.number ?? "");
  return (
    id?.grouping === "promo" ||
    id?.grouping === "cdf" ||
    id?.family === "promo"
  );
}

function isNarutoPromoCandidate(row: PrintCandidate): boolean {
  if (isNarutoPromoChannelDetail(row)) return true;
  const raw = narutoCollectorRawFromPrintKey(row.printKey);
  const id = parseNarutoCollector(raw);
  return id?.grouping === "promo" || id?.grouping === "cdf";
}

/** Sets from sqlite `print_sets` for one print key. */
function printSetsFromIndex(printKey: string): string[] {
  const sets = new Set<string>();
  for (const pack of narutoIndexPacks()) {
    const db = ensureNarutoPackIndex(pack);
    if (!db || !hasPrintSetsTable(db)) continue;
    for (const row of db
      .prepare(
        `SELECT LOWER(set_code) AS setCode
           FROM print_sets
          WHERE print_key = ?`,
      )
      .all(printKey) as { setCode: string }[]) {
      const code = row.setCode?.trim().toLowerCase();
      if (code && code !== "unknown") sets.add(code);
    }
  }
  return [...sets];
}

/** Series whose decks / deck bundles guarantee this print key. */
function deckSetsForPrintKey(printKey: string): string[] {
  const key = printKey.trim();
  if (!key) return [];
  const sets = new Set<string>();
  for (const entry of loadSealedProductEntries(NARUTO_PACK_ID)) {
    if (entry.kind !== "deck" && entry.kind !== "deck_bundle") continue;
    const productSet = (entry.catalogueSetId ?? entry.setCode ?? "")
      .trim()
      .toLowerCase();
    if (!productSet) continue;
    for (const link of entry.guaranteedPrints ?? []) {
      if ((link.printKey ?? "").trim() === key) {
        sets.add(productSet);
        break;
      }
    }
  }
  return [...sets];
}

function compareNarutoSetCodes(a: string, b: string): number {
  const series = (code: string) => {
    const m = /^s(\d+)$/.exec(code);
    return m ? Number(m[1]) : null;
  };
  const sa = series(a);
  const sb = series(b);
  if (sa != null && sb != null) return sa - sb;
  if (sa != null) return -1;
  if (sb != null) return 1;
  if (a === "promo") return 1;
  if (b === "promo") return -1;
  return a.localeCompare(b);
}

/**
 * Appartenances d'un tirage pour le sélecteur sans filtre set :
 * checklist papier ∪ `print_sets` ∪ garanties deck ∪ set primaire.
 */
export function narutoPrintSetMemberships(
  printKey: string,
  primarySet?: string | null,
): string[] {
  const sets = new Set<string>();
  const primary = primarySet?.trim().toLowerCase();
  if (primary && primary !== "unknown") sets.add(primary);

  const raw = narutoCollectorRawFromPrintKey(printKey);
  const id = parseNarutoCollector(raw);
  if (id?.grouping === "promo" || primary === "promo") {
    return ["promo"];
  }

  for (const code of officialFrChecklistSetsForNumber(raw)) sets.add(code);
  for (const code of printSetsFromIndex(printKey)) sets.add(code);
  for (const code of deckSetsForPrintKey(printKey)) sets.add(code);

  return [...sets].sort(compareNarutoSetCodes);
}

function stampNarutoCandidateSet(
  row: PrintCandidate,
  setCode: string | null | undefined,
): PrintCandidate {
  const code = setCode?.trim().toLowerCase();
  if (!code) return row;
  const raw = narutoCollectorRawFromPrintKey(row.printKey);
  return {
    ...row,
    setCode: code,
    setLabel: narutoSetLabel(code, raw, row.language),
  };
}

const NARUTO_PRINT_DETAIL_SELECT = (db: DatabaseSync) =>
  `SELECT p.print_key AS printKey,
          p.set_code   AS setCode,
          p.number     AS number,
          p.card_type  AS cardType,
          t.lang       AS lang,
          t.full_name  AS fullName,
          t.rarity     AS rarity,
          a.art        AS art,
          a.thumb      AS thumb,
          ${printedColumnSql(db)} AS printed
     FROM prints p
     LEFT JOIN print_titles t
            ON t.print_key = p.print_key
     LEFT JOIN print_assets a
            ON a.print_key = p.print_key AND a.lang = t.lang`;

function lookupNarutoSetScopedPrintDetail(
  printKey: string,
  lang: string,
): NarutoPrintDetail | null {
  const parsed = parsePrintKey(printKey);
  if (!parsed || parsed.game !== "naruto") return null;
  if (!isNarutoCatalogueSetCode(parsed.set)) return null;

  const requestedSet = parsed.set.trim().toLowerCase();
  const number = parsed.grouping
    ? `${parsed.number}-${parsed.grouping}`
    : parsed.number;
  const canonical = canonicalizeNarutoPrintKey(printKey);
  const frChecklist = officialFrChecklistSetsForNumber(number);
  /*
    Never invent a ghost EU s1–s5 key (IT ledger mis-bucket) when the FR
    paper checklist already places the collector elsewhere. Deck guarantees
    and non-EU sets (maki / promo / s6+) stay allowed.
  */
  if (
    /^s[1-5]$/.test(requestedSet) &&
    frChecklist.length > 0 &&
    !frChecklist.includes(requestedSet) &&
    !deckSetsForPrintKey(printKey).includes(requestedSet)
  ) {
    return null;
  }
  const allowed =
    frChecklist.includes(requestedSet) ||
    deckSetsForPrintKey(printKey).includes(requestedSet) ||
    mintNarutoPrintKey(number, requestedSet) === canonical;
  if (!allowed) return null;

  for (const pack of narutoIndexPacks()) {
    const db = ensureNarutoPackIndex(pack);
    if (!db) continue;

    const exact = db
      .prepare(
        `${NARUTO_PRINT_DETAIL_SELECT(db)}
            WHERE LOWER(p.set_code) = ? AND p.number = ?
            ORDER BY (t.lang = ?) DESC
            LIMIT 1`,
      )
      .get(requestedSet, number, lang) as NarutoPrintDetail | undefined;
    if (exact) {
      const row = { ...exact, printKey: canonical };
      return withNarutoRetailArtFallback([row])[0] ?? row;
    }

    const template = db
      .prepare(
        `${NARUTO_PRINT_DETAIL_SELECT(db)}
            WHERE p.number = ?
            ORDER BY (t.lang = ?) DESC
            LIMIT 1`,
      )
      .get(number, lang) as NarutoPrintDetail | undefined;
    if (template) {
      const row = {
        ...template,
        printKey: canonical,
        setCode: requestedSet,
      };
      return withNarutoRetailArtFallback([row])[0] ?? row;
    }
  }
  return null;
}

/**
 * Raw catalogue row for one print — what both the picker candidate and the
 * item metadata are built from, so the two never disagree.
 */
export function lookupNarutoPrintDetail(
  printKey: string,
  opts: { language?: string } = {},
): NarutoPrintDetail | null {
  const lang = (opts.language || "fr").toLowerCase();
  const keys = [...new Set([printKey, canonicalizeNarutoPrintKey(printKey)])];
  for (const pack of narutoIndexPacks()) {
    const db = ensureNarutoPackIndex(pack);
    if (!db) continue;
    for (const key of keys) {
      const row = db
        .prepare(
          `${NARUTO_PRINT_DETAIL_SELECT(db)}
            WHERE p.print_key = ?
            ORDER BY (t.lang = ?) DESC
            LIMIT 1`,
        )
        .get(key, lang) as NarutoPrintDetail | undefined;
      if (row) {
        return withNarutoRetailArtFallback([row])[0] ?? row;
      }
    }
  }
  return lookupNarutoSetScopedPrintDetail(printKey, lang);
}

/**
 * EU UI: JA-only tourney stubs are not Promo (hors série). Prefer the retail
 * checklist sibling so fiche / metadata never show « TE-107 · promo ».
 */
function lookupRetailSiblingForUnattestedPromo(
  row: NarutoPrintDetail,
  lang: string,
): NarutoPrintDetail | null {
  if (lang !== "fr" && lang !== "it") return null;
  if (!isNarutoPromoChannelDetail(row)) return null;
  if (belongsOnNarutoPromoChecklist(row.number)) return null;
  const base =
    narutoRetailDiskNumber(row.number) ?? narutoBaseDiskNumber(row.number);
  if (!base) return null;
  const sets = officialFrChecklistSetsForNumber(base);
  const trySets = sets.length > 0 ? sets : ["s1", "s2", "s3", "s4", "s5", "s6"];
  for (const set of trySets) {
    const key = mintNarutoPrintKey(base, set);
    if (!key || key === row.printKey) continue;
    const hit = lookupNarutoPrintDetail(key, { language: lang });
    if (hit && !isNarutoPromoChannelDetail(hit)) return hit;
  }
  return null;
}

/** One print by key — same shape, so the picker and the item agree. */
export function lookupNarutoPrint(
  printKey: string,
  opts: { language?: string } = {},
): PrintCandidate | null {
  const lang = (opts.language || "fr").toLowerCase();
  const row = lookupNarutoPrintDetail(printKey, opts);
  if (!row) return null;
  const retail = lookupRetailSiblingForUnattestedPromo(row, lang);
  return toCandidate(retail ?? row);
}

export type { NarutoPrintRow };

/**
 * PrintKeys guaranteed by decks / deck bundles of `setId`, including
 * earlier-series reprints those constructed products ship with.
 *
 * « Série 2 complète » = paper checklist ∪ what that series' decks require.
 */
export function narutoSeriesDeckGuaranteePrintKeys(setId: string): string[] {
  const sid = setId.trim();
  if (!sid) return [];
  const keys = new Set<string>();
  for (const entry of loadSealedProductEntries(NARUTO_PACK_ID)) {
    const productSet = (entry.catalogueSetId ?? entry.setCode ?? "").trim();
    if (productSet !== sid) continue;
    if (entry.kind !== "deck" && entry.kind !== "deck_bundle") continue;
    for (const link of entry.guaranteedPrints ?? []) {
      const key = link.printKey?.trim();
      if (key) keys.add(key);
    }
  }
  return [...keys];
}

function appendMissingPrintCandidates(
  base: readonly PrintCandidate[],
  printKeys: readonly string[],
  language?: string | null,
  setId?: string | null,
): PrintCandidate[] {
  const seen = new Set(base.map((row) => row.printKey));
  const extras: PrintCandidate[] = [];
  const lang = language?.trim().toLowerCase() || undefined;
  const sid = setId?.trim().toLowerCase() || null;
  for (const printKey of printKeys) {
    if (seen.has(printKey)) continue;
    let candidate = lookupNarutoPrint(printKey, { language: lang });
    if (!candidate && sid) {
      const tail = printKey.replace(/^naruto:[^-\r\n]+-/i, "");
      if (tail) {
        for (const otherSet of officialFrChecklistSetsForNumber(tail)) {
          if (otherSet === sid) continue;
          const donorKey = mintNarutoPrintKey(tail, otherSet);
          if (!donorKey || donorKey === printKey) continue;
          const donor = lookupNarutoPrint(donorKey, { language: lang });
          if (donor) {
            candidate = {
              ...stampNarutoCandidateSet(donor, sid),
              printKey,
            };
            break;
          }
        }
      }
    }
    if (!candidate) continue;
    if (
      lang &&
      candidate.language &&
      candidate.language.trim().toLowerCase() !== lang
    ) {
      continue;
    }
    const stamped =
      sid && (candidate.setCode ?? "").trim().toLowerCase() !== "s6"
        ? stampNarutoCandidateSet(candidate, sid)
        : candidate;
    extras.push(stamped);
    seen.add(printKey);
  }
  return extras.length ? [...base, ...extras] : [...base];
}

/**
 * Paper FR checklist gaps vs stale `print_sets` (ex. TA-074 on S3 booster
 * pool — on the poster, missing from an older sqlite membership).
 * FR only: the printed checklists are French.
 */
export function unionNarutoSetPrintsWithOfficialFrChecklist(
  base: readonly PrintCandidate[],
  setId: string,
  language?: string | null,
): PrintCandidate[] {
  const sid = setId.trim().toLowerCase();
  if (!/^s[1-5]$/.test(sid)) return [...base];
  const lang = language?.trim().toLowerCase() || undefined;
  if (lang && lang !== "fr") return [...base];

  const keys: string[] = [];
  for (const id of officialFrChecklistIds(sid)) {
    const printKey = mintNarutoPrintKey(id, sid);
    if (printKey) keys.push(printKey);
  }
  return appendMissingPrintCandidates(base, keys, lang ?? "fr", sid);
}

/**
 * Append deck-only reprints missing from the paper `print_sets` list.
 * Order: paper checklist first, then newly attached deck guarantees.
 */
export function unionNarutoSetPrintsWithSeriesDeckGuarantees(
  base: readonly PrintCandidate[],
  setId: string,
  language?: string | null,
): PrintCandidate[] {
  return appendMissingPrintCandidates(
    base,
    narutoSeriesDeckGuaranteePrintKeys(setId),
    language,
    setId,
  );
}

/**
 * Tous les tirages d'une extension, sans plafond — pour la check-list.
 *
 * `searchNarutoPrints` se borne à deux cents lignes, ce qui convient au
 * sélecteur d'ajout et jamais à un décompte : compter les manquantes d'une
 * Série 1 de 182 cartes sur un échantillon annoncerait une complétion fausse.
 *
 * La langue borne le résultat. Sans elle, on rendrait les tirages de toutes
 * les langues confondues, et « la Série 1 est complète » ne voudrait plus rien
 * dire.
 *
 * Union papier FR + decks : checklist imprimée (reprints multi-séries) et
 * starters — sans eux, « saison complète » est un mensonge.
 *
 * FR S6 : retail boosters annulé ; le chapitre liste les inédites Kana / DVD
 * + reprints MIJ (`isNarutoS6FrPrintedNumber`), pas la préprod carddass.fr.
 */
export function listNarutoSetPrints(input: {
  setId: string;
  language?: string | null;
  /** Admin — include `printed: false` (HTML phantoms, cancelled S6). */
  includeUnprinted?: boolean;
}): PrintCandidate[] {
  const setId = input.setId.trim();
  if (!setId) return [];
  const lang = input.language?.trim().toLowerCase();
  const rows = searchNarutoPrints("", {
    setId,
    language: input.language ?? undefined,
    limit: 5000,
    includeUnprinted: input.includeUnprinted,
  });
  const base = lang
    ? rows.filter((row) => (row.language ?? "").trim().toLowerCase() === lang)
    : rows;
  const withPaper = unionNarutoSetPrintsWithOfficialFrChecklist(
    base,
    setId,
    lang,
  );
  return unionNarutoSetPrintsWithSeriesDeckGuarantees(withPaper, setId, lang);
}
