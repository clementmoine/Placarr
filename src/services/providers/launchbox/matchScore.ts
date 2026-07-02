import { metadataTitleSimilarity } from "@/lib/metadata/titleMatching";
import { parseRomanToken } from "@/lib/title/romanNumeral";

import {
  platformMatchesLaunchBoxEntry,
  resolveLaunchBoxPlatformNames,
} from "./platformMap";

const TOKEN_SYNONYMS: Record<string, string[]> = {
  football: ["soccer"],
  soccer: ["football"],
};

const FRANCHISE_CONFLICTS: Record<string, string[]> = {
  fifa: ["ncaa", "nhl", "madden"],
  ncaa: ["fifa"],
};

export function decodeLaunchBoxTitle(value: string): string {
  return value
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

export function normalizeLaunchBoxTitle(value: string): string {
  return decodeLaunchBoxTitle(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function extractTitleInstallments(title: string): Set<number> {
  const installments = new Set<number>();

  for (const token of normalizeLaunchBoxTitle(title).split(/\s+/)) {
    if (/^\d+$/.test(token)) {
      const value = Number.parseInt(token, 10);
      if (value >= 1900 && value <= 2099) continue;
      if (value >= 1 && value <= 99) installments.add(value);
      continue;
    }

    const roman = parseRomanToken(token);
    if (roman != null && roman >= 1 && roman <= 99) installments.add(roman);
  }

  return installments;
}

function coreTitleTokens(title: string): string[] {
  return normalizeLaunchBoxTitle(title)
    .split(/\s+/)
    .filter(
      (token) =>
        token.length >= 3 &&
        !/^\d+$/.test(token) &&
        !["and", "the", "for", "vs"].includes(token),
    );
}

function candidateContainsToken(candidateText: string, token: string): boolean {
  if (candidateText.includes(token)) return true;

  for (const synonym of TOKEN_SYNONYMS[token] || []) {
    if (candidateText.includes(synonym)) return true;
  }

  return false;
}

function franchiseConflictAdjustment(
  requestedName: string,
  candidateName: string,
): number {
  const requestedTokens = coreTitleTokens(requestedName);
  const candidateTokens = coreTitleTokens(candidateName);
  let adjustment = 0;

  for (const token of requestedTokens) {
    for (const conflict of FRANCHISE_CONFLICTS[token] || []) {
      if (candidateTokens.includes(conflict)) {
        adjustment -= 0.42;
      }
    }
  }

  return adjustment;
}

export function installmentAlignmentAdjustment(
  requestedName: string,
  candidateName: string,
): number {
  const requested = extractTitleInstallments(requestedName);
  const candidate = extractTitleInstallments(candidateName);

  if (requested.size === 0 && candidate.size > 0) return -0.38;

  if (requested.size > 0 && candidate.size === 0) {
    const requestedWithoutInstallments = normalizeLaunchBoxTitle(requestedName)
      .replace(/\b\d+\b/g, " ")
      .replace(/\b(?:i{1,3}|iv|v|vi{0,3}|ix|x|xi|xii)\b/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    const candidateNormalized = normalizeLaunchBoxTitle(candidateName);

    if (
      candidateNormalized &&
      (requestedWithoutInstallments === candidateNormalized ||
        requestedWithoutInstallments.startsWith(`${candidateNormalized} `))
    ) {
      return -0.65;
    }

    return -0.28;
  }

  if (requested.size > 0 && candidate.size > 0) {
    const overlap = [...requested].some((value) => candidate.has(value));
    if (!overlap) return -0.42;
    return 0.2;
  }

  return 0;
}

function distinctiveTokenAdjustment(
  requestedName: string,
  candidateName: string,
): number {
  const requestedTokens = coreTitleTokens(requestedName);
  const candidateText = normalizeLaunchBoxTitle(candidateName);
  let adjustment = 0;

  for (const token of requestedTokens) {
    if (!candidateContainsToken(candidateText, token)) {
      adjustment -= token.length >= 4 ? 0.24 : 0.14;
    }
  }

  const candidateTokens = coreTitleTokens(candidateName);
  const requestedText = normalizeLaunchBoxTitle(requestedName);
  for (const token of candidateTokens) {
    if (requestedText.includes(token)) continue;
    if (token.length >= 4) adjustment -= 0.18;
  }

  adjustment += franchiseConflictAdjustment(requestedName, candidateName);

  return adjustment;
}

function exactTitleAdjustment(
  requestedName: string,
  candidateName: string,
): number {
  const requested = normalizeLaunchBoxTitle(requestedName);
  const candidate = normalizeLaunchBoxTitle(candidateName);

  if (!requested || !candidate) return 0;
  if (requested === candidate) return 0.34;

  if (
    installmentAlignmentAdjustment(requestedName, candidateName) === 0 &&
    (candidate.startsWith(`${requested} `) ||
      candidate.startsWith(`${requested}:`))
  ) {
    return 0.16;
  }

  return 0;
}

export function scoreLaunchBoxTitleMatch(
  requestedName: string,
  candidateName: string,
  platform?: string | null,
  candidatePlatform?: string,
): number {
  const decodedCandidate = decodeLaunchBoxTitle(candidateName);
  let score = metadataTitleSimilarity(requestedName, decodedCandidate);

  score += exactTitleAdjustment(requestedName, decodedCandidate);
  score += installmentAlignmentAdjustment(requestedName, decodedCandidate);
  score += distinctiveTokenAdjustment(requestedName, decodedCandidate);

  if (candidatePlatform) {
    if (platformMatchesLaunchBoxEntry(platform, candidatePlatform)) {
      score += 0.28;
    } else if (resolveLaunchBoxPlatformNames(platform).length > 0) {
      score -= 0.34;
    }
  }

  return score;
}

export function minimumLaunchBoxMatchScore(requestedName: string): number {
  const tokenCount = normalizeLaunchBoxTitle(requestedName)
    .split(/\s+/)
    .filter(Boolean).length;

  if (tokenCount <= 1) return 0.72;
  if (tokenCount === 2) return 0.64;
  return 0.58;
}

/** Relaxed floor when the shelf platform is known and a matching entry exists. */
export function minimumLaunchBoxPlatformMatchScore(
  requestedName: string,
): number {
  return Math.max(0.48, minimumLaunchBoxMatchScore(requestedName) - 0.12);
}
