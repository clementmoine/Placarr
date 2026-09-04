/**
 * Map Capsule Corp Gear / Alerte Hit display ids to Placarr Kayou numbers.
 *
 * CCG uses box-scoped refs (`SP-002` in T1W1) and full set prefixes (`NRZ08-ASP-001`).
 */
const KAYOU_BOX_TO_SET: Readonly<Record<string, string>> = {
  T1W1: "t1w1",
  T1W2: "t1w2",
  T1W3: "t1w3",
  T1W4: "t1w4",
  T2W1: "t2w1",
  T2W2: "t2w2",
  T2W3: "t2w3",
  T2W4: "t2w4",
  T2W5: "t2w5",
  T2W6: "t2w6",
  T2W7: "t2w7",
  T2W8: "t2w8",
  T2W9: "t2w9",
  "T2.5": "t25w1",
  T3W1: "t3w1",
  T3W2: "t3w2",
  T3W3: "t3w3",
  T3W4: "t3w4",
  T3W5: "t3w5",
  T4W1: "t4w1",
  T4W2: "t4w2",
  T4W3: "t4w3",
  T4W4: "t4w4",
  T4W5: "t4w5",
  T4W6: "t4w6",
  T4W7: "t4w7",
  T4W8: "t4w8",
  EX1: "ex1",
  EX2: "ex2",
  EX3: "ex3",
  EX4: "ex4",
  EX5: "ex5",
  NinjaAge: "ninjaagebox",
  NinjaAgeN: "ninjaageboxn",
  YouthScroll: "scrollofyouth",
  NewYears: "newyeargiftbox",
  "Heaven&Earth": "smritiheavenscrolls1",
  BlisterT3W1: "t3w1",
  BlisterT3W2: "t3w2",
  BlisterT3W3: "t3w3",
  BlisterT4W1: "t4w1",
  BlisterT4W2: "t4w2",
  BlisterT4W3: "t4w3",
  Promo: "promo",
  Live: "live",
};

const SET_PREFIX_RE = /^[A-Za-z]+\d/;
const KAYOU_MULTI_PREFIX_RE = /^(NRSS|NRB\d{2}|NRZ\d{2}|NRCC)/i;

/** Capsule Corp box label → internal set code (`T4W8` → `t4w8`). */
export function kayouBoxToSetCode(box: string): string | null {
  const key = box.trim();
  if (!key) return null;
  return KAYOU_BOX_TO_SET[key] ?? null;
}

/** Strip HTML entities and lenticular diamond from a printed id. */
export function kayouCleanPrintedId(raw: string): string {
  return raw
    .replace(/&#x25C7;/gi, "")
    .replace(/◇/g, "")
    .replace(/&[^;]+;/g, "")
    .trim();
}

/**
 * Collapse ledger aliases onto multi-prefix forms used by narutocards.ca:
 * `nr.ss.hr.011` → `nrss.hr.011`, `nr.cc.r.001` → `cc.r.001`.
 * Also admit `slr+` as `slrplus` (printKey segments reject `+`).
 */
export function canonicalizeKayouNumber(number: string): string {
  let n = number.trim().toLowerCase();
  if (!n) return n;
  n = n.replace(/\+/g, "plus");
  // `NR-AR-001 (SILVER)` → `nr.ar.001silver`
  n = n.replace(/\s*\(([^)]+)\)\s*/g, "$1");
  n = n.replace(/\s+/g, "");
  n = n.replace(/^nr\.ss\./, "nrss.");
  n = n.replace(/^nr\.cc\./, "cc.");
  n = n.replace(/^nr\.z(\d{2})\./, "nrz$1.");
  n = n.replace(/^nr\.b(\d{2})\./, "nrb$1.");
  return n;
}

/**
 * Sets where CapsuleCorp uses short `nr.*` while narutocards uses a wave
 * prefix (`nrb07.*` / `nrz06.*`). Mapping them collapses ~280 false twins.
 */
export const KAYOU_SET_WAVE_PREFIX: Readonly<Record<string, string>> = {
  t2w7: "nrb07",
  t4w6: "nrz06",
};

