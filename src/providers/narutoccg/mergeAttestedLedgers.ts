/**
 * Catalogue titles / stubs from ledgers we already hold.
 * Names stay as the source wrote them. No faces, no NI=N merge.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import {
  canonicalizeNarutoPrintKey,
  mintNarutoPrintKey,
  narutoDiskCardId,
  narutoNumbersEqual,
  parseNarutoCollector,
} from "./collectorIdentity";
import { narutoCuratedSourcesDir } from "./curatedPaths";
import { isColekaPlaceholderName } from "./foldNarutoIndex";
import enCcgSeries from "./curated/sources/en-ccg-series.json";
import itArchiveRarities from "./curated/sources/cardgameclub-it-archive-rarities.json";
import titleCorrections from "./curated/sources/title-corrections.json";
import coleka from "./curated/sources/coleka.json";
import slabZ from "./curated/sources/slab-z-2002-carddass.json";
import physical from "./curated/sources/user-physical-ccg.json";
import type { NarutoPrintRow, NarutoTitleRow } from "./indexStore";
import { mergeBandaicgEnNamesIntoIndex } from "./parse/parseBandaicgCardlist";
import { mergeBggEnCcgS1IntoIndex } from "./parse/parseBggNarutoList";
import { mergeCarddasJpNamesIntoIndex } from "./parse/parseCarddasJpCardlist";
import { mergeCarddasJpPromoIntoIndex } from "./parse/parseCarddasJpExtras";
import { cardTypeFromCollectorNumber } from "./parse/parseBandaicgAsset";
import { parseEnCcgPrintedRef } from "./parse/parseEnCcgPrinted";
import { mergeCardgameclubItIntoIndex } from "./scrape/scrapeCardgameclubIt";
import { mergeGoatEnCcgIntoIndex } from "./scrape/scrapeGoatEnCcg";
import {
  mergeNarutoCardsCaIntoIndex,
  type NarutoCardsCaCard,
} from "./parse/parseNarutoCardsCa";
import { mergeNarutoCardsCaLedgerIntoIndex } from "./scrape/scrapeNarutoCardsCa";
import { loadColekaCarddassFrLedger } from "./scrape/scrapeColekaCarddassFr";

export type FoundCatalogueMerge = {
  prints: NarutoPrintRow[];
  titles: NarutoTitleRow[];
  /** Fiches qui reçoivent un nom japonais du relevé 火の国庵. */
  hinokunianTitled: string[];
  /** Titres réécrits par une correction vérifiée à l'image. */
  titlesCorrected: string[];
  /** Fiches italiennes qui reçoivent leur rareté depuis l'archive. */
  itRarities: string[];
  bggAdded: string[];
  bggTitled: string[];
  bandaiAdded: string[];
  bandaiTitled: string[];
  colekaTitled: string[];
  checklistTitled: string[];
  slabZTitled: string[];
  physicalAdded: string[];
  physicalTitled: string[];
  jpAdded: string[];
  jpTitled: string[];
  jpPromoAdded: string[];
  jpPromoTitled: string[];
  goatAdded: string[];
  goatTitled: string[];
  narutocardsAdded: string[];
  narutocardsTitled: string[];
  itAdded: string[];
  itTitled: string[];
};

export { isColekaPlaceholderName } from "./foldNarutoIndex";

function titleKey(printKey: string, lang: string): string {
  return `${canonicalizeNarutoPrintKey(printKey)}\0${lang.toLowerCase()}`;
}

function findPrint(
  prints: readonly NarutoPrintRow[],
  printKey: string,
): NarutoPrintRow | undefined {
  const canon = canonicalizeNarutoPrintKey(printKey);
  return prints.find(
    (p) =>
      p.printKey === printKey ||
      canonicalizeNarutoPrintKey(p.printKey) === canon,
  );
}

function findPrintsByNumber(
  prints: readonly NarutoPrintRow[],
  raw: string,
): NarutoPrintRow[] {
  return prints.filter((p) => narutoNumbersEqual(p.number, raw));
}

