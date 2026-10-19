/**
 * Resolve a Naruto Carddass face for a printKey + lang.
 *
 * Storage stays lang-first on disk (`cards/{lang}/{set}/{id}/`). Public URLs
 * share the shelf stem (`/assets/…/prints/s1-cl0001-fr/face`) — this module
 * maps that identity onto bytes and reports owned vs borrowed.
 */
import { existsSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

import { parsePrintKey } from "@/core/identify/printKey";
import { cataloguePackInfo } from "@/lib/admin/cataloguePacks";
import { packCardsDir } from "@/lib/packPaths";

import { resolveNarutoDiskArtFilename } from "./diskArtAttachments";
import {
  mintNarutoPrintKey,
  NARUTO_PACK_ID,
  narutoDiskCardId,
  narutoRetailDiskNumber,
  parseNarutoCollector,
} from "./identity";
import { narutoCatalogueLineForCard } from "./packs";
import { belongsOnNarutoPromoChecklist } from "./sources/promos";
import ledgerDoubleIllustrations from "./curated/sources/carddas-jp-double-illustrations.json";

const ART_B_BY_DISK = new Map(
  (ledgerDoubleIllustrations.cards as { number: string; artB: string }[]).map(
    (card) => [card.number.trim().toLowerCase(), card.artB],
  ),
);

export type NarutoPrintFaceSource = "owned" | "borrowed";

export type NarutoPrintFaceHit = {
  filePath: string;
  /** Basename under the card folder (`art.carddass.jpg`). */
  artFile: string;
  source: NarutoPrintFaceSource;
  /** Present when {@link source} is `borrowed`. */
  donorPrintKey?: string;
  disk: { lang: string; set: string; card: string };
};

const THUMB_FILE = /^thumb\.(jpe?g|png|webp|gif)$/i;

function homeSetOf(printKey: string, diskCard: string): string {
  const fromKey = parsePrintKey(printKey)?.set?.toLowerCase();
  if (fromKey && fromKey !== "prerelease" && fromKey !== "promo") {
    return fromKey;
  }
  if (
    fromKey === "prerelease" ||
    parseNarutoCollector(diskCard)?.grouping?.toLowerCase() === "prerelease"
  ) {
    return "s1";
  }
  if (fromKey === "promo") return "promo";
  return fromKey || "s1";
}

function diskCardOf(printKey: string): string | null {
  const id = parsePrintKey(printKey);
  if (!id || id.game !== "naruto") return null;
  const raw = id.grouping ? `${id.number}-${id.grouping}` : id.number;
  // Set-scoped promo/prerelease keys drop grouping from the printKey
  // (`naruto:promo-ni0024`) but disk folders keep `ni0024-promo`.
  return narutoDiskCardId(raw, id.set) ?? raw;
}

function channelSetOf(printKey: string, diskCard: string): string {
  const fromKey = parsePrintKey(printKey)?.set?.toLowerCase();
  const grouping = parseNarutoCollector(diskCard)?.grouping?.toLowerCase();
  if (fromKey === "promo" || grouping === "promo" || grouping === "cdf") {
    return "promo";
  }
  if (fromKey === "prerelease" || grouping === "prerelease") {
    return "prerelease";
  }
  return homeSetOf(printKey, diskCard);
}

function tryDir(
  cardsRoot: string,
  lang: string,
  set: string,
  card: string,
): { dir: string; artFile: string } | null {
  const dir = path.join(cardsRoot, lang, set, card);
  const artFile = resolveNarutoDiskArtFilename(dir);
  if (!artFile) return null;
  return { dir, artFile };
}

function resolveThumbFile(cardDir: string, faceFile: string): string {
  try {
    const hit = readdirSync(cardDir).find((name) => THUMB_FILE.test(name));
    if (hit) return hit;
  } catch {
    /* fall through */
  }
  return faceFile;
}

function mintDonorKey(set: string, card: string): string {
  return mintNarutoPrintKey(card, set) ?? `naruto:${set}-${card}`;
}

function borrowChainFor(channelSet: string): readonly string[] {
  const chain =
    cataloguePackInfo("naruto/carddass")?.artBorrowFrom?.[channelSet];
  return chain ?? [];
}

function sameNumberArtFallbackEnabled(): boolean {
  return cataloguePackInfo("naruto/carddass")?.sameNumberArtFallback === true;
}

/** Prefer earlier retail boosters, then TP / tin / promo / other. */
function compareNarutoDonorSets(a: string, b: string): number {
  const rank = (set: string): [number, number, string] => {
    const s = set.toLowerCase();
    const booster = /^s(\d+)$/.exec(s);
    if (booster) return [0, Number(booster[1]), s];
    const tp = /^tp(\d+)$/.exec(s);
    if (tp) return [1, Number(tp[1]), s];
    const tin = /^tin(\d+)$/.exec(s);
    if (tin) return [2, Number(tin[1]), s];
    if (s === "promo") return [3, 0, s];
    if (s === "prerelease") return [4, 0, s];
    const maki = /^maki(\d+)$/.exec(s);
    if (maki) return [5, Number(maki[1]), s];
    return [9, 0, s];
  };
  const ra = rank(a);
  const rb = rank(b);
  return ra[0] - rb[0] || ra[1] - rb[1] || ra[2].localeCompare(rb[2]);
}

/**
 * Observational same-locale donors: every set folder under `lang/` that already
 * holds this collector. Used when {@link sameNumberArtFallback} is on — EN CCG
 * reprints often live only under the first print set (Drive / Goat / Vintage)
 * while later memberships still need a catalogue tile.
 */
function sameNumberDonorSets(
  cardsRoot: string,
  lang: string,
  diskCard: string,
  excludeSets: ReadonlySet<string>,
): string[] {
  const langDir = path.join(cardsRoot, lang);
  if (!existsSync(langDir) || !statSync(langDir).isDirectory()) return [];
  const hits: string[] = [];
  for (const set of readdirSync(langDir)) {
    const low = set.trim().toLowerCase();
    if (!low || low.startsWith(".") || excludeSets.has(low)) continue;
    if (!tryDir(cardsRoot, lang, low, diskCard)) continue;
    hits.push(low);
  }
  return hits.sort(compareNarutoDonorSets);
}

function euPromoBorrowBlocked(channel: string, lang: string, diskCard: string) {
  return (
    channel === "promo" &&
    (lang === "fr" || lang === "it") &&
    !belongsOnNarutoPromoChecklist(diskCard)
  );
}

function resolveFaceBFile(cardDir: string, diskCard: string): string | null {
  const named = ART_B_BY_DISK.get(diskCard.trim().toLowerCase());
  if (named) {
    const filePath = path.join(cardDir, named);
    if (existsSync(filePath) && statSync(filePath).isFile()) return named;
  }
  try {
    const hit = readdirSync(cardDir).find((name) =>
      /^art\.[^/]*-b\.(jpe?g|png|webp|gif)$/i.test(name),
    );
    return hit ?? null;
  } catch {
    return null;
  }
}

function hitFromDir(
  dir: string,
  artFile: string,
  role: "face" | "thumb" | "face-b",
  source: NarutoPrintFaceSource,
  disk: NarutoPrintFaceHit["disk"],
  donorPrintKey?: string,
): NarutoPrintFaceHit | null {
  let file = artFile;
  if (role === "thumb") file = resolveThumbFile(dir, artFile);
  if (role === "face-b") {
    const b = resolveFaceBFile(dir, disk.card);
    if (!b) return null;
    file = b;
  }
  const filePath = path.join(dir, file);
  if (!existsSync(filePath) || !statSync(filePath).isFile()) return null;
  return {
    filePath,
    artFile: file,
    source,
    ...(donorPrintKey ? { donorPrintKey } : {}),
    disk,
  };
}

/**
 * Locate face bytes for a print. Same-locale only — never cross-lang borrow.
 */
export function resolveNarutoPrintFace(opts: {
  printKey: string;
  lang: string;
  /** `face` (default), `thumb`, or double-illustration `face-b`. */
  role?: "face" | "thumb" | "face-b";
  cardsRoot?: string;
}): NarutoPrintFaceHit | null {
  const lang = opts.lang.trim().toLowerCase();
  if (!lang) return null;
  const diskCard = diskCardOf(opts.printKey);
  if (!diskCard) return null;

  const role = opts.role ?? "face";
  const cardsRoot = opts.cardsRoot ?? packCardsDir(NARUTO_PACK_ID);
  const home = homeSetOf(opts.printKey, diskCard);
  const channel = channelSetOf(opts.printKey, diskCard);
  const blockEuBorrow = euPromoBorrowBlocked(channel, lang, diskCard);

  // 1) Own folder under home set.
  const own = tryDir(cardsRoot, lang, home, diskCard);
  if (own) {
    const hit = hitFromDir(own.dir, own.artFile, role, "owned", {
      lang,
      set: home,
      card: diskCard,
    });
    if (hit) return hit;
  }

  // 2) Retail sibling folder (promo/prerelease → bare number), same home set.
  const retail = narutoRetailDiskNumber(diskCard);
  if (retail && retail.toLowerCase() !== diskCard.toLowerCase()) {
    if (!blockEuBorrow) {
      const sib = tryDir(cardsRoot, lang, home, retail);
      if (sib) {
        const hit = hitFromDir(
          sib.dir,
          sib.artFile,
          role,
          "borrowed",
          { lang, set: home, card: retail },
          mintDonorKey(home, retail),
        );
        if (hit) return hit;
      }
    }
  }

  // 3) artBorrowFrom chain (same locale, sister series).
  const collectorRetail = retail ?? diskCard;
  if (!blockEuBorrow) {
    for (const set of borrowChainFor(channel)) {
      const sib = tryDir(cardsRoot, lang, set, collectorRetail);
      if (!sib) continue;
      const hit = hitFromDir(
        sib.dir,
        sib.artFile,
        role,
        "borrowed",
        { lang, set, card: collectorRetail },
        mintDonorKey(set, collectorRetail),
      );
      if (hit) return hit;
    }
  }

  // 4) sameNumberArtFallback — EN CCG reprints only. Carddass FR/IT keep the
  //    explicit artBorrowFrom chains (S1 must not display a later peer face).
  if (
    !blockEuBorrow &&
    sameNumberArtFallbackEnabled() &&
    narutoCatalogueLineForCard(collectorRetail, home) === "en-ccg"
  ) {
    const exclude = new Set<string>([
      home.toLowerCase(),
      ...borrowChainFor(channel).map((s) => s.toLowerCase()),
    ]);
    for (const set of sameNumberDonorSets(
      cardsRoot,
      lang,
      collectorRetail,
      exclude,
    )) {
      const sib = tryDir(cardsRoot, lang, set, collectorRetail);
      if (!sib) continue;
      const hit = hitFromDir(
        sib.dir,
        sib.artFile,
        role,
        "borrowed",
        { lang, set, card: collectorRetail },
        mintDonorKey(set, collectorRetail),
      );
      if (hit) return hit;
    }
  }

  return null;
}

const PRINT_ROLE = /^(face|thumb|face-b)$/;
const LANG_SEGMENT = /^[a-z]{2}([a-z]{2})?$/i;

function safeSegment(value: string): boolean {
  return Boolean(value) && !value.includes("..") && !value.includes("/");
}

/**
 * Groupings that {@link printKeyItemSlug} puts *before* the collector number
 * (`cdf-te0030-fr`, `prerelease-ni0019-fr`). Not catalogue set codes.
 */
const STEM_LEADING_GROUPINGS = new Set(["cdf", "prerelease", "ps"]);

/**
 * Reverse a shelf / asset stem head onto a set-scoped printKey.
 * `s1-cl0001` → `naruto:s1-cl0001`; `cdf-te0030` → `naruto:promo-te0030-cdf`
 * (not `naruto:cdf-te0030`).
 */
function printKeyFromShelfStemHead(head: string): string | null {
  const lower = head.trim().toLowerCase();
  if (!lower || !safeSegment(lower) || lower.includes(":")) return null;

  const lead = /^([a-z]+)-(.+)$/i.exec(lower);
  if (lead && STEM_LEADING_GROUPINGS.has(lead[1]!.toLowerCase())) {
    const grouping = lead[1]!.toLowerCase();
    const number = lead[2]!.toLowerCase();
    if (!safeSegment(number) || number.includes(":")) return null;
    const set = grouping === "prerelease" ? "s1" : "promo";
    return mintNarutoPrintKey(`${number}-${grouping}`, set);
  }

  const direct = `naruto:${lower}`;
  return parsePrintKey(direct) ? direct : null;
}

/** `s1-cl0001-fr` / `cdf-te0030-fr` → printKey + lang (shelf stem without finish). */
function matchShelfStylePrintStem(stem: string): {
  printKey: string;
  lang: string;
} | null {
  const m = /^(.+)-([a-z]{2})$/i.exec(stem.trim());
  if (!m) return null;
  const head = m[1]!.trim().toLowerCase();
  const lang = m[2]!.toLowerCase();
  if (!LANG_SEGMENT.test(lang)) return null;
  const printKey = printKeyFromShelfStemHead(head);
  if (!printKey) return null;
  return { printKey, lang };
}

/**
 * Preferred: `prints / {set}-{id}-{lang} / face|thumb|face-b`
 * (same stem as `/shelves/…/s1-cl0001-fr-normal`, without the finish).
 *
 * Legacy shapes still accepted:
 * - `prints / {lang} / {set} / {card} / role`
 * - `prints / {lang} / {set}-{card} / role`
 * - `prints / {printKey} / {lang} / role`
 */
export function matchNarutoPrintsAssetRest(rest: readonly string[]): {
  printKey: string;
  lang: string;
  role: "face" | "thumb" | "face-b";
} | null {
  if (rest[0] !== "prints") return null;

  // Preferred: prints/{s1-cl0001-fr}/role
  if (rest.length === 3) {
    const stem = decodeURIComponent(rest[1] ?? "").trim();
    const roleRaw = (rest[2] ?? "").trim().toLowerCase();
    if (!PRINT_ROLE.test(roleRaw)) return null;
    const hit = matchShelfStylePrintStem(stem);
    if (!hit) return null;
    return { ...hit, role: roleRaw as "face" | "thumb" | "face-b" };
  }

  // Legacy: prints/{lang}/{set}/{card}/role
  if (rest.length === 5) {
    const lang = decodeURIComponent(rest[1] ?? "").trim().toLowerCase();
    const set = decodeURIComponent(rest[2] ?? "").trim().toLowerCase();
    const card = decodeURIComponent(rest[3] ?? "").trim().toLowerCase();
    const roleRaw = (rest[4] ?? "").trim().toLowerCase();
    if (!LANG_SEGMENT.test(lang) || !PRINT_ROLE.test(roleRaw)) return null;
    if (
      !safeSegment(set) ||
      !safeSegment(card) ||
      set.includes(":") ||
      card.includes(":")
    ) {
      return null;
    }
    return {
      printKey: `naruto:${set}-${card}`,
      lang,
      role: roleRaw as "face" | "thumb" | "face-b",
    };
  }

  if (rest.length !== 4) return null;
  const a = decodeURIComponent(rest[1] ?? "").trim();
  const b = decodeURIComponent(rest[2] ?? "").trim();
  const roleRaw = (rest[3] ?? "").trim().toLowerCase();
  if (!a || !b || !PRINT_ROLE.test(roleRaw)) return null;
  const role = roleRaw as "face" | "thumb" | "face-b";

  // Legacy: prints/{lang}/{set-card}/role
  if (LANG_SEGMENT.test(a) && !/^naruto:/i.test(b) && safeSegment(b)) {
    const printKey = b.includes(":") ? b : `naruto:${b}`;
    if (!/^naruto:/i.test(printKey)) return null;
    return { printKey, lang: a.toLowerCase(), role };
  }

  // Legacy: prints/{printKey}/{lang}/role
  if (/^naruto:/i.test(a) && LANG_SEGMENT.test(b)) {
    return { printKey: a, lang: b.toLowerCase(), role };
  }
  return null;
}
