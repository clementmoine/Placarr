/**
 * Print search for the Naruto CCG local catalogue.
 *
 * A card carries no barcode, so a shelf can never scan its way to one: the app
 * asks providers for candidates and the user picks a print. Everything is read
 * from `data/naruto/carddass/catalog.sqlite` — the pack is a closed corpus, so there
 * is no network call and no pagination to chase.
 */
import {
  NARUTO_CARDDASS_EFFECT_PACK_ID,
  NARUTO_CARDDASS_FINISHES,
  NARUTO_CARDDASS_FULL_FOIL_MASK_URL,
  NARUTO_CCG_SLEEVE_BACK_URL,
} from "@/effects/narutoccg";
import type { PrintCandidate } from "@/types/providerModule";

import {
  ensureNarutoPackIndex,
  narutoIndexPacks,
  type NarutoPrintRow,
} from "./indexStore";
import type { DatabaseSync } from "node:sqlite";

function printedColumnSql(db: DatabaseSync): string {
  const cols = db.prepare("PRAGMA table_info(print_assets)").all() as {
    name: string;
  }[];
  return cols.some((col) => col.name === "printed") ? "a.printed" : "1";
}
import {
  canonicalizeNarutoPrintKey,
  compareNarutoCollectors,
  compareNarutoLangs,
  formatNarutoReference,
  narutoCollectorSearchNeedles,
} from "./collectorIdentity";
import {
  narutoCardPathFromCollector,
  narutoAssetsCardUrl,
} from "./narutoCardPath";
import { japaneseReleaseBands, listJapaneseReleases } from "./sources/japaneseVolumes";
import {
  finalizeSetOptions,
  isAnsweredQuery,
  setScopedWhere,
} from "@/providers/shared/cardCatalogue/sets";

import { narutoSetLabel, narutoSetsUnreleasedInFrench } from "./facts";
import { narutoCatalogueLineForCard, NARUTO_PACK_ID } from "./packs";

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

/** CCG prints share the USA sleeve; Carddass falls through to the pack back. */
export function narutoCandidateCardBackUrl(
  number: string,
  setCode?: string,
): string | undefined {
  return narutoCatalogueLineForCard(number, setCode) === "en-ccg"
    ? NARUTO_CCG_SLEEVE_BACK_URL
    : undefined;
}

export type NarutoPrintDetail = {
  printKey: string;
  setCode: string;
  number: string;
  cardType: string | null;
  lang: string;
  fullName: string | null;
  rarity: string | null;
  art: string | null;
  thumb: string | null;
  printed?: boolean | null;
};

/** Canonical vocabulary (`items.finishes.normal`), not an invented word. */
const PLAIN_FINISH = "normal";

/**
 * Every card is offered plain or holo, whatever the catalogue says its rarity
 * is.
 *
 * Deriving the finish from the rarity was tempting — the catalogue has no
 * finish axis — but the stored rarity is not trustworthy enough to *remove* an
 * option: `ta158` is filed `commune` and exists in holo in a real collection.
 * The parser also flattens the site's four grades (Commune, Rare, Holo, Holo
 * rare) into two, so a wrong guess would silently deny a collector the copy
 * they own. Rarity stays a displayed fact; it does not gate what you can hold.
 */
const NARUTO_FINISHES = [PLAIN_FINISH, ...NARUTO_CARDDASS_FINISHES];

