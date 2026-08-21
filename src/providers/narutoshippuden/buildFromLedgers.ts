/**
 * Le catalogue du 疾風伝, monté depuis ses propres registres.
 *
 * Les deux listes officielles — 第一幕…第四幕 et 忍伝-学 — vivaient dans le pack
 * Carddass, qui les fusionnait dans son index pour les refiltrer à la sortie :
 * du travail fait pour être jeté, et un pack incapable de se reconstruire seul.
 * Elles sont ici depuis le 2026-08-21, avec le jeu qu'elles décrivent.
 *
 * Ce module ne pose que ce que les registres attestent — référence, numéro,
 * titre japonais, acte. Les faces ne passent pas par lui : elles arrivent du
 * staging, et un tirage qu'aucun registre ne nomme garde donc sa face sans
 * recevoir de titre inventé.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import {
  openNarutoShippudenDbForWrite,
  resetNarutoShippudenIndexCache,
  SHIPPUDEN_FAMILIES,
} from "./indexStore";

export type ShippudenLedgerRow = {
  /** La référence telle qu'imprimée : `SHI-001`, `学-001`. */
  printed: string;
  /** L'identifiant disque : `shi0001`. */
  number: string;
  name: string;
  /** `maku1`…`maku4`, ou `gaku`. */
  setCode: string;
};

type Ledger = {
  source: string;
  observed: string;
  line: string;
  cards: ShippudenLedgerRow[];
};

const LEDGER_FILES = ["carddas-jp-maku.json", "carddas-jp-gaku.json"] as const;

/** La liste officielle des sorties, avec les plages de numéros de chacune. */
const CHECKLIST_FILE = "cardcheckbox-shippuden.json";

export function narutoShippudenSourcesDir(): string {
  return path.join(
    process.cwd(),
    "src",
    "providers",
    "narutoshippuden",
    "curated",
    "sources",
  );
}

export function readShippudenLedgers(): Ledger[] {
  return LEDGER_FILES.map(
    (file) =>
      JSON.parse(
        readFileSync(path.join(narutoShippudenSourcesDir(), file), "utf8"),
      ) as Ledger,
  );
}

/** `shi0001` → `naruto:shi-0001`. Rend `null` hors des familles du jeu. */
export function shippudenPrintKey(number: string): string | null {
  const m = /^([a-z]+)(\d+)$/i.exec(number.trim().toLowerCase());
  if (!m) return null;
  const family = m[1];
  if (!(SHIPPUDEN_FAMILIES as readonly string[]).includes(family)) return null;
  return `naruto:${family}-${m[2].padStart(4, "0")}`;
}

export type ChecklistRelease = {
  setCode: string;
  name: string;
  released?: string;
  kinds?: string;
  numberingUnknown?: boolean;
  shi?: [number, number];
  mju?: [number, number];
  msa?: [number, number];
  gaku?: [number, number];
};

export function readShippudenChecklist(): {
  url: string;
  observed: string;
  releases: ChecklistRelease[];
} {
  return JSON.parse(
    readFileSync(
      path.join(narutoShippudenSourcesDir(), CHECKLIST_FILE),
      "utf8",
    ),
  ) as { url: string; observed: string; releases: ChecklistRelease[] };
}

/** `shi` + 152 → `maku5`. `null` hors de toute plage attestée. */
export function releaseForNumber(
  family: string,
  number: number,
): ChecklistRelease | null {
  for (const release of readShippudenChecklist().releases) {
    const band = release[family as "shi" | "mju" | "msa" | "gaku"];
    if (band && number >= band[0] && number <= band[1]) return release;
  }
  return null;
}

export type LedgerBuildReport = {
  rows: number;
  prints: number;
  titles: number;
  skipped: string[];
  /** Tirages dont la liste officielle a corrigé le set. */
  filed: number;
  /** Numéros attestés par la liste que nul registre ne nomme encore. */
  attested: number;
};