function makePrint(
  printKey: string,
  raw: string,
  setCode: string,
): NarutoPrintRow {
  const diskId = narutoDiskCardId(raw, setCode) ?? raw;
  const parsed = parseNarutoCollector(raw);
  return {
    printKey,
    setCode,
    number: diskId,
    cardType: cardTypeFromCollectorNumber(diskId),
    family: parsed?.family ?? null,
    grouping: parsed?.grouping ?? null,
  };
}

function fillTitle(
  titles: NarutoTitleRow[],
  seen: Set<string>,
  printKey: string,
  lang: string,
  fullName: string,
  rarity?: string | null,
): boolean {
  const name = fullName.trim();
  if (!name) return false;
  const key = titleKey(printKey, lang);
  if (seen.has(key)) return false;
  titles.push({
    printKey,
    lang,
    fullName: name,
    rarity: rarity ?? null,
  });
  seen.add(key);
  return true;
}

export function colekaFrNamedCards(): Array<{
  number: string;
  name: string;
}> {
  const fromJson = Object.entries(coleka.cards)
    .map(([number, row]) => ({
      number,
      name: typeof row?.name === "string" ? row.name.trim() : "",
    }))
    .filter((row) => row.name && !isColekaPlaceholderName(row.name));
  const seen = new Set(fromJson.map((row) => row.number));
  const fromListing = loadColekaCarddassFrLedger()
    .map((row) => ({
      number: row.number,
      name: row.name?.trim() ?? "",
    }))
    .filter(
      (row) =>
        row.name && !isColekaPlaceholderName(row.name) && !seen.has(row.number),
    );
  return [...fromJson, ...fromListing];
}

/**
 * FR names from the Coleka S6 / tin fiches we already copied.
 * Fill-only — official / Manga-News names win. No new prints (Coleka
 * files some S1 numbers under the S6 branch).
 */
export function mergeColekaFrNamesIntoIndex(input: {
  prints: NarutoPrintRow[];
  titles: NarutoTitleRow[];
}): {
  prints: NarutoPrintRow[];
  titles: NarutoTitleRow[];
  titled: string[];
} {
  const prints = [...input.prints];
  const titles = [...input.titles];
  const seen = new Set(titles.map((t) => titleKey(t.printKey, t.lang)));
  const titled: string[] = [];

  for (const card of colekaFrNamedCards()) {
    for (const print of findPrintsByNumber(prints, card.number)) {
      if (fillTitle(titles, seen, print.printKey, "fr", card.name)) {
        titled.push(print.printKey);
      }
    }
  }

  titled.sort((a, b) => a.localeCompare(b));
  return { prints, titles, titled };
}

type ChecklistFile = {
  sets?: Record<string, { names?: Record<string, string> }>;
};

export function loadChecklistFrNames(
  filePath = path.join(narutoCuratedSourcesDir(), "carddass-fr-checklist.json"),
): Map<string, string> {
  const out = new Map<string, string>();
  if (!existsSync(filePath)) return out;
  try {
    const raw = JSON.parse(readFileSync(filePath, "utf8")) as ChecklistFile;
    for (const body of Object.values(raw.sets ?? {})) {
      for (const [id, name] of Object.entries(body.names ?? {})) {
        const trimmed = name.trim();
        if (!trimmed || out.has(id)) continue;
        out.set(id, trimmed);
      }
    }
  } catch {
    return out;
  }
  return out;
}

/** Printed-checklist FR names, fill-only (official overlay already ran). */
export function mergeChecklistFrNamesIntoIndex(input: {
  prints: NarutoPrintRow[];
  titles: NarutoTitleRow[];
}): {
  prints: NarutoPrintRow[];
  titles: NarutoTitleRow[];
  titled: string[];
} {
  const prints = [...input.prints];
  const titles = [...input.titles];
  const seen = new Set(titles.map((t) => titleKey(t.printKey, t.lang)));
  const titled: string[] = [];

  for (const [number, name] of loadChecklistFrNames()) {
    for (const print of findPrintsByNumber(prints, number)) {
      if (fillTitle(titles, seen, print.printKey, "fr", name)) {
        titled.push(print.printKey);
      }
    }
  }

  titled.sort((a, b) => a.localeCompare(b));
  return { prints, titles, titled };
}

