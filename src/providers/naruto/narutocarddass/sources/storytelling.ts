/**
 * Carddass editorial storytelling ledger — mini-chroniques + dig proofs.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { sanitizePublicCitationUrl } from "@/core/enrich/citations/publicCitationUrl";
import { storyBodyPlainText } from "@/core/enrich/storytelling/mentions";

import { narutoCuratedSourcesDir } from "../install/curated";

/** Local compact compare — avoid importing identity (cycle via digCitations). */
function numbersEqual(a: string, b: string): boolean {
  const norm = (raw: string) =>
    raw
      .trim()
      .toLowerCase()
      .replace(/^pr-?/i, "pr")
      .replace(/[^a-z0-9]/gi, "");
  return Boolean(norm(a) && norm(a) === norm(b));
}

export type StorytellingSource = {
  claim: string;
  url: string;
};

export type StorytellingEntry = {
  id: string;
  targets: {
    sealed: readonly string[];
    prints: readonly string[];
  };
  bodyFr: string;
  sources: readonly StorytellingSource[];
};

type StorytellingLedgerFile = {
  kind?: string;
  stories?: readonly {
    id?: string;
    targets?: {
      sealed?: readonly string[];
      prints?: readonly string[];
    };
    bodyFr?: string;
    sources?: readonly { claim?: string; url?: string }[];
  }[];
};

let ledgerCache: StorytellingEntry[] | null | undefined;

export function resetNarutoStorytellingCache(): void {
  ledgerCache = undefined;
}

function storytellingPath(): string {
  return path.join(narutoCuratedSourcesDir(), "storytelling.json");
}

function normalizeEntry(
  raw: NonNullable<StorytellingLedgerFile["stories"]>[number],
): StorytellingEntry | null {
  const id = raw.id?.trim() || "";
  const bodyFr = raw.bodyFr?.trim() || "";
  if (!id || !bodyFr) return null;
  const sources: StorytellingSource[] = [];
  for (const row of raw.sources ?? []) {
    const claim = row.claim?.trim() || "";
    const url = sanitizePublicCitationUrl(row.url);
    if (!claim || !url) continue;
    sources.push({ claim, url });
  }
  if (!sources.length) return null;
  return {
    id,
    bodyFr,
    sources,
    targets: {
      sealed: (raw.targets?.sealed ?? [])
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean),
      prints: (raw.targets?.prints ?? [])
        .map((s) => s.trim())
        .filter(Boolean),
    },
  };
}

export function loadNarutoStorytellingLedger(): readonly StorytellingEntry[] {
  if (ledgerCache !== undefined) return ledgerCache ?? [];
  try {
    if (!existsSync(storytellingPath())) {
      ledgerCache = [];
      return ledgerCache;
    }
    const raw = JSON.parse(
      readFileSync(storytellingPath(), "utf8"),
    ) as StorytellingLedgerFile;
    if (raw?.kind !== "storytelling-ledger") {
      ledgerCache = [];
      return ledgerCache;
    }
    ledgerCache = (raw.stories ?? [])
      .map(normalizeEntry)
      .filter((row): row is StorytellingEntry => Boolean(row));
  } catch {
    ledgerCache = [];
  }
  return ledgerCache;
}

function printKeyMatches(
  target: string,
  number: string,
  printKey?: string | null,
): boolean {
  const needle = number.trim();
  const pk = printKey?.trim() || "";
  if (pk && pk.toLowerCase() === target.toLowerCase()) return true;
  const tail = target.split(":").pop()?.trim() || target;
  const compact = tail.replace(/^pr-?/i, "pr").replace(/[^a-z0-9]/gi, "");
  return numbersEqual(tail, needle) || numbersEqual(compact, needle);
}

export function narutoEditorialStoryEntryForSealedSlug(
  slug: string | null | undefined,
): StorytellingEntry | null {
  const key = slug?.trim().toLowerCase() || "";
  if (!key) return null;
  return (
    loadNarutoStorytellingLedger().find((story) =>
      story.targets.sealed.includes(key),
    ) ?? null
  );
}

export function narutoEditorialStoryEntryForPrint(input: {
  number: string | null | undefined;
  printKey?: string | null;
}): StorytellingEntry | null {
  const number = input.number?.trim() || "";
  if (!number) return null;
  return (
    loadNarutoStorytellingLedger().find((story) =>
      story.targets.prints.some((target) =>
        printKeyMatches(target, number, input.printKey),
      ),
    ) ?? null
  );
}

export function listNarutoStorytellingEntries(): readonly StorytellingEntry[] {
  return loadNarutoStorytellingLedger();
}

export function storytellingSearchBlob(entry: StorytellingEntry): string {
  return [
    entry.id,
    storyBodyPlainText(entry.bodyFr),
    ...entry.targets.sealed,
    ...entry.targets.prints,
    ...entry.sources.map((s) => `${s.claim} ${s.url}`),
  ]
    .join(" ")
    .toLowerCase();
}
