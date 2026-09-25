import { SET_ENUMERATION_LIMIT } from "@/providers/shared/cardCatalogue/setPrints";
/**
 * Catalogue Pokémon **local**, sous `data/pokemon/catalog.sqlite`.
 *
 * Même contrat que les autres packs TCG. Le dump TCG Live (`live_cards`,
 * `card_foil`) vit à part dans `live.sqlite` — son écrivain réécrit le fichier
 * entier à chaque synchro, donc il ne partage pas ce fichier.
 *
 * Les deux magasins ne disent d'ailleurs pas la même chose : Live dit
 * *comment une carte brille*, celui-ci dit *ce qu'elle est*.
 *
 * Une entrée par **carte et par langue** : le même tirage s'appelle
 * « Mystherbe » en français et « Oddish » en anglais, et les deux se cherchent.
 */
import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

import {
  finalizeSetOptions,
  isAnsweredQuery,
  isUsableSetLabel,
  setScopedWhere,
} from "@/providers/shared/cardCatalogue/sets";

import {
  ensurePokemonDbLayout,
  pokemonIdentityDbPath,
} from "@/providers/pokemon/paths";

export type TcgdexPrintRow = {
  printKey: string;
  setId: string;
  localId: string;
  providerId: string;
  imageBaseUrl: string | null;
};

export type TcgdexTitleRow = {
  printKey: string;
  lang: string;
  name: string;
  setName: string | null;
  serieName: string | null;
};

export type TcgdexSetRow = {
  setId: string;
  lang: string;
  name: string;
  serieName: string | null;
  releasedAt: string | null;
  totalCount: number | null;
  /** Main-set size for collector labels (`cardCount.official`). */
  officialCount: number | null;
};

/** Une ligne de recherche : le tirage et son titre, joints. */
export type TcgdexSearchRow = {
  printKey: string;
  setId: string;
  localId: string;
  providerId: string;
  imageBaseUrl: string | null;
  lang: string;
  name: string;
  setName: string | null;
  serieName: string | null;
  /**
   * Printed set size for `004/015` labels — **official only**, never the
   * harvest `total` (secrets push past the corner denominator: 158/128).
   */
  setOfficialCount: number | null;
};

export function tcgdexDbPath(): string {
  ensurePokemonDbLayout();
  return pokemonIdentityDbPath();
}

let activeDb: DatabaseSync | null = null;
let activePath: string | null = null;

export function resetTcgdexIndexCache(): void {
  try {
    activeDb?.close();
  } catch {
    /* déjà fermée */
  }
  activeDb = null;
  activePath = null;
}

function createSchema(db: DatabaseSync): void {
  /*
    `IF NOT EXISTS`, jamais de `DROP` : la moisson est **incrémentale**. Un jeu
    qui sort encore se rattrape set par set, et repartir de zéro à chaque passe
    coûterait deux cents requêtes pour retrouver ce qu'on avait déjà.
  */
  db.exec(`
    CREATE TABLE IF NOT EXISTS prints (
      print_key TEXT PRIMARY KEY,
      set_id TEXT NOT NULL,
      local_id TEXT NOT NULL,
      provider_id TEXT NOT NULL,
      image_base_url TEXT
    );

    CREATE TABLE IF NOT EXISTS print_titles (
      print_key TEXT NOT NULL,
      lang TEXT NOT NULL,
      name TEXT NOT NULL,
      set_name TEXT,
      serie_name TEXT,
      PRIMARY KEY (print_key, lang),
      FOREIGN KEY (print_key) REFERENCES prints(print_key) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS sets (
      set_id TEXT NOT NULL,
      lang TEXT NOT NULL,
      name TEXT NOT NULL,
      serie_name TEXT,
      released_at TEXT,
      total_count INTEGER,
      official_count INTEGER,
      harvested_at TEXT,
      PRIMARY KEY (set_id, lang)
    );

    CREATE INDEX IF NOT EXISTS idx_prints_set ON prints(set_id);
    CREATE INDEX IF NOT EXISTS idx_titles_name ON print_titles(name);
  `);
  migrateTcgdexSetsColumns(db);
}

/**
 * Bases déjà moissonnées n'ont pas `official_count` dans le CREATE initial.
 * Sans ALTER, la requête de recherche échoue entière → checklist sans /015.
 */
const ADDED_SET_COLUMNS: ReadonlyArray<{ name: string; ddl: string }> = [
  { name: "official_count", ddl: "INTEGER" },
];