export function slabZJaRookieNames(): Array<{
  diskHint: string;
  name: string;
}> {
  return slabZ.rookiesClaimed
    .map((row) => ({
      diskHint: row.diskHint,
      name: row.name.trim(),
    }))
    .filter((row) => row.diskHint && row.name);
}

/** Four attested 巻ノ壱 names. Fill-only; no invented JP list. */
export function mergeSlabZJaNamesIntoIndex(input: {
  prints: NarutoPrintRow[];
  titles: NarutoTitleRow[];
}): {
  prints: NarutoPrintRow[];
  titles: NarutoTitleRow[];
  titled: string[];
} {
  const prints = [...input.prints];
  const titles = [...input.titles];
  const seen = new Set(titles.map((t) => titleKey(t.printKey, t.lang)));
  const titled: string[] = [];

  for (const row of slabZJaRookieNames()) {
    for (const print of findPrintsByNumber(prints, row.diskHint)) {
      if (fillTitle(titles, seen, print.printKey, "ja", row.name)) {
        titled.push(print.printKey);
      }
    }
  }

  titled.sort((a, b) => a.localeCompare(b));
  return { prints, titles, titled };
}

/**
 * Les noms japonais relevés chez 火の国庵, versés dans les fiches qui n'en ont
 * pas.
 *
 * Remplissage seul : un titre déjà présent n'est jamais écrasé. Le relevé est
 * riche mais c'est un site de fan, et le catalogue tient déjà des noms venus de
 * sources officielles — `carddas-jp`, les promos attestées. Ceux-là gardent la
 * main.
 *
 * La rareté du relevé n'est pas versée : elle s'y écrit en japonais
 * (`ノーマル`, `激レア`) là où le catalogue mêle déjà trois vocabulaires. Une
 * quatrième écriture n'aiderait personne tant que le vocabulaire n'est pas
 * unifié.
 */
/**
 * Corrections de titre vérifiées à l'image.
 *
 * Seule étape qui **écrase** un titre : toutes les autres remplissent. D'où le
 * garde — la correction ne s'applique que si le titre en place est exactement
 * celui déclaré faux. Si la source se corrige d'elle-même, ou si un autre nom
 * arrive entre-temps, la ligne devient inerte au lieu de réécrire à l'aveugle.
 *
 * Premier cas : `n0849`. La boutique Goat l'a nommé « Ghost Samurai » en lisant
 * le **texte d'effet** (« search your Deck for 1 "Ghost Samurai" Ninja card »)
 * au lieu du nom imprimé, qui est « Cursed Warrior ».
 */
/**
 * Raretés italiennes tirées des captures Wayback de la boutique morte.
 *
 * Remplissage seul, et **rareté seule** : les 117 cartes ont déjà leur nom au
 * catalogue, l'archive n'apporte que la rareté — dont la colonne italienne
 * était vide sur les 410 titres.
 *
 * Le vocabulaire est celui de la boutique, foil compris (`rara foil`,
 * `ultra rara foil`, `epica foil`). Il n'est pas traduit vers celui du français
 * ou de l'anglais : chaque langue garde ses mots, c'est le mélange **entre**
 * langues qui poserait problème, pas la fidélité à l'intérieur d'une langue.
 */
export function mergeCardgameclubItRarities(input: {
  prints: NarutoPrintRow[];
  titles: NarutoTitleRow[];
}): {
  prints: NarutoPrintRow[];
  titles: NarutoTitleRow[];
  rarities: string[];
} {
  const prints = [...input.prints];
  const titles = [...input.titles];
  const rarities: string[] = [];

  for (const row of itArchiveRarities.cards) {
    const keys = new Set(
      findPrintsByNumber(prints, row.disk).map((p) => p.printKey),
    );
    if (!keys.size) continue;
    for (const title of titles) {
      if (!keys.has(title.printKey) || title.lang !== "it") continue;
      if (title.rarity) continue;
      title.rarity = row.rarity;
      rarities.push(title.printKey);
    }
  }

  rarities.sort((a, b) => a.localeCompare(b));
  return { prints, titles, rarities };
}

