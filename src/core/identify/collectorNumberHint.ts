/**
 * Collector-number hints for identify tie-break (OCR text or typed).
 * Pure — no OCR engine here; callers pass extracted text when available.
 */

import { parsePrintKey } from "@/core/identify/printKey";

const COLLECTOR_PATTERNS: RegExp[] = [
  // 183/249, 047/165 — optional Lorcana-style `• FR • 2` set trailer
  /\b(\d{1,4})\s*\/\s*(\d{1,4})(?:\s*[•·.\-]+\s*(?:[A-Z]{2}\s*[•·.\-]+\s*)?(\d{1,3}))?\b/i,
  // BT01-001, OP01-001, ST01-001, TB2-045
  /\b([A-Z]{1,4}\d{0,2})-(\d{1,4})\b/i,
  // lorcana-style trailing -177 in printKey segment handled separately
  /\b(?:no\.?|n°|#)\s*(\d{1,4})\b/i,
];

export type CollectorNumberHint = {
  /** Normalized digits / set-number fragment for substring match on printKey. */
  needle: string;
  raw: string;
  /**
   * Set code when OCR exposes it (`107/204 • FR • 2` → `2`, or embedded in
   * `tb2-45`). Narrows break-glass so bare `107` does not replace shortlists
   * with every game's card 107.
   */
  set?: string | null;
  /** Right side of slash forms (`204` in `107/204`). */
  total?: string | null;
};

/**
 * Strip leading zeros inside each digit run so OCR `TB2-045` ↔ catalogue
 * `tb2-045` (needle often becomes `tb2-45` after parse).
 */
export function normalizeCollectorDigits(value: string): string {
  return value.toLowerCase().replace(/\d+/g, (digits) => {
    return digits.replace(/^0+/, "") || "0";
  });
}

/** Parse the strongest collector-number-like token from OCR / label text. */
export function parseCollectorNumberHint(
  text: string | null | undefined,
): CollectorNumberHint | null {
  const raw = text?.replace(/\s+/g, " ").trim() ?? "";
  if (!raw) return null;

  for (const pattern of COLLECTOR_PATTERNS) {
    const m = raw.match(pattern);
    if (!m) continue;
    if (m[2] != null && /^\d+$/.test(m[1]!) && /^\d+$/.test(m[2]!)) {
      // Prefer the card number (left of slash), zero-padded loosely.
      const num = m[1]!.replace(/^0+/, "") || "0";
      const total = m[2]!.replace(/^0+/, "") || "0";
      const set =
        m[3] != null ? m[3].replace(/^0+/, "") || "0" : null;
      return {
        needle: num,
        raw: m[0]!,
        set,
        total,
      };
    }
    if (m[2] != null) {
      // SET-NUM → needle includes set; also expose set alone for filters.
      const setPart = normalizeCollectorDigits(m[1]!);
      const numPart = normalizeCollectorDigits(m[2]!);
      return {
        needle: `${setPart}-${numPart}`,
        raw: m[0]!,
        set: setPart,
        total: null,
      };
    }
    const num = (m[1] ?? "").replace(/^0+/, "") || "0";
    return { needle: num, raw: m[0]! };
  }
  return null;
}

/**
 * True when a catalogue print/card number matches an OCR collector hint.
 * With `requireSet`, slash OCR that carried a set (`• 2`) must agree on set+number.
 */
export function printKeyMatchesCollectorHint(
  printKey: string,
  hint: CollectorNumberHint,
  card?: string | null,
  opts?: { requireSet?: boolean },
): boolean {
  const needle = normalizeCollectorDigits(hint.needle);
  if (!needle) return false;
  const requireSet = Boolean(opts?.requireSet && hint.set);

  const parsed = parsePrintKey(printKey);
  if (parsed) {
    const setNorm = normalizeCollectorDigits(parsed.set);
    const numOnly = normalizeCollectorDigits(parsed.number);
    const baseNum = normalizeCollectorDigits(
      parsed.number.split(/[^a-z0-9]/i)[0] ?? parsed.number,
    );
    const setNum = normalizeCollectorDigits(
      `${parsed.set}-${parsed.number}`,
    );

    if (hint.set) {
      const hintSet = normalizeCollectorDigits(hint.set);
      const numOk = baseNum === needle || numOnly === needle;
      // needle may already be `tb2-45`
      if (setNum === needle) return true;
      if (setNorm === hintSet && numOk) return true;
      if (requireSet) return false;
    } else {
      if (setNum === needle) return true;
      if (numOnly === needle || baseNum === needle) return true;
      if (needle.endsWith(`-${baseNum}`)) return true;
    }
  }

  if (requireSet) return false;

  if (card != null) {
    const c = normalizeCollectorDigits(String(card));
    if (c === needle || needle.endsWith(`-${c}`)) return true;
  }

  const keyNorm = normalizeCollectorDigits(printKey);
  if (keyNorm.endsWith(`-${needle}`) || keyNorm.includes(`:${needle}`)) {
    return true;
  }
  if (needle.includes("-") && keyNorm.includes(needle)) return true;
  return false;
}

/**
 * Boost matches whose printKey contains the collector hint.
 * Does not invent new candidates — only reorders / marks.
 */
export function rerankMatchesByCollectorHint<
  T extends { printKey: string; distance: number },
>(
  matches: readonly T[],
  hint: CollectorNumberHint | null | undefined,
): T[] {
  if (!hint || !matches.length) return [...matches];
  const scored = matches.map((row, index) => {
    const strong = printKeyMatchesCollectorHint(row.printKey, hint, null, {
      requireSet: Boolean(hint.set),
    });
    const weak = strong
      ? true
      : printKeyMatchesCollectorHint(row.printKey, hint);
    return { row, index, strong, weak };
  });
  scored.sort((a, b) => {
    if (a.strong !== b.strong) return a.strong ? -1 : 1;
    if (a.weak !== b.weak) return a.weak ? -1 : 1;
    return a.row.distance - b.row.distance || a.index - b.index;
  });
  return scored.map((s) => s.row);
}