function toCandidate(row: NarutoPrintDetail): PrintCandidate {
  const pathId = narutoCardPathFromCollector(row.number, row.lang);
  const finishes = NARUTO_FINISHES;
  const printed = row.printed !== false;
  const sleeveBack = narutoCandidateCardBackUrl(row.number, row.setCode);
  return {
    printKey: row.printKey,
    // A print with no title yet still deserves to be pickable: the reference
    // alone identifies it, and hiding it would make the card unaddable.
    title:
      row.fullName?.trim() || formatNarutoReference(row.setCode, row.number),
    reference: formatNarutoReference(row.setCode, row.number),
    // `CL-001` ne dit pas la série ; le sélecteur de catalogue en a besoin.
    setLabel: narutoSetLabel(row.setCode, row.number),
    ...(row.rarity ? { rarity: row.rarity } : {}),
    ...(row.cardType
      ? { category: CARD_FAMILY[row.cardType.toLowerCase()] ?? row.cardType }
      : {}),
    ...(row.art && pathId
      ? { imageUrl: narutoAssetsCardUrl(NARUTO_PACK_ID, pathId, row.art) }
      : {}),
    ...(row.thumb && pathId
      ? { thumbnailUrl: narutoAssetsCardUrl(NARUTO_PACK_ID, pathId, row.thumb) }
      : {}),
    language: row.lang,
    printed,
    finishes,
    // Derived from the same array, as Lorcana and TCGdex do, so the two can
    // never drift apart.
    plainFinishes: finishes.filter((finish) => finish === PLAIN_FINISH),
    // Read only once a shiny finish is resolved, so a plain copy stays flat.
    foilMaskUrl: NARUTO_CARDDASS_FULL_FOIL_MASK_URL,
    /**
     * One effect pack. CCG prints stamp the USA sleeve so Storm 3 FR does
     * not flip to the Carddass verso.
     */
    effectPack: NARUTO_CARDDASS_EFFECT_PACK_ID,
    ...(sleeveBack ? { cardBackUrl: sleeveBack } : {}),
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
  const found = new Map<string, Set<string>>();
  for (const pack of narutoIndexPacks()) {
    const db = ensureNarutoPackIndex(pack);
    if (!db) continue;
    for (const row of db
      .prepare(
        `SELECT p.set_code AS setCode, t.lang AS lang
           FROM prints p JOIN print_titles t ON t.print_key = p.print_key
          WHERE t.lang IS NOT NULL AND TRIM(t.lang) <> ''
          GROUP BY 1, 2`,
      )
      .all() as { setCode: string; lang: string }[]) {
      const code = row.setCode?.trim();
      const lang = row.lang.trim().toLowerCase();
      if (!code || lang === "ja") continue;
      const set = found.get(code) ?? new Set<string>();
      set.add(lang);
      found.set(code, set);
    }
  }
  return new Map(
    [...found].map(([code, langs]) => [
      code,
      [...langs]
        .filter(
          (lang) =>
            !(lang === "fr" && unreleasedInFrench.has(code.toLowerCase())),
        )
        .sort(),
    ]),
  );
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
export function listNarutoPrintSets(
  _language?: string | null,
): { id: string; label: string; group?: string; languages?: string[] }[] {
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
    for (const row of db
      .prepare(`SELECT DISTINCT set_code AS setCode FROM prints`)
      .all() as { setCode: string }[]) {
      const code = row.setCode?.trim();
      if (code && code !== "unknown" && !japaneseIds.has(code))
        european.add(code);
    }
  }

  return [
    ...finalizeSetOptions(
      [...european].map((code) => ({
        id: code,
        label: narutoSetLabel(code),
        group: EUROPEAN_CUT,
        languages: europeanLanguages.get(code) ?? [],
        /*
          Le rang est dans le **code** — `s5` — pas dans le libellé, qui porte
          souvent le nom anglais du set. Trié par texte, la liste s'ouvrait sur
          « A New Chronicle », qui est la douzième série.
        */
        sortKey: /^s(\d+)$/.exec(code) ? Number(code.slice(1)) : null,
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
  opts: { language?: string; limit?: number; setId?: string | null } = {},
): PrintCandidate[] {
  const trimmed = query.trim();
  const setId = opts.setId?.trim().toLowerCase();
  // Une extension seule est une question complète : « montre-moi ce set ».
  if (!isAnsweredQuery(trimmed, setId)) return [];

  const lang = (opts.language || "fr").toLowerCase();
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
  const japaneseBands = setId ? japaneseReleaseBands(setId) : [];
  /*
    Un tirage qui porte un `grouping` réutilise le numéro d'un autre sans être
    lui : les quatre bonus PS1 (`-ps`) et les promos (`-promo`) tombent dans les
    bornes du 巻ノ一 sans en faire partie. La source les compte d'ailleurs à
    part — « 70種類＋P ». Les écarter fait tomber notre décompte exactement sur
    le sien, ce qui rend la découpe vérifiable.
  */
  const japaneseScope =
    japaneseBands.length > 0
      ? {
          clause: `(p.grouping IS NULL OR p.grouping = '') AND (${japaneseBands
            .map(
              () =>
                `(p.card_type = ? AND CAST(REPLACE(LOWER(p.number), p.card_type, '') AS INTEGER) BETWEEN ? AND ?)`,
            )
            .join(" OR ")})`,
          params: japaneseBands.flatMap((band) => [
            band.family,
            band.from,
            band.to,
          ]) as (string | number)[],
        }
      : null;

  const scope = setScopedWhere({
    setColumn: "p.set_code",
    setId: japaneseScope ? null : setId,
    textClause: trimmed
      ? `LOWER(t.full_name) LIKE ?
               OR LOWER(p.print_key) LIKE ?
               OR LOWER(p.print_key) LIKE ?
               OR ${numberClause}`
      : null,
    /*
      La clé se cherche sous ses **deux** formes. La comparaison ne se faisait
      que sur la forme compacte — tirets retirés — alors que les clés sont
      stockées avec : coller `naruto:ni-0014`, l'identifiant exact de la carte,
      ne rendait donc rien du tout.
    */
    textParams: [like, like, likeCompact, ...numberParams],
  });

  const rows: NarutoPrintDetail[] = [];
  for (const pack of narutoIndexPacks()) {
    const db = ensureNarutoPackIndex(pack);
    if (!db) continue;
    const printedSql = printedColumnSql(db);
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
            WHERE ${scope.where}${japaneseScope ? ` AND ${japaneseScope.clause}` : ""}
            ORDER BY (t.lang = ?) DESC, p.number
            LIMIT ?`,
        )
        .all(
          ...scope.params,
          ...(japaneseScope?.params ?? []),
          lang,
          limit * 3,
        ) as NarutoPrintDetail[]),
    );
  }

  rows.sort((a, b) => {
    const byNumber = compareNarutoCollectors(a.number, b.number);
    if (byNumber !== 0) return byNumber;
    return compareNarutoLangs(a.lang, b.lang);
  });

  const seen = new Set<string>();
  const out: PrintCandidate[] = [];
  for (const row of rows) {
    if (row.printed === false) continue;
    if (seen.has(row.printKey)) continue;
    seen.add(row.printKey);
    out.push(toCandidate(row));
    if (out.length >= limit) break;
  }
  return out;
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
                    ON a.print_key = p.print_key AND a.lang = t.lang
            WHERE p.print_key = ?
            ORDER BY (t.lang = ?) DESC
            LIMIT 1`,
        )
        .get(key, lang) as NarutoPrintDetail | undefined;
      if (row) return row;
    }
  }
  return null;
}

/** One print by key — same shape, so the picker and the item agree. */
export function lookupNarutoPrint(
  printKey: string,
  opts: { language?: string } = {},
): PrintCandidate | null {
  const row = lookupNarutoPrintDetail(printKey, opts);
  return row ? toCandidate(row) : null;
}

export type { NarutoPrintRow };

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
 */
export function listNarutoSetPrints(input: {
  setId: string;
  language?: string | null;
}): PrintCandidate[] {
  const setId = input.setId.trim();
  if (!setId) return [];
  const rows = searchNarutoPrints("", {
    setId,
    language: input.language ?? undefined,
    limit: 5000,
  });
  const lang = input.language?.trim().toLowerCase();
  if (!lang) return rows;
  return rows.filter(
    (row) => (row.language ?? "").trim().toLowerCase() === lang,
  );
}
