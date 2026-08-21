/**
 * TCDB Gaming checklists for Bandai USA Naruto CCG (2006–).
 *
 * TCDB invents set-acronym prefixes (`PTHJ-001`, `COSN-074`) that are **not**
 * printed on the cards. Bandai prints `J-001` / `N-074`. Strip the acronym,
 * keep the type letter + digits → `j001` / `n074`. Never store `pthj001`.
 *
 * Sid `118974` (« 2006 Naruto Promos ») is a grab-bag of mixed series
 * prefixes — same trap as Coleka `_r4102`. It is not Bandai `PR-xxx`.
 *
 * Faces stay out of `cards/`: EN CCG Series 1 (*Path to Hokage*) is not
 * Carddass FR Série 1 (*Pays du Vent*). Sharing `cards/s1/en/` would label
 * Path to Hokage with the French starters. Dump target if we ever mirror
 * checklists: `staging/tcdb-en/` (like `bandaicg-en`), not `cards/`.
 */
import tcdbLedger from "./curated/sources/tcdb-en-ccg.json";

type TcdbEnCcgLedger = {
  mainSets: Array<{
    sid: number;
    series: number;
    title: string;
    acronym: string;
  }>;
  doNotIngest: Array<{
    sid: number;
    kind: "grab-bag" | "do-not-merge";
    url?: string;
  }>;
  acronymsObserved: Record<string, number>;
};

const tcdbEnCcg = tcdbLedger as TcdbEnCcgLedger;

export type TcdbNarutoCardType = "n" | "j" | "m" | "c";

export type ParsedTcdbNarutoRef = {
  /** Normalised TCDB code, e.g. `PTHJ-001`. */
  tcdbRef: string;
  /** Set acronym TCDB invented, e.g. `PTH`. */
  acronym: string;
  cardType: TcdbNarutoCardType;
  /** Bandai collector id `j001`. Null when the number is not a plain N/J/M/C. */
  number: string | null;
  /** Extra infix such as `us` in `BODN-us059`. */
  variant: string | null;
};

export type TcdbNarutoSidKind =
  | { kind: "en-ccg-set"; sid: number; series: number; title: string }
  | { kind: "grab-bag"; sid: number }
  | { kind: "do-not-merge"; sid: number };

const CARD_TYPES = new Set<string>(["n", "j", "m", "c"]);

/** `PTHJ-001` / `BODN-us059` / `DLN-187`. */
const REF_RE = /^([A-Z]{2,8})([NJMC])-(?:([A-Z]+))?(\d{1,4})$/i;

function asCardType(letter: string): TcdbNarutoCardType | null {
  const t = letter.toLowerCase();
  return CARD_TYPES.has(t) ? (t as TcdbNarutoCardType) : null;
}

function collectorNumber(type: TcdbNarutoCardType, digits: string): string {
  const n = Number.parseInt(digits, 10);
  if (!Number.isFinite(n) || n < 1) return `${type}${digits.toLowerCase()}`;
  const width = digits.length > 3 ? digits.length : 3;
  return `${type}${String(n).padStart(width, "0")}`;
}

/**
 * `PTHJ-001` → `{ number: "j001", … }`. Returns null for Carddass / Coleka
 * prefixes (`NI-1650`, `TE-109`) and real Bandai promos (`PR-096`).
 */
export function parseTcdbNarutoRef(raw: string): ParsedTcdbNarutoRef | null {
  const trimmed = raw.trim().replace(/\s+/g, "");
  const m = REF_RE.exec(trimmed);
  if (!m) return null;
  const acronym = m[1]!.toUpperCase();
  const cardType = asCardType(m[2]!);
  if (!cardType) return null;
  const variant = m[3] ? m[3].toLowerCase() : null;
  const digits = m[4]!;
  return {
    tcdbRef: `${acronym}${cardType.toUpperCase()}-${variant ?? ""}${digits}`,
    acronym,
    cardType,
    number: variant ? null : collectorNumber(cardType, digits),
    variant,
  };
}

export function tcdbAcronymToSeries(acronym: string): number | null {
  const key = acronym.trim().toUpperCase();
  const n = (tcdbEnCcg.acronymsObserved as Record<string, number>)[key];
  return typeof n === "number" ? n : null;
}

export function parseTcdbSidFromUrl(urlOrPath: string): number | null {
  const m = /(?:^|[/?])sid\/(\d+)/i.exec(urlOrPath);
  if (!m) return null;
  const sid = Number.parseInt(m[1]!, 10);
  return Number.isFinite(sid) && sid > 0 ? sid : null;
}

export function tcdbNarutoSidKind(sid: number): TcdbNarutoSidKind | null {
  const grab = tcdbEnCcg.doNotIngest.find(
    (row) => row.sid === sid && row.kind === "grab-bag",
  );
  if (grab) return { kind: "grab-bag", sid };
  const reject = tcdbEnCcg.doNotIngest.find(
    (row) => row.sid === sid && row.kind === "do-not-merge",
  );
  if (reject) return { kind: "do-not-merge", sid };
  const set = tcdbEnCcg.mainSets.find((row) => row.sid === sid);
  if (set) {
    return {
      kind: "en-ccg-set",
      sid,
      series: set.series,
      title: set.title,
    };
  }
  return null;
}

/** Checklist sids may be staged later; grab-bags and misdated sets never. */
export function tcdbNarutoSidIngestPolicy(
  sid: number,
): "staging-only" | "reject" | "unknown" {
  const kind = tcdbNarutoSidKind(sid);
  if (!kind) return "unknown";
  if (kind.kind === "en-ccg-set") return "staging-only";
  return "reject";
}
