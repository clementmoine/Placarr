/**
 * Moisson tcgdex → catalogue Pokémon local.
 *
 * Le pack Pokémon a été bâti pour extraire le foil du client TCG Live : son
 * stockage local dit *comment une carte brille*, pas *comment elle s'appelle*.
 * Mesuré le 2026-08-20 — `cards-index.json` tient 93 777 entrées et **zéro nom,
 * zéro rareté** ; ce sont des faces et des masques. L'identité des cartes venait
 * de l'API, en distant, si bien qu'une recherche par nom devait sortir sur le
 * réseau : 327 ms, contre 42 à 56 ms pour les packs qui lisent leur base.
 *
 * **Une requête par set**, pas une par carte. `/sets/{id}` rend la liste
 * complète de ses cartes avec leurs noms — deux cents sets par langue au lieu
 * de vingt mille fiches. C'est ce qui rend la moisson tenable, et poliment
 * courte pour l'hôte.
 *
 * Ce que ça ramène : identité, nom, image, nom de set et de série. Pas la
 * rareté, que le brief d'un set ne porte pas — elle exigerait une requête par
 * carte, et la recherche distante ne l'avait pas non plus.
 */
import { httpGet } from "@/lib/http/httpClient";

import {
  pruneTcgdexSets,
  tcgdexHarvestedSets,
  writeTcgdexSet,
  type TcgdexPrintRow,
  type TcgdexTitleRow,
} from "./indexStore";
import { digitalOnlySetIds } from "./digitalOnly";
import { printKeyFromTcgdexIds } from "./fetch";

const API_BASE = "https://api.tcgdex.net/v2";

/** Les langues que le catalogue sert. Le reste de l'app est français d'abord. */
export const TCGDEX_HARVEST_LANGUAGES = ["fr", "en"] as const;

type RawSetBrief = {
  id?: string;
  name?: string;
  cardCount?: { total?: number; official?: number };
};

type RawSetDetail = {
  id?: string;
  name?: string;
  releaseDate?: string;
  serie?: { id?: string; name?: string };
  cardCount?: { total?: number; official?: number };
  cards?: { id?: string; localId?: string; name?: string; image?: string }[];
};

export type HarvestTcgdexOptions = {
  languages?: readonly string[];
  /** Refait les sets déjà complets. Sans ça, seul le manquant est demandé. */
  force?: boolean;
  /** Politesse envers l'hôte, entre deux sets. */
  delayMs?: number;
  /** S'arrête après ce nombre de sets — pour une première passe de preuve. */
  limit?: number;
  onProgress?: (message: string) => void;
};

const sleep = (ms: number) =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    const response = await httpGet<T>(url, { timeout: 30_000 });
    return (response.data ?? null) as T | null;
  } catch {
    return null;
  }
}