/**
 * Set-aware canonicalize: `nr.cr.023` in `t2w7` → `nrb07.cr.023`.
 */
export function canonicalizeKayouNumberForSet(
  setCode: string,
  number: string,
): string {
  const n = canonicalizeKayouNumber(number);
  const prefix = KAYOU_SET_WAVE_PREFIX[setCode.trim().toLowerCase()];
  if (!prefix) return n;
  if (n.startsWith(`${prefix}.`)) return n;
  const m = /^nr\.([a-z0-9]+)\.(\d+[a-z0-9]*)$/.exec(n);
  if (!m) return n;
  return `${prefix}.${m[1]}.${m[2]}`;
}

/**
 * Normalize a Kayou printed id to dotted lowercase (`NR-R-001` → `nr.r.001`).
 * Box-scoped CCG ids get an `nr.` prefix when missing a set prefix.
 */
export function kayouPrintedToNumber(printed: string): string | null {
  const clean = kayouCleanPrintedId(printed);
  if (!clean) return null;
  const upper = clean.toUpperCase();
  let dotted: string;
  if (KAYOU_MULTI_PREFIX_RE.test(clean) || SET_PREFIX_RE.test(clean)) {
    dotted = clean.toLowerCase().replace(/-/g, ".");
  } else if (/^[A-Z0-9+\-.]+-\d/.test(upper) || /^[A-Z]+\+\-\d/.test(upper)) {
    const withNr = upper.startsWith("NR-") ? upper : `NR-${upper}`;
    dotted = withNr.toLowerCase().replace(/-/g, ".");
  } else {
    dotted = clean.toLowerCase().replace(/-/g, ".");
  }
  return canonicalizeKayouNumber(dotted);
}

/** Restore uppercase dashed ref for display / image lookup. */
export function kayouNumberToPrinted(number: string): string {
  const n = number.trim().toLowerCase();
  if (!n.includes(".")) return n.toUpperCase();
  return n
    .split(".")
    .map((part) => part.toUpperCase())
    .join("-");
}

/** Derive hitmarket `{folder}/{file}` from a printed ref + rarity rank. */
export function kayouHitmarketRelativePath(
  printed: string,
  rank: string | null,
): string | null {
  const clean = kayouCleanPrintedId(printed);
  const parts = clean.split("-").filter(Boolean);
  if (parts.length < 2) return null;

  if (KAYOU_MULTI_PREFIX_RE.test(clean)) {
    const folder = (rank ?? parts[parts.length - 2] ?? "").trim().toUpperCase();
    if (!folder) return null;
    return `${folder}/${parts.join("-")}.webp`;
  }

  const tailNum = parseInt(parts[parts.length - 1]!, 10);
  if (!Number.isFinite(tailNum)) return null;

  if (SET_PREFIX_RE.test(parts[0]!)) {
    const rarity = parts[parts.length - 2]!.toUpperCase();
    return `${rarity}/${rarity}-${tailNum}.webp`;
  }

  const rarity = (rank ?? parts[0] ?? "").trim().toUpperCase();
  if (!rarity) return null;
  return `${rarity}/${rarity}-${tailNum}.webp`;
}

export function kayouHitmarketFaceUrl(
  printed: string,
  rank: string | null,
  index: ReadonlyMap<string, string>,
): string | null {
  const rel = kayouHitmarketRelativePath(printed, rank);
  if (!rel) return null;
  return index.get(rel.toUpperCase()) ?? null;
}

/** Hitmarket filename stem → dotted number when it carries a full Kayou prefix. */
export function kayouHitmarketFileToNumber(file: string): string | null {
  const stem = file.replace(/\.webp$/i, "").trim();
  if (!stem) return null;
  if (KAYOU_MULTI_PREFIX_RE.test(stem) || SET_PREFIX_RE.test(stem)) {
    return kayouPrintedToNumber(stem);
  }
  if (/^[A-Z]+-\d+$/i.test(stem)) return null;
  return null;
}
