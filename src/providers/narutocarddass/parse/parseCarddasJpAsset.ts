/**
 * Map Wayback / carddas.com JP card specials (sparse official archive).
 * Pure — no I/O.
 *
 * Official CDX only retained a handful of `cardlist/card_img/*_spc2.gif`
 * (not a full 巻ノ… face dump). Hole-fill copies those GIFs into
 * `cards/{family}/{ni0001}/ja/` when art is missing. Legacy printKey still
 * uses set `spc`.
 */

import { buildPrintKey } from "@/core/identify/printKey";

import { narutoDiskCardId } from "../collectorIdentity";
import { NARUTO_GAME, narutoSetCode } from "./parseCarddassAsset";
import { carddasJpCardlistCards } from "./parseCarddasJpCardlist";

export const NARUTO_JP_SPC_SET = narutoSetCode("spc");

export type ParsedCarddasJpAsset = {
  set: string;
  /** Coarse type from filename prefix when present */
  kind: "jutsu" | "irai" | "saku" | "other";
  /** Filename stem, e.g. `jutsu-027_spc2` */
  stem: string;
  /** Alphanumeric collector id for disk + printKey */
  number: string;
  cardId: string;
  printKey: string;
  /** Extension including dot */
  ext: string;
};

/**
 * Parse a carddas.com JP card_img URL.
 * Returns null for chrome (`head.gif`) or unrecognised paths.
 */
export function parseCarddasJpAssetPath(
  urlOrPath: string,
): ParsedCarddasJpAsset | null {
  let pathname: string;
  try {
    pathname = urlOrPath.includes("://")
      ? new URL(urlOrPath).pathname
      : urlOrPath;
  } catch {
    pathname = urlOrPath;
  }
  pathname = decodeURIComponent(pathname).replace(/\\/g, "/");

  const m = pathname.match(
    /\/naruto\/cardlist\/card_img\/([^/]+\.(?:jpe?g|png|gif|webp))$/i,
  );
  if (!m) return null;

  const filename = m[1]!;
  const extMatch = filename.match(/(\.[a-z0-9]+)$/i);
  const ext = (extMatch?.[1] ?? ".gif").toLowerCase();
  const stem = filename.replace(/\.(jpe?g|png|gif|webp)$/i, "").toLowerCase();
  if (stem === "head" || stem.startsWith("head")) return null;

  let kind: ParsedCarddasJpAsset["kind"] = "other";
  if (stem.startsWith("jutsu")) kind = "jutsu";
  else if (stem.startsWith("irai")) kind = "irai";
  else if (stem.startsWith("saku")) kind = "saku";

  // printKey segment: alnum only (drop hyphens / underscores)
  const number = stem.replace(/[^a-z0-9]/gi, "");
  if (!number) return null;

  const printKey = buildPrintKey({
    game: NARUTO_GAME,
    set: NARUTO_JP_SPC_SET,
    number,
    grouping: null,
  });
  if (!printKey) return null;

  return {
    set: NARUTO_JP_SPC_SET,
    kind,
    stem,
    number,
    cardId: number,
    printKey,
    ext,
  };
}

const SPC2_FACE_RE = /^(shinobi|jutsu|saku|irai)-(\d+)_spc2$/i;
/** `shinobi-146_7` / `jutsu-348_17` / vol.1 `shinobi-003_1`. */
const VOLUME_FACE_RE = /^(shinobi|jutsu|saku|irai)-(\d+)_(\d{1,2})$/i;
/** `/card/shinobi-352.gif` — prefixed, no volume suffix. */
const BARE_FACE_RE = /^(shinobi|jutsu|saku|irai)-(\d+)$/i;
/** `shinobi_372_16` (underscore dump). */
const UNDERSCORE_VOLUME_FACE_RE =
  /^(shinobi|jutsu|saku|irai)_(\d+)_(\d{1,2})$/i;
const MAKU_JU_FACE_RE = /^ju-(\d+)_d\d$/i;

const SPC2_PREFIX: Record<string, string> = {
  shinobi: "ni",
  jutsu: "te",
  saku: "ta",
  irai: "cl",
};

function diskIdFromKindNumber(
  kind: string | undefined,
  rawNumber: string | undefined,
): string | null {
  if (!kind || !rawNumber) return null;
  const prefix = SPC2_PREFIX[kind.toLowerCase()];
  return prefix ? narutoDiskCardId(`${prefix}${rawNumber}`) : null;
}

/**
 * Sparse official GIFs → disk id for hole-fill (`shinobi-393_spc2` → `ni0393`).
 * Volume dumps use `shinobi-146_7` / `jutsu-348_17` (巻ノ number, not a
 * second collector id). Numbered `001.gif` chrome and event JPEGs stay
 * unmapped — faces on this host are GIFs.
 */
export function carddasJpStagingFaceToDiskId(filename: string): string | null {
  const base = filename.split("/").pop() ?? "";
  if (!/\.(gif|png|webp)$/i.test(base)) return null;
  const stem = base.replace(/\.(gif|png|webp)$/i, "");
  if (!stem) return null;
  const spc = SPC2_FACE_RE.exec(stem);
  if (spc) return diskIdFromKindNumber(spc[1], spc[2]);
  const volume = VOLUME_FACE_RE.exec(stem);
  if (volume) return diskIdFromKindNumber(volume[1], volume[2]);
  const underscore = UNDERSCORE_VOLUME_FACE_RE.exec(stem);
  if (underscore) return diskIdFromKindNumber(underscore[1], underscore[2]);
  const bare = BARE_FACE_RE.exec(stem);
  if (bare) return diskIdFromKindNumber(bare[1], bare[2]);
  const maku = MAKU_JU_FACE_RE.exec(stem);
  if (maku) return narutoDiskCardId(`mju${maku[1]}`);
  return null;
}

function carddasJpStagingFaceIsSpecial(stem: string): boolean {
  return SPC2_FACE_RE.test(stem) || MAKU_JU_FACE_RE.test(stem);
}

let cardlistDiskIds: Set<string> | null = null;

function carddasJpCardlistDiskIds(): Set<string> {
  if (!cardlistDiskIds) {
    cardlistDiskIds = new Set(
      carddasJpCardlistCards().map((row) => row.number.toLowerCase()),
    );
  }
  return cardlistDiskIds;
}

/**
 * Install only when the filename maps onto an official 巻ノ… id, or a
 * known special (`_spc2`, Maku `ju-N_dN`). Bare `/card/saku-214.gif`
 * dumps are sequential site ids — not 作-214.
 */
export function carddasJpStagingFaceInstallTarget(
  filename: string,
): string | null {
  const diskId = carddasJpStagingFaceToDiskId(filename);
  if (!diskId) return null;
  const stem = (filename.split("/").pop() ?? "").replace(
    /\.(gif|png|webp)$/i,
    "",
  );
  if (carddasJpStagingFaceIsSpecial(stem)) return diskId;
  return carddasJpCardlistDiskIds().has(diskId.toLowerCase()) ? diskId : null;
}