/**
 * Écrit prints + titres depuis les registres.
 *
 * Les tirages déjà en base sont **mis à jour**, pas remplacés : un tirage connu
 * par sa seule face garde sa ligne, et reçoit son acte le jour où un registre
 * le nomme. Rien n'est supprimé ici — retirer se décide en le voyant.
 */
export function buildShippudenFromLedgers(
  opts: { dryRun?: boolean } = {},
): LedgerBuildReport {
  const rows = readShippudenLedgers().flatMap((ledger) => ledger.cards);
  const skipped: string[] = [];
  const prints = new Map<
    string,
    { setCode: string; number: string; family: string }
  >();
  const titles = new Map<string, string>();

  for (const row of rows) {
    const printKey = shippudenPrintKey(row.number);
    if (!printKey) {
      skipped.push(row.number);
      continue;
    }
    const family = printKey.slice("naruto:".length).split("-")[0];
    prints.set(printKey, {
      setCode: row.setCode.trim() || "unknown",
      number: row.number.trim().toLowerCase(),
      family,
    });
    const name = row.name.trim();
    if (name) titles.set(printKey, name);
  }

  /*
    La liste officielle passe **après** les registres de titres, et elle tranche
    sur deux points qu'eux ne savent pas dire.

    1. **Le set.** Les registres nomment les cartes des quatre premiers actes ;
       la liste, elle, donne les plages de numéros de chaque sortie. Un tirage
       connu par sa seule face — il y en avait quatre, `shi-0152` à `shi-0156` —
       trouve ainsi son acte au lieu de rester en `unknown`.

    2. **L'existence.** La liste atteste des numéros dont personne n'a encore
       relevé le nom : tout le cinquième et le sixième acte, et le Coin+. On les
       pose sans titre plutôt que de les taire — la référence identifie la
       carte, et un tirage caché est un tirage inajoutable.

    Les actes 7 et 8 n'y sont pas : la source note leurs plages 未確認. Une
    centaine de cartes existent donc sans numéro connu, et rien ici ne les
    invente.
  */
  let filed = 0;
  let attested = 0;
  for (const release of readShippudenChecklist().releases) {
    for (const family of SHIPPUDEN_FAMILIES) {
      const band = release[family];
      if (!band) continue;
      for (let number = band[0]; number <= band[1]; number += 1) {
        const printKey = `naruto:${family}-${String(number).padStart(4, "0")}`;
        const known = prints.get(printKey);
        if (known) {
          if (known.setCode !== release.setCode) filed += 1;
          known.setCode = release.setCode;
          continue;
        }
        prints.set(printKey, {
          setCode: release.setCode,
          number: `${family}${String(number).padStart(4, "0")}`,
          family,
        });
        attested += 1;
      }
    }
  }

  const report: LedgerBuildReport = {
    rows: rows.length,
    prints: prints.size,
    titles: titles.size,
    skipped,
    filed,
    attested,
  };
  if (opts.dryRun) return report;

  const db = openNarutoShippudenDbForWrite();
  try {
    const insertPrint = db.prepare(
      `INSERT INTO prints (print_key, set_code, number, card_type, source_url)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(print_key) DO UPDATE SET
         set_code = excluded.set_code,
         number = excluded.number,
         card_type = excluded.card_type`,
    );
    const insertTitle = db.prepare(
      `INSERT INTO print_titles (print_key, lang, full_name)
       VALUES (?, 'ja', ?)
       ON CONFLICT(print_key, lang) DO UPDATE SET
         full_name = excluded.full_name`,
    );
    db.exec("BEGIN IMMEDIATE");
    try {
      for (const [printKey, print] of prints) {
        insertPrint.run(
          printKey,
          print.setCode,
          print.number,
          print.family,
          "https://www.carddas.com/naruto/cardgame/product/",
        );
      }
      for (const [printKey, name] of titles) insertTitle.run(printKey, name);
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  } finally {
    db.close();
    resetNarutoShippudenIndexCache();
  }
  return report;
}