function migrateTcgdexSetsColumns(db: DatabaseSync): void {
  try {
    const present = new Set(
      (db.prepare(`PRAGMA table_info(sets)`).all() as { name: string }[]).map(
        (row) => row.name,
      ),
    );
    for (const column of ADDED_SET_COLUMNS) {
      if (present.has(column.name)) continue;
      db.exec(`ALTER TABLE sets ADD COLUMN ${column.name} ${column.ddl}`);
    }
  } catch {
    /* illisible / verrouillée — la lecture retombera sans le dénominateur */
  }
}

export function writeTcgdexSet(input: {
  set: TcgdexSetRow;
  prints: readonly TcgdexPrintRow[];
  titles: readonly TcgdexTitleRow[];
  dbPath?: string;
}): { prints: number; titles: number } {
  const dbPath = input.dbPath ?? tcgdexDbPath();
  mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new DatabaseSync(dbPath);
  try {
    db.exec("PRAGMA busy_timeout = 30000");
    createSchema(db);
    const insertPrint = db.prepare(`
      INSERT INTO prints (print_key, set_id, local_id, provider_id, image_base_url)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(print_key) DO UPDATE SET
        set_id = excluded.set_id,
        local_id = excluded.local_id,
        provider_id = excluded.provider_id,
        -- Une URL par tirage : préférer FR, puis EN, puis le reste (souvent JA).
        -- Sans ça, une passe EN (ou JA) figeait la face anglaise pour la check-list FR.
        image_base_url = CASE
          WHEN excluded.image_base_url IS NULL OR excluded.image_base_url = ''
            THEN prints.image_base_url
          WHEN prints.image_base_url IS NULL OR prints.image_base_url = ''
            THEN excluded.image_base_url
          WHEN excluded.image_base_url LIKE '%://assets.tcgdex.net/fr/%'
            THEN excluded.image_base_url
          WHEN prints.image_base_url LIKE '%://assets.tcgdex.net/fr/%'
            THEN prints.image_base_url
          WHEN excluded.image_base_url LIKE '%://assets.tcgdex.net/en/%'
            THEN excluded.image_base_url
          WHEN prints.image_base_url LIKE '%://assets.tcgdex.net/en/%'
            THEN prints.image_base_url
          ELSE prints.image_base_url
        END
    `);
    const insertTitle = db.prepare(`
      INSERT INTO print_titles (print_key, lang, name, set_name, serie_name)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(print_key, lang) DO UPDATE SET
        name = excluded.name,
        set_name = excluded.set_name,
        serie_name = excluded.serie_name
    `);
    const insertSet = db.prepare(`
      INSERT INTO sets (set_id, lang, name, serie_name, released_at, total_count, official_count, harvested_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(set_id, lang) DO UPDATE SET
        name = excluded.name,
        serie_name = excluded.serie_name,
        released_at = excluded.released_at,
        total_count = excluded.total_count,
        official_count = excluded.official_count,
        harvested_at = excluded.harvested_at
    `);

    db.exec("BEGIN IMMEDIATE");
    try {
      for (const row of input.prints) {
        insertPrint.run(
          row.printKey,
          row.setId,
          row.localId,
          row.providerId,
          row.imageBaseUrl,
        );
      }
      for (const row of input.titles) {
        insertTitle.run(
          row.printKey,
          row.lang,
          row.name,
          row.setName,
          row.serieName,
        );
      }
      insertSet.run(
        input.set.setId,
        input.set.lang,
        input.set.name,
        input.set.serieName,
        input.set.releasedAt,
        input.set.totalCount,
        input.set.officialCount,
        new Date().toISOString(),
      );
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
    return { prints: input.prints.length, titles: input.titles.length };
  } finally {
    db.close();
    resetTcgdexIndexCache();
  }
}

/**
 * Patch `official_count` / `total_count` on existing set rows (no card rewrite).
 * Used when the set index already announced sizes but an older harvest left
 * `official_count` null — labels then fell back to total (`158/158`).
 */
export function patchTcgdexSetCounts(
  rows: readonly {
    setId: string;
    lang: string;
    officialCount?: number | null;
    totalCount?: number | null;
  }[],
  dbPath = tcgdexDbPath(),
): number {
  if (rows.length === 0 || !existsSync(dbPath)) return 0;
  const db = new DatabaseSync(dbPath);
  try {
    db.exec("PRAGMA busy_timeout = 30000");
    createSchema(db);
    const update = db.prepare(`
      UPDATE sets
         SET official_count = COALESCE(?, official_count),
             total_count = COALESCE(?, total_count)
       WHERE LOWER(set_id) = LOWER(?) AND lang = ?
    `);
    let touched = 0;
    db.exec("BEGIN IMMEDIATE");
    try {
      for (const row of rows) {
        const setId = row.setId.trim();
        const lang = row.lang.trim().toLowerCase();
        if (!setId || !lang) continue;
        const official =
          row.officialCount != null && Number.isFinite(row.officialCount)
            ? Math.trunc(row.officialCount)
            : null;
        const total =
          row.totalCount != null && Number.isFinite(row.totalCount)
            ? Math.trunc(row.totalCount)
            : null;
        if (official == null && total == null) continue;
        const result = update.run(official, total, setId, lang);
        touched += Number(result.changes ?? 0);
      }
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
    return touched;
  } finally {
    db.close();
    resetTcgdexIndexCache();
  }
}

export function ensureTcgdexIndex(): DatabaseSync | null {
  const dbPath = tcgdexDbPath();
  if (!existsSync(dbPath)) return null;
  if (activeDb && activePath === dbPath) return activeDb;
  {
    const writable = new DatabaseSync(dbPath);
    try {
      migrateTcgdexSetsColumns(writable);
    } finally {
      writable.close();
    }
  }
  const db = new DatabaseSync(dbPath, { readOnly: true });
  activeDb = db;
  activePath = dbPath;
  return db;
}

/**
 * Tirages locaux avec une base CDN TCGdex — cible du filler
 * `art.tcgdex.*` (paper faces). Kits / misc sans image sont exclus.
 */
export function listTcgdexPrintsWithImages(): TcgdexPrintRow[] {
  const db = ensureTcgdexIndex();
  if (!db) return [];
  return db
    .prepare(
      `SELECT print_key AS printKey, set_id AS setId,
              local_id AS localId, provider_id AS providerId,
              image_base_url AS imageBaseUrl
         FROM prints
        WHERE image_base_url IS NOT NULL
          AND TRIM(image_base_url) != ''
        ORDER BY set_id, CAST(local_id AS INTEGER), local_id`,
    )
    .all() as TcgdexPrintRow[];
}

/**
 * Ce qui est déjà moissonné, par set et par langue.
 *
 * Sert au rattrapage : un set dont le compte annoncé est atteint n'est pas
 * redemandé. C'est ce qui rend la moisson incrémentale plutôt qu'un
 * recommencement de deux cents requêtes à chaque passe.
 */
export function tcgdexHarvestedSets(): Map<string, number> {
  const db = ensureTcgdexIndex();
  if (!db) return new Map();
  const rows = db
    .prepare(
      `SELECT s.set_id AS setId, s.lang, COUNT(t.print_key) AS held
         FROM sets s
         LEFT JOIN prints p ON p.set_id = s.set_id
         LEFT JOIN print_titles t
                ON t.print_key = p.print_key AND t.lang = s.lang
        GROUP BY s.set_id, s.lang`,
    )
    .all() as { setId: string; lang: string; held: number }[];
  return new Map(rows.map((row) => [`${row.setId}|${row.lang}`, row.held]));
}

/**
 * Sets that have a FR catalogue row but still only EN (or null) CDN faces.
 * The FR API often gains `image` later — we must re-fetch those sets even when
 * the card count already matches (incremental harvest would otherwise skip).
 */
export function tcgdexSetIdsNeedingFrImageRefresh(): string[] {
  const db = ensureTcgdexIndex();
  if (!db) return [];
  const rows = db
    .prepare(
      `SELECT LOWER(s.set_id) AS setId
         FROM sets s
         JOIN prints p ON LOWER(p.set_id) = LOWER(s.set_id)
        WHERE s.lang = 'fr'
        GROUP BY LOWER(s.set_id)
       HAVING sum(
                CASE
                  WHEN p.image_base_url LIKE '%://assets.tcgdex.net/fr/%'
                  THEN 1 ELSE 0
                END
              ) = 0
          AND sum(
                CASE
                  WHEN p.image_base_url LIKE '%://assets.tcgdex.net/en/%'
                  THEN 1 ELSE 0
                END
              ) > 0`,
    )
    .all() as { setId: string }[];
  return rows.map((row) => row.setId);
}

export function searchTcgdexRows(
  query: string,
  opts: { language?: string; limit?: number; setId?: string | null } = {},
): TcgdexSearchRow[] {
  const db = ensureTcgdexIndex();
  if (!db) return [];

  const trimmed = query.trim().toLowerCase();
  const setId = opts.setId?.trim().toLowerCase();
  // Une extension seule est une question complète : « montre-moi ce set ».
  if (!isAnsweredQuery(trimmed, setId)) return [];

  const lang = (opts.language || "fr").toLowerCase();
  /*
    Le plafond monte à `SET_ENUMERATION_LIMIT` pour la check-list, qui doit
    énumérer un set entier : compté sur les deux cents premières lignes, un set
    de 452 cartes annonçait une complétion fausse, et fausse par excès. Le
    sélecteur, lui, ne demande jamais autant.
  */
  const limit = Math.max(1, Math.min(opts.limit ?? 40, SET_ENUMERATION_LIMIT));
  const like = `%${trimmed}%`;

  const scope = setScopedWhere({
    setColumn: "p.set_id",
    setId,
    textClause: trimmed
      ? `LOWER(t.name) LIKE ?
           OR LOWER(p.print_key) LIKE ?
           OR LOWER(p.set_id || '-' || p.local_id) LIKE ?`
      : null,
    textParams: [like, like, like],
  });

  return db
    .prepare(
      `SELECT p.print_key AS printKey, p.set_id AS setId,
              p.local_id AS localId, p.provider_id AS providerId,
              p.image_base_url AS imageBaseUrl,
              t.lang, t.name, t.set_name AS setName, t.serie_name AS serieName,
              s.official_count AS setOfficialCount
         FROM prints p
         JOIN print_titles t ON t.print_key = p.print_key
         LEFT JOIN sets s
                ON s.set_id = p.set_id AND s.lang = t.lang
        WHERE ${scope.where}
        ORDER BY (t.lang = ?) DESC, p.set_id, CAST(p.local_id AS INTEGER)
        LIMIT ?`,
    )
    .all(...scope.params, lang, limit * 4) as TcgdexSearchRow[];
}

/**
 * Toutes les lignes titre d'une langue — **une** requête pour la check-list
 * (évite ~180× `searchTcgdexRows` par set).
 */
export function listTcgdexRowsForLanguage(language = "fr"): TcgdexSearchRow[] {
  const db = ensureTcgdexIndex();
  if (!db) return [];
  const lang = language.trim().toLowerCase() || "fr";
  return db
    .prepare(
      `SELECT p.print_key AS printKey, p.set_id AS setId,
              p.local_id AS localId, p.provider_id AS providerId,
              p.image_base_url AS imageBaseUrl,
              t.lang, t.name, t.set_name AS setName, t.serie_name AS serieName,
              s.official_count AS setOfficialCount
         FROM prints p
         JOIN print_titles t
           ON t.print_key = p.print_key AND t.lang = ?
         LEFT JOIN sets s
                ON s.set_id = p.set_id AND s.lang = t.lang
        ORDER BY LOWER(p.set_id), CAST(p.local_id AS INTEGER), p.local_id`,
    )
    .all(lang) as TcgdexSearchRow[];
}

/**
 * Les extensions du catalogue local, nommées dans la langue demandée.
 *
 * Uniquement les sets qui ont une ligne `sets` dans **cette** langue — sinon la
 * check-list FR listait des extensions JP (スカーレットex…) en « Sans catalogue »
 * alors que le catalogue japonais, lui, est bien rempli. Le sélecteur de langue
 * de l'étagère ouvre ce corpus ; on ne le mélange pas.
 *
 * Libellé = `bloc — extension` (ex. « Écarlate et Violet — Évolutions
 * Prismatiques »), pas `SV08.5 — …`. Les McDo TCGdex vivent dans une série
 * marketing « Collection McDonald's » : on les rattache au bloc de l'ère lue
 * dans l'id (`2024sv` → `sv` → Écarlate et Violet), observé sur le catalogue.
 *
 * `sortKey` = **bloc puis date** : d'abord la sortie du bloc (1ʳᵉ extension de
 * l'ère), puis la date de l'extension dans le bloc — pour ne pas intercaler
 * POP / promos au milieu d'EX (le chrono pur le faisait).
 */
export function listTcgdexLocalSets(
  language = "fr",
): { id: string; label: string; sortKey?: number }[] {
  const db = ensureTcgdexIndex();
  if (!db) return [];
  const lang = language.trim().toLowerCase();
  const rows = db
    .prepare(
      `SELECT LOWER(set_id) AS setId,
              MIN(NULLIF(TRIM(name), '')) AS name,
              MIN(NULLIF(TRIM(serie_name), '')) AS serieName,
              MIN(released_at) AS releasedAt
         FROM sets
        WHERE lang = ?
        GROUP BY LOWER(set_id)`,
    )
    .all(lang) as {
    setId: string;
    name: string | null;
    serieName: string | null;
    releasedAt: string | null;
  }[];
  const eraSerie = tcgdexEraSerieNames(rows);
  const ids = new Set(rows.map((row) => row.setId));
  const sortKeys = tcgdexBlockAwareSortKeys(rows);
  return finalizeSetOptions(
    rows
      .filter((row) => !isLegacyTcgdexTrainerGalleryId(row.setId, ids))
      .map((row) => {
        const era = tcgdexEraKey(row.setId);
        return {
          id: row.setId,
          label: tcgdexSetDisplayLabel({
            setId: row.setId,
            name: row.name,
            serieName: row.serieName,
            eraSerie: tcgdexEraSerieForKey(era, eraSerie),
          }),
          sortKey: sortKeys.get(row.setId) ?? null,
          prefixCode: false,
        };
      }),
  );
}

/** `YYYY-MM-DD` / ISO → epoch ms for checklist `sortKey`. Invalid → null. */
export function tcgdexReleaseSortKey(
  releasedAt: string | null | undefined,
): number | null {
  const raw = releasedAt?.trim();
  if (!raw) return null;
  const ms = Date.parse(raw);
  return Number.isFinite(ms) ? ms : null;
}

/**
 * Encode « index de bloc × 1e12 + rang dans le bloc » — un seul `sortKey`
 * numérique (bloc d'abord, puis ordre interne).
 */
export function tcgdexBlockSetSortKey(
  blockIndex: number,
  indexInBlock: number,
): number {
  return blockIndex * 1_000_000_000_000 + indexInBlock;
}

/**
 * Rang dans le bloc : extensions (chrono) → promos → énergies.
 * Observé sur les ids TCGdex (`bwp`, `sve`) et les libellés Promo / Énergie.
 */
export function tcgdexWithinBlockKind(
  setId: string,
  name?: string | null,
): "main" | "promo" | "energy" {
  const id = setId.trim().toLowerCase();
  if (!id) return "main";
  // `sve` / `mee` — ère + « e », sans chiffre.
  if (/^[a-z]{2,}e$/.test(id) && !/\d/.test(id)) return "energy";
  // Black Star / promo d'ère : `bwp`, `swshp`, `basep`, `svp`… (pas `pop1`).
  if (/^[a-z]{2,}p$/.test(id) && !id.startsWith("pop")) return "promo";
  if (id === "np") return "promo";

  const label = name?.trim() ?? "";
  if (label && !id.startsWith("tk-")) {
    if (/\bénergies?\b|\benergies?\b/i.test(label)) return "energy";
    if (/\bpromo\b|black\s*star\s*promos?/i.test(label)) return "promo";
  }
  return "main";
}

const WITHIN_BLOCK_RANK: Record<
  ReturnType<typeof tcgdexWithinBlockKind>,
  number
> = {
  main: 0,
  promo: 1,
  energy: 2,
};

/**
 * Clé de tri par set : blocs ordonnés par leur 1ʳᵉ sortie, sets ordonnés
 * main → promo → énergie (chrono dans chaque tranche). Clé de bloc =
 * `tcgdexEraKey` (McDo/kits/promos/énergies → même ère).
 */
export function tcgdexBlockAwareSortKeys(
  rows: readonly {
    setId: string;
    releasedAt: string | null;
    name?: string | null;
  }[],
): Map<string, number> {
  type BlockAcc = { firstMs: number; members: string[] };
  const blocks = new Map<string, BlockAcc>();
  const byId = new Map(rows.map((row) => [row.setId, row]));

  for (const row of rows) {
    const block = tcgdexEraKey(row.setId) ?? `_${row.setId}`;
    const ms = tcgdexReleaseSortKey(row.releasedAt);
    const acc = blocks.get(block);
    if (!acc) {
      blocks.set(block, {
        firstMs: ms ?? Number.MAX_SAFE_INTEGER,
        members: [row.setId],
      });
      continue;
    }
    acc.members.push(row.setId);
    if (ms != null && ms < acc.firstMs) acc.firstMs = ms;
  }

  const orderedBlocks = [...blocks.entries()].sort((a, b) => {
    if (a[1].firstMs !== b[1].firstMs) return a[1].firstMs - b[1].firstMs;
    return a[0].localeCompare(b[0]);
  });

  const out = new Map<string, number>();
  orderedBlocks.forEach(([, acc], blockIndex) => {
    const ordered = [...acc.members].sort((a, b) => {
      const rowA = byId.get(a);
      const rowB = byId.get(b);
      const rankA = WITHIN_BLOCK_RANK[tcgdexWithinBlockKind(a, rowA?.name)];
      const rankB = WITHIN_BLOCK_RANK[tcgdexWithinBlockKind(b, rowB?.name)];
      if (rankA !== rankB) return rankA - rankB;
      const msA = tcgdexReleaseSortKey(rowA?.releasedAt) ?? Number.MAX_SAFE_INTEGER;
      const msB = tcgdexReleaseSortKey(rowB?.releasedAt) ?? Number.MAX_SAFE_INTEGER;
      if (msA !== msB) return msA - msB;
      return a.localeCompare(b);
    });
    ordered.forEach((setId, indexInBlock) => {
      out.set(setId, tcgdexBlockSetSortKey(blockIndex, indexInBlock));
    });
  });
  return out;
}

/**
 * Clé d'ère d'un set id TCGdex : `sv08` / `sv08.5` → `sv`, `2024sv` → `sv`,
 * `me05.5` → `me`, `tk-ex-latia` → `ex`, `bwp` / `swshp` → `bw` / `swsh`.
 * Sert à rattacher McDo / kits / promos au même bloc que les extensions
 * principales, sans liste magique de noms.
 */
export function tcgdexEraKey(setId: string): string | null {
  const id = setId.trim().toLowerCase();
  if (!id) return null;
  // Trainer kits: `tk-xy-n` → era of the kit line (`xy`), not `tk`.
  const kit = id.match(/^tk-([a-z]+)/);
  if (kit?.[1]) {
    // TCGdex numérote la ligne HeartGold `tk-hs-*` alors que les sets sont `hgss*`.
    if (kit[1] === "hs") return "hgss";
    return kit[1];
  }
  const mcdonalds = id.match(/^\d{4}([a-z]+)/);
  if (mcdonalds?.[1]) return mcdonalds[1];
  /*
    Promos Black Star / ère : `bwp`→`bw`, `swshp`→`swsh`, `hgssp`→`hgss`.
    Pas `pop*` (ère POP) ni `np` (Promo Nintendo sous POP).
  */
  const promo = id.match(/^([a-z]{2,})p$/);
  if (promo?.[1] && promo[1] !== "po" && id !== "np") {
    return promo[1];
  }
  // Énergies d'ère : `sve`→`sv`, `mee`→`me`.
  const energy = id.match(/^([a-z]{2,})e$/);
  if (energy?.[1] && !/\d/.test(id)) return energy[1];
  /*
    Sous-collections lettre sans chiffre : `exu` (Zarbi) → `ex`.
    On évite les préfixes qui casseraient une ère réelle (`neo`, `pop`).
  */
  const letterSub = id.match(/^([a-z]{2,3})[a-z]$/);
  if (letterSub?.[1] && !/\d/.test(id)) {
    const prefix = letterSub[1];
    if (prefix !== "ne" && prefix !== "po") return prefix;
  }
  const main = id.match(/^([a-z]+)/);
  return main?.[1] ?? null;
}

/**
 * Ancien id Galerie (`swsh9tg`) quand le canon TCGdex `.5tg` (`swsh9.5tg`)
 * est aussi présent — mêmes 30 cartes, double ligne en check-list.
 */
export function isLegacyTcgdexTrainerGalleryId(
  setId: string,
  presentIds: ReadonlySet<string>,
): boolean {
  const id = setId.trim().toLowerCase();
  const m = id.match(/^(swsh\d+)tg$/);
  if (!m?.[1]) return false;
  return presentIds.has(`${m[1]}.5tg`);
}

/** Vote majoritaire `ère → nom de bloc` hors seaux marketing (McDo, kits). */
export function tcgdexEraSerieNames(
  rows: readonly { setId: string; serieName: string | null }[],
): Map<string, string> {
  const votes = new Map<string, Map<string, number>>();
  for (const row of rows) {
    const serie = row.serieName?.trim();
    if (!serie || !isUsableSetLabel(serie)) continue;
    // Seaux transverses : pas un bloc d'ère.
    if (/mcdonald|kits?\s+du\s+dresseur/i.test(serie)) continue;
    const era = tcgdexEraKey(row.setId);
    if (!era) continue;
    // McDo `2024sv` / kits `tk-…` ne votent pas : leur serie TCGdex n'est pas l'ère.
    const id = row.setId.trim().toLowerCase();
    if (/^\d{4}/.test(id) || id.startsWith("tk-")) continue;
    const bySerie = votes.get(era) ?? new Map<string, number>();
    bySerie.set(serie, (bySerie.get(serie) ?? 0) + 1);
    votes.set(era, bySerie);
  }
  const out = new Map<string, string>();
  for (const [era, bySerie] of votes) {
    let best: string | null = null;
    let bestN = 0;
    for (const [serie, n] of bySerie) {
      if (n > bestN) {
        best = serie;
        bestN = n;
      }
    }
    if (best) out.set(era, best);
  }
  return out;
}

/**
 * `Écarlate et Violet — Évolutions Prismatiques`.
 *
 * Règles d'affichage (observations TCGdex, pas de listes magiques de sets) :
 * - set nommé comme son bloc → bloc seul (`sv01`) ;
 * - « Set de Base » / « Base Set » sous le bloc Base → `Base` ;
 * - nom déjà préfixé du bloc → `Bloc — reste` (`Neo — Genesis`, `POP — Série 1`)
 *   plutôt que la phrase collée TCGdex ;
 * - codes d'ère redondants retirés du nom (`Promo BW` → `Promo`,
 *   `BW Kit…` → `Kit…`) via `tcgdexEraKey` ;
 * - libellés kit normalisés (`Kit du Dresseur`).
 */
export function tcgdexSetDisplayLabel(opts: {
  setId: string;
  name: string | null | undefined;
  serieName: string | null | undefined;
  eraSerie?: string | null;
}): string {
  const era = tcgdexEraKey(opts.setId);
  const rawName = polishTcgdexSetName((opts.name ?? "").trim(), {
    eraKey: era,
    setId: opts.setId,
  });
  const setName = isUsableSetLabel(rawName)
    ? rawName
    : opts.setId.trim().toUpperCase();
  const serie = (opts.eraSerie?.trim() || opts.serieName?.trim() || "").trim();
  if (!serie || !isUsableSetLabel(serie)) return setName;

  const foldedSerie = foldLabel(serie);
  const foldedName = foldLabel(setName);
  if (foldedName === foldedSerie) return serie;
  // « Set de Base » sous Base, « Base Set » EN, etc.
  if (isBlockEponymousSet(foldedName, foldedSerie)) return serie;

  if (
    foldedName.startsWith(foldedSerie) &&
    (foldedName.length === foldedSerie.length ||
      /[\s—–-]/.test(foldedName.charAt(foldedSerie.length)))
  ) {
    const rest = setName
      .slice(leadingPrefixLength(setName, serie))
      .replace(/^[\s—–-]+/, "")
      .trim();
    if (!rest) return serie;
    return `${serie} — ${rest}`;
  }
  return `${serie} — ${setName}`;
}

/** Longueur du préfixe `serie` dans `name` (casse / accents ignorés). */
function leadingPrefixLength(name: string, serie: string): number {
  const foldedSerie = foldLabel(serie);
  let i = 0;
  let j = 0;
  while (i < name.length && j < foldedSerie.length) {
    const foldedChar = foldLabel(name.charAt(i));
    if (!foldedChar) {
      i += 1;
      continue;
    }
    if (foldedChar !== foldedSerie.charAt(j)) break;
    i += 1;
    j += 1;
  }
  return j === foldedSerie.length ? i : 0;
}

/** Nom qui ne fait que redire le bloc (« Set de Base », « Base Set »). */
function isBlockEponymousSet(foldedName: string, foldedSerie: string): boolean {
  if (!foldedSerie) return false;
  return (
    foldedName === `set de ${foldedSerie}` ||
    foldedName === `${foldedSerie} set` ||
    foldedName === `set ${foldedSerie}`
  );
}

/**
 * Répare les collages TCGdex et retire les échos d'ère déjà portés par le bloc.
 */
export function polishTcgdexSetName(
  name: string,
  opts: { eraKey?: string | null; setId?: string | null } | string | null = null,
): string {
  const eraKey =
    typeof opts === "string" || opts == null
      ? opts
      : (opts.eraKey ?? null);
  const setId =
    typeof opts === "string" || opts == null ? null : (opts.setId ?? null);

  let out = name
    .replace(/Classique(?=\d|30)/gi, "Classique ")
    .replace(/\s+/g, " ")
    .trim();

  const tokens = new Set<string>();
  for (const raw of [eraKey, setId?.match(/^tk-([a-z]+)/i)?.[1] ?? null]) {
    const token = raw?.replace(/[^a-z0-9]/gi, "").toLowerCase();
    if (token && token.length >= 2) tokens.add(token);
  }

  for (const token of tokens) {
    const promo = out.match(new RegExp(`^(Promo)\\s+${token}$`, "i"));
    if (promo?.[1]) {
      out = promo[1];
      break;
    }
    const kit = out.match(new RegExp(`^${token}\\s+(.+)$`, "i"));
    if (kit?.[1]) {
      out = kit[1].trim();
      break;
    }
  }

  // Promo + code d'ère (`Promo BW`, `Promo SWSH`) même si la clé id diverge.
  if (/^Promo\s+[A-Za-z0-9]{1,6}$/i.test(out)) {
    out = "Promo";
  }

  // `MEP Black Star Promos` / `SVP Black Star Promos` → le code est déjà le bloc.
  out = out.replace(
    /^[A-Za-z0-9]{2,6}\s+(Black Star Promos)$/i,
    "$1",
  );

  out = out
    .replace(/\bKit\s+dresseur\b/gi, "Kit du Dresseur")
    .replace(/\bKit\s+du\s+dresseur\b/gi, "Kit du Dresseur");

  return out.replace(/\s+/g, " ").trim();
}

/**
 * Serie de bloc pour une ère — si la clé kit est courte (`hs`) et que le
 * catalogue vote sous une clé plus longue unique (`hgss`), on suit ce vote.
 */
export function tcgdexEraSerieForKey(
  eraKey: string | null | undefined,
  eraSerie: ReadonlyMap<string, string>,
): string | null {
  const era = eraKey?.trim().toLowerCase();
  if (!era) return null;
  const direct = eraSerie.get(era);
  if (direct) return direct;
  const longer = [...eraSerie.keys()].filter(
    (key) => key.startsWith(era) && key.length > era.length,
  );
  if (longer.length === 1) return eraSerie.get(longer[0]!) ?? null;
  return null;
}

function foldLabel(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase();
}

/**
 * Retire du catalogue les sets qu'on ne sert pas.
 *
 * Une étagère tient du carton : les sets 100 % numériques n'y entrent pas. Le
 * filtre vit désormais à la moisson, mais une base déjà écrite les contient —
 * et un catalogue qui garde ce qu'il refuse de servir finit toujours par le
 * servir quand même, au premier chemin de lecture qui oublie le filtre.
 */
export function pruneTcgdexSets(
  setIds: readonly string[],
  dbPath = tcgdexDbPath(),
): number {
  if (setIds.length === 0 || !existsSync(dbPath)) return 0;
  const db = new DatabaseSync(dbPath);
  try {
    db.exec("PRAGMA busy_timeout = 30000");
    const dropTitles = db.prepare(
      `DELETE FROM print_titles
        WHERE print_key IN (SELECT print_key FROM prints WHERE LOWER(set_id) = ?)`,
    );
    const dropPrints = db.prepare(`DELETE FROM prints WHERE LOWER(set_id) = ?`);
    const dropSet = db.prepare(`DELETE FROM sets WHERE LOWER(set_id) = ?`);
    let removed = 0;
    db.exec("BEGIN IMMEDIATE");
    try {
      for (const raw of setIds) {
        const setId = raw.trim().toLowerCase();
        if (!setId) continue;
        dropTitles.run(setId);
        const result = dropPrints.run(setId);
        dropSet.run(setId);
        removed += Number(result.changes ?? 0);
      }
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
    return removed;
  } finally {
    db.close();
    resetTcgdexIndexCache();
  }
}