export async function harvestTcgdexCatalogue(
  opts: HarvestTcgdexOptions = {},
): Promise<{
  sets: number;
  skipped: number;
  prints: number;
  titles: number;
  /** Ce que l'API annonce mais ne rend pas. */
  emptyAtSource: string[];
  /** Sets dont l'identifiant interdit une clé de tirage. */
  unkeyable: string[];
  /** Sets 100 % numériques, hors catalogue par principe. */
  digitalOnly: string[];
}> {
  const languages = opts.languages ?? TCGDEX_HARVEST_LANGUAGES;
  const delayMs = opts.delayMs ?? 200;
  const held = opts.force ? new Map<string, number>() : tcgdexHarvestedSets();
  const report = opts.onProgress ?? (() => {});

  let sets = 0;
  let skipped = 0;
  let prints = 0;
  let titles = 0;
  const emptyAtSource: string[] = [];
  const unkeyable: string[] = [];
  const digitalOnlySkipped: string[] = [];

  /*
    Une étagère tient du carton. Les sets 100 % numériques — Pokémon TCG Pocket
    — n'entrent pas au catalogue : c'est la règle du projet, et la recherche
    distante les écartait déjà. Les écarter **à la moisson** plutôt qu'à la
    lecture évite de stocker ce qu'on refuse de servir, et surtout évite qu'un
    futur chemin de lecture oublie le filtre.
  */
  const digital = await digitalOnlySetIds();
  // Ce qu'une passe antérieure aurait laissé entrer avant que le filtre existe.
  const pruned = pruneTcgdexSets([...digital]);
  if (pruned > 0) report(`${pruned} tirages numériques retirés du catalogue`);

  for (const language of languages) {
    const index = await fetchJson<RawSetBrief[]>(
      `${API_BASE}/${language}/sets`,
    );
    if (!index?.length) {
      emptyAtSource.push(`${language}:index`);
      continue;
    }
    report(`${language} : ${index.length} sets annoncés`);

    let seen = 0;
    for (const brief of index) {
      const setId = brief.id?.trim();
      if (!setId) continue;
      if (opts.limit && seen >= opts.limit) break;
      seen += 1;

      /*
        Le compte annoncé sert de critère de complétude. Un set dont on tient
        déjà toutes les cartes n'est pas redemandé — c'est ce qui fait la
        différence entre un rattrapage et un recommencement. Un jeu qui sort
        encore ajoute des sets ; les anciens, eux, ne bougent plus.
      */
      if (digital.has(setId.toLowerCase())) {
        digitalOnlySkipped.push(`${language}:${setId}`);
        continue;
      }

      const announced = brief.cardCount?.total ?? 0;
      const already = held.get(`${setId}|${language}`) ?? 0;
      if (!opts.force && announced > 0 && already >= announced) {
        skipped += 1;
        continue;
      }

      if (delayMs > 0) await sleep(delayMs);
      const detail = await fetchJson<RawSetDetail>(
        `${API_BASE}/${language}/sets/${encodeURIComponent(setId)}`,
      );
      const cards = detail?.cards ?? [];
      if (cards.length === 0) {
        // L'API annonce un compte et ne rend rien : trou côté source, pas ici.
        emptyAtSource.push(`${language}:${setId}`);
        continue;
      }

      const setName = detail?.name?.trim() || setId;
      const serieName = detail?.serie?.name?.trim() || null;
      const printRows: TcgdexPrintRow[] = [];
      const titleRows: TcgdexTitleRow[] = [];

      for (const card of cards) {
        const providerId = card.id?.trim();
        const localId = card.localId?.trim();
        const name = card.name?.trim();
        if (!providerId || !localId || !name) continue;
        const printKey = printKeyFromTcgdexIds(setId, localId);
        if (!printKey) continue;
        printRows.push({
          printKey,
          setId,
          localId,
          providerId,
          imageBaseUrl: card.image?.trim() || null,
        });
        titleRows.push({
          printKey,
          lang: language,
          name,
          setName,
          serieName,
        });
      }

      if (printRows.length === 0) {
        /*
          Aucune clé constructible. Le tiret sépare le set du numéro dans une
          `printKey`, si bien qu'un identifiant qui en contient — `tk-ex-latia`,
          `P-A`, `2018sm-fr` — ne peut pas en produire. Ces cartes n'étaient pas
          davantage adressables par le chemin distant : c'est une limite du
          modèle d'identité, pas de cette moisson.
        */
        unkeyable.push(`${language}:${setId}`);
        continue;
      }

      const written = writeTcgdexSet({
        set: {
          setId,
          lang: language,
          name: setName,
          serieName,
          releasedAt: detail?.releaseDate?.trim() || null,
          totalCount: detail?.cardCount?.total ?? printRows.length,
        },
        prints: printRows,
        titles: titleRows,
      });
      sets += 1;
      prints += written.prints;
      titles += written.titles;
      if (sets % 20 === 0) report(`   ${sets} sets moissonnés…`);
    }
  }

  report(
    `Pokémon : ${sets} sets écrits, ${skipped} déjà complets, ${titles} titres` +
      ` — ${emptyAtSource.length} vides à la source, ${unkeyable.length} sans clé possible,` +
      ` ${digitalOnlySkipped.length} numériques écartés`,
  );
  return {
    sets,
    skipped,
    prints,
    titles,
    emptyAtSource,
    unkeyable,
    digitalOnly: digitalOnlySkipped,
  };
}
