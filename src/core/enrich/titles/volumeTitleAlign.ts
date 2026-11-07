import { explicitVolumeNumbers } from "@/core/enrich/titles/volumeNumber";
import { parseRomanToken } from "@/core/enrich/titles/romanNumeral";
import {
  allNumbers,
  normalizeEditionNumber,
} from "@/core/enrich/titles/titleNumbers";
import { variantIdentityTokens } from "@/core/enrich/titles/variantIdentity";

export function editionNumbersAreAligned(
  candidateTitle: string,
  comparisonNames: string[],
): boolean {
  const requestedNumbers = Array.from(
    new Set(comparisonNames.flatMap(explicitVolumeNumbers)),
  );
  const candidateEditionNumbers = explicitVolumeNumbers(candidateTitle);

  if (requestedNumbers.length === 0) {
    if (candidateEditionNumbers.length === 0) return true;
    // Bare "WAKFU 3 Les Mines…" vs catalog "Wakfu, Tome 3 : …" — the request
    // has no "tome/n°" marker but still names the same issue number.
    const bareRequested = Array.from(
      new Set(comparisonNames.flatMap(allNumbers)),
    );
    if (bareRequested.length === 0) return false;
    const bareSet = new Set(bareRequested);
    return candidateEditionNumbers.every((number) => bareSet.has(number));
  }

  const requestedSet = new Set(requestedNumbers);
  const candidateNumbers = allNumbers(candidateTitle);
  if (!candidateNumbers.some((number) => requestedSet.has(number))) {
    return false;
  }

  return candidateEditionNumbers.every((number) => requestedSet.has(number));
}

export function primaryIssueFromTitle(title: string): string | null {
  const explicit = explicitVolumeNumbers(title)[0];
  if (explicit) return explicit;

  const dotIssue = title.match(/\b(\d+)\s*\.\s+/);
  if (dotIssue?.[1]) return normalizeEditionNumber(dotIssue[1]);

  return null;
}

export function compactVolumeTitleForMatch(title: string): string {
  const dotMatch = title.match(/^(.+?)\b(\d+)\s*\.\s+/);
  if (dotMatch) {
    const root = variantIdentityTokens(dotMatch[1]).join(" ");
    const issue = normalizeEditionNumber(dotMatch[2]);
    if (root && issue !== "NaN") return `${root} ${issue}`;
  }

  const issue = primaryIssueFromTitle(title);
  const root = variantIdentityTokens(title).join(" ");
  if (issue && root) return `${root} ${issue}`;
  return title.trim();
}

export function extractNumeralRange(
  title: string,
): { start: number; end: number } | null {
  const match = title.match(/\b([IVXLCDM]+|\d+)\s*[-–—]\s*([IVXLCDM]+|\d+)\b/i);
  if (!match) return null;
  const start = parseRomanToken(match[1]) ?? Number.parseInt(match[1], 10);
  const end = parseRomanToken(match[2]) ?? Number.parseInt(match[2], 10);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) {
    return null;
  }
  return { start, end };
}

export function numeralRangesMismatch(
  requestedName: string,
  candidateTitle: string,
): boolean {
  const requested = extractNumeralRange(requestedName);
  const candidate = extractNumeralRange(candidateTitle);
  if (!requested || !candidate) return false;
  return requested.end < candidate.start || candidate.end < requested.start;
}