export function mergeTitleCorrections(input: {
  prints: NarutoPrintRow[];
  titles: NarutoTitleRow[];
}): {
  prints: NarutoPrintRow[];
  titles: NarutoTitleRow[];
  corrected: string[];
  skipped: string[];
} {
  const prints = [...input.prints];
  const titles = [...input.titles];
  const corrected: string[] = [];
  const skipped: string[] = [];

  for (const row of titleCorrections.corrections) {
    const keys = new Set(
      findPrintsByNumber(prints, row.number).map((p) => p.printKey),
    );
    if (!keys.size) {
      skipped.push(`${row.number}: aucun tirage`);
      continue;
    }
    let hit = false;
    for (const title of titles) {
      if (!keys.has(title.printKey) || title.lang !== row.lang) continue;
      if (title.fullName.trim() !== row.wrong) {
        skipped.push(`${row.number}: porte « ${title.fullName} »`);
        continue;
      }
      title.fullName = row.right;
      corrected.push(title.printKey);
      hit = true;
    }
    if (!hit && !skipped.length) skipped.push(`${row.number}: titre absent`);
  }

  return { prints, titles, corrected, skipped };
}

export function mergeHinokunianJaNamesIntoIndex(input: {
  prints: NarutoPrintRow[];
  titles: NarutoTitleRow[];
  names: ReadonlyArray<{ diskHint: string; name: string }>;
}): {
  prints: NarutoPrintRow[];
  titles: NarutoTitleRow[];
  titled: string[];
} {
  const prints = [...input.prints];
  const titles = [...input.titles];
  const seen = new Set(titles.map((t) => titleKey(t.printKey, t.lang)));
  const titled: string[] = [];

  for (const row of input.names) {
    if (!row.diskHint || !row.name) continue;
    for (const print of findPrintsByNumber(prints, row.diskHint)) {
      if (fillTitle(titles, seen, print.printKey, "ja", row.name)) {
        titled.push(print.printKey);
      }
    }
  }

  titled.sort((a, b) => a.localeCompare(b));
  return { prints, titles, titled };
}

function physicalPrintKey(
  row: (typeof physical.prints)[number],
): string | null {
  if (row.printKeyHint?.trim())
    return canonicalizeNarutoPrintKey(row.printKeyHint);
  const parsed = parseEnCcgPrintedRef(row.ref);
  if (parsed?.number) return mintNarutoPrintKey(parsed.number, row.setCode);
  return mintNarutoPrintKey(row.ref, row.setCode);
}

function physicalRawNumber(row: (typeof physical.prints)[number]): string {
  const parsed = parseEnCcgPrintedRef(row.ref);
  if (parsed?.number) return parsed.number;
  const hint = row.printKeyHint?.trim();
  if (hint) {
    const minted = canonicalizeNarutoPrintKey(hint);
    const disk = minted.split(":").slice(1).join("-").replace(/-/g, "");
    return narutoDiskCardId(disk, row.setCode) ?? disk;
  }
  return row.ref;
}

/**
 * In-hand CCG copies. Today: PR-096 (4e Hokage) as a promo stub.
 * Kisame n1650 is already on disk — title fill-only.
 */
export function mergeUserPhysicalCcgIntoIndex(input: {
  prints: NarutoPrintRow[];
  titles: NarutoTitleRow[];
}): {
  prints: NarutoPrintRow[];
  titles: NarutoTitleRow[];
  addedPrints: string[];
  titled: string[];
} {
  const prints = [...input.prints];
  const titles = [...input.titles];
  const seen = new Set(titles.map((t) => titleKey(t.printKey, t.lang)));
  const addedPrints: string[] = [];
  const titled: string[] = [];

  for (const row of physical.prints) {
    const printKey = physicalPrintKey(row);
    if (!printKey) continue;
    const lang = (row.lang ?? "fr").toLowerCase();
    let print = findPrint(prints, printKey);
    if (!print) {
      print = makePrint(printKey, physicalRawNumber(row), row.setCode);
      prints.push(print);
      addedPrints.push(printKey);
    }
    if (fillTitle(titles, seen, print.printKey, lang, row.namePrinted)) {
      titled.push(print.printKey);
    }
  }

  prints.sort((a, b) => a.printKey.localeCompare(b.printKey));
  addedPrints.sort((a, b) => a.localeCompare(b));
  titled.sort((a, b) => a.localeCompare(b));
  return { prints, titles, addedPrints, titled };
}

