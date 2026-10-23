/**
 * Officialize shared S2–S5 retail faces on Sync.
 *
 * S1 art stays S1-owned — never copied into later series. When a peer set
 * (s2…s5) already has the recto and another peer membership lacks its own
 * folder art, copy the donor file so browse marks the tile `owned`.
 */
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  statSync,
  utimesSync,
} from "node:fs";
import path from "node:path";

import { packCardsDir } from "@/lib/packPaths";

import { isNarutoLangDir, recordNarutoFaceDecision } from "../disk";
import { resolveNarutoDiskArtFilename } from "../diskArtAttachments";
import {
  NARUTO_PACK_ID,
  narutoDiskCardId,
  officialFrChecklistSetsForNumber,
} from "../identity";
import {
  narutoDeckGuaranteeSetsByCollector,
  narutoPackDbPath,
} from "../indexStore";

/** Retail series that may share faces among themselves (never with S1). */
export const PEER_RETAIL_SETS = ["s2", "s3", "s4", "s5"] as const;
export type PeerRetailSet = (typeof PEER_RETAIL_SETS)[number];

/** Materialize donor order — any other peer (never S1). Prefer earlier sets. */
export const PEER_DONOR_CHAIN: Readonly<
  Record<PeerRetailSet, readonly PeerRetailSet[]>
> = {
  s2: ["s3", "s4", "s5"],
  s3: ["s2", "s4", "s5"],
  s4: ["s3", "s2", "s5"],
  s5: ["s4", "s3", "s2"],
};

const PEER_SET = new Set<string>(PEER_RETAIL_SETS);

function isPeerRetailSet(set: string): set is PeerRetailSet {
  return PEER_SET.has(set);
}

type DonorHit = { set: PeerRetailSet; dir: string; artFile: string };

/**
 * Copy peer (S2–S5) rectos onto sibling series folders that still lack art.
 * Never reads or writes S1.
 */
export function materializePeerRetailFaces(
  cardsRoot = packCardsDir(NARUTO_PACK_ID),
  opts?: {
    /** Override FR checklist membership lookup (tests). */
    checklistSetsForNumber?: (number: string) => readonly string[];
    /**
     * Deck / starter guarantee sets by collector (e.g. Temari NI-114 on S4
     * via « L'esprit du sable » — not on the booster checklist).
     */
    deckSetsByCollector?: ReadonlyMap<string, ReadonlySet<string>>;
  },
): { installed: string[]; skipped: string[]; missing: string[] } {
  const installed: string[] = [];
  const skipped: string[] = [];
  const missing: string[] = [];
  const checklistSets =
    opts?.checklistSetsForNumber ?? officialFrChecklistSetsForNumber;
  const deckSets =
    opts?.deckSetsByCollector ?? narutoDeckGuaranteeSetsByCollector();

  if (!existsSync(cardsRoot) || !statSync(cardsRoot).isDirectory()) {
    return { installed, skipped, missing };
  }

  for (const lang of readdirSync(cardsRoot)) {
    const langDir = path.join(cardsRoot, lang);
    if (!statSync(langDir).isDirectory()) continue;
    if (!isNarutoLangDir(lang)) continue;

    const donorsByCard = new Map<string, DonorHit[]>();
    const dirsBySetCard = new Map<string, string>();

    for (const set of PEER_RETAIL_SETS) {
      const setDir = path.join(langDir, set);
      if (!existsSync(setDir) || !statSync(setDir).isDirectory()) continue;
      for (const cardId of readdirSync(setDir)) {
        const cardDir = path.join(setDir, cardId);
        if (!statSync(cardDir).isDirectory()) continue;
        const diskId = (
          narutoDiskCardId(cardId, set) ?? cardId
        ).toLowerCase();
        dirsBySetCard.set(`${set}|${diskId}`, cardDir);
        const artFile = resolveNarutoDiskArtFilename(cardDir);
        if (!artFile) continue;
        const list = donorsByCard.get(diskId) ?? [];
        list.push({ set, dir: cardDir, artFile });
        donorsByCard.set(diskId, list);
      }
    }

    // Membership targets whenever a peer already has art (S5 can feed S3).
    const targets = new Set<string>();
    for (const key of dirsBySetCard.keys()) targets.add(key);
    const membershipIds = new Set<string>(donorsByCard.keys());
    for (const diskId of deckSets.keys()) {
      if (donorsByCard.has(diskId)) membershipIds.add(diskId);
    }
    for (const diskId of membershipIds) {
      for (const set of checklistSets(diskId)) {
        if (!isPeerRetailSet(set)) continue;
        targets.add(`${set}|${diskId}`);
      }
      for (const set of deckSets.get(diskId) ?? []) {
        if (!isPeerRetailSet(set)) continue;
        targets.add(`${set}|${diskId}`);
      }
    }

    for (const key of targets) {
      const sep = key.indexOf("|");
      const set = key.slice(0, sep);
      const diskId = key.slice(sep + 1);
      if (!isPeerRetailSet(set)) continue;

      const destDir =
        dirsBySetCard.get(key) ?? path.join(langDir, set, diskId);
      const ownArt = resolveNarutoDiskArtFilename(destDir);
      if (ownArt) {
        skipped.push(`${lang}/${set}/${diskId}`);
        continue;
      }

      const chain = PEER_DONOR_CHAIN[set];
      const donors = donorsByCard.get(diskId) ?? [];
      let donor: DonorHit | undefined;
      for (const donorSet of chain) {
        donor = donors.find((d) => d.set === donorSet);
        if (donor) break;
      }
      if (!donor) {
        missing.push(`${lang}/${set}/${diskId}`);
        continue;
      }

      const destFile = path.join(destDir, donor.artFile);
      if (existsSync(destFile)) {
        skipped.push(`${lang}/${set}/${diskId}`);
        continue;
      }
      mkdirSync(destDir, { recursive: true });
      copyFileSync(path.join(donor.dir, donor.artFile), destFile);
      recordNarutoFaceDecision(destDir, "art", donor.artFile);
      installed.push(`${lang}/${set}/${diskId}`);
    }
  }

  if (installed.length) {
    const dbPath = narutoPackDbPath(NARUTO_PACK_ID);
    if (existsSync(dbPath)) {
      const now = new Date();
      try {
        utimesSync(dbPath, now, now);
      } catch {
        /* ignore */
      }
    }
  }

  return { installed, skipped, missing };
}