function brasilUsExclusiveCards(): NarutoCardsCaCard[] {
  const rows = (
    enCcgSeries as {
      usExclusiveNamed?: Array<{
        printed: string;
        name: string;
        setCode: string;
      }>;
    }
  ).usExclusiveNamed;
  if (!rows) return [];
  const out: NarutoCardsCaCard[] = [];
  for (const row of rows) {
    const parsed = parseEnCcgPrintedRef(row.printed);
    if (!parsed?.number || !parsed.usExclusive) continue;
    out.push({
      number: parsed.number,
      name: row.name,
      setCode: row.setCode,
      printedRef: row.printed,
      usExclusive: true,
    });
  }
  return out;
}

export function mergeBrasilUsExclusivesIntoIndex(input: {
  prints: NarutoPrintRow[];
  titles: NarutoTitleRow[];
}) {
  return mergeNarutoCardsCaIntoIndex({
    prints: input.prints,
    titles: input.titles,
    cards: brasilUsExclusiveCards(),
  });
}

/** Ledgers already on disk — titles / stubs, never faces. */
export function mergeFoundCatalogueLedgers(input: {
  prints: NarutoPrintRow[];
  titles: NarutoTitleRow[];
  /** Noms japonais du relevé 火の国庵, quand la moisson est sur le disque. */
  hinokunianNames?: ReadonlyArray<{ diskHint: string; name: string }>;
}): FoundCatalogueMerge {
  const bandai = mergeBandaicgEnNamesIntoIndex(input);
  const bgg = mergeBggEnCcgS1IntoIndex(bandai);
  const checklist = mergeChecklistFrNamesIntoIndex(bgg);
  const colekaFr = mergeColekaFrNamesIntoIndex(checklist);
  const slab = mergeSlabZJaNamesIntoIndex(colekaFr);
  const jp = mergeCarddasJpNamesIntoIndex(slab);
  const jpPromo = mergeCarddasJpPromoIntoIndex(jp);
  const goat = mergeGoatEnCcgIntoIndex(jpPromo);
  const narutocards = mergeNarutoCardsCaLedgerIntoIndex(goat);
  const brasilUs = mergeBrasilUsExclusivesIntoIndex(narutocards);
  const it = mergeCardgameclubItIntoIndex(brasilUs);
  const physicalCcg = mergeUserPhysicalCcgIntoIndex(it);
  // En dernier : tout ce qui précède est attesté par une source officielle ou
  // une pièce en main, et garde donc la priorité sur un relevé de fan.
  const hinokunian = mergeHinokunianJaNamesIntoIndex({
    prints: physicalCcg.prints,
    titles: physicalCcg.titles,
    names: input.hinokunianNames ?? [],
  });
  const itRarities = mergeCardgameclubItRarities(hinokunian);
  // Tout à la fin : une correction vérifiée passe après chaque relevé.
  const fixed = mergeTitleCorrections(itRarities);
  return {
    prints: fixed.prints,
    titles: fixed.titles,
    hinokunianTitled: hinokunian.titled,
    titlesCorrected: fixed.corrected,
    itRarities: itRarities.rarities,
    bggAdded: bgg.addedPrints,
    bggTitled: bgg.titled,
    bandaiAdded: bandai.addedPrints,
    bandaiTitled: bandai.titled,
    colekaTitled: colekaFr.titled,
    checklistTitled: checklist.titled,
    slabZTitled: slab.titled,
    physicalAdded: physicalCcg.addedPrints,
    physicalTitled: physicalCcg.titled,
    jpAdded: jp.addedPrints,
    jpTitled: jp.titled,
    jpPromoAdded: jpPromo.addedPrints,
    jpPromoTitled: jpPromo.titled,
    goatAdded: goat.addedPrints,
    goatTitled: goat.titled,
    narutocardsAdded: narutocards.addedPrints,
    narutocardsTitled: narutocards.titled,
    itAdded: it.addedPrints,
    itTitled: it.titled,
  };
}
