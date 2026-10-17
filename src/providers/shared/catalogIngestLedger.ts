/**
 * Ledger d’ingest catalogue — hash d’artefact pour skip re-fetch après purge staging.
 *
 * Pattern : promote → record hash (hors staging) → purge staging. Sync suivant
 * compare le hash distant ; égal ⇒ 0 download même si staging vide.
 *
 * @see docs/catalogue_contract.md
 */
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

import { packLogsDir } from "@/lib/packPaths";

export type CatalogIngestLedgerEntry = {
  artefactId: string;
  contentHash: string;
  promotedAt: string;
};

export type CatalogIngestLedger = {
  version: 1;
  entries: Record<string, CatalogIngestLedgerEntry>;
};

export function emptyCatalogIngestLedger(): CatalogIngestLedger {
  return { version: 1, entries: {} };
}

/** Durable path — never under `staging/` so purge does not erase the ledger. */
export function packCatalogIngestLedgerPath(packId: string): string {
  return path.join(packLogsDir(packId), "catalog-ingest-ledger.json");
}

export function hashCatalogArtefactBytes(buf: Buffer | string): string {
  return createHash("sha256").update(buf).digest("hex");
}

export function readCatalogIngestLedger(filePath: string): CatalogIngestLedger {
  try {
    if (!existsSync(filePath)) return emptyCatalogIngestLedger();
    const raw = JSON.parse(readFileSync(filePath, "utf8")) as CatalogIngestLedger;
    if (raw?.version !== 1 || typeof raw.entries !== "object" || !raw.entries) {
      return emptyCatalogIngestLedger();
    }
    return raw;
  } catch {
    return emptyCatalogIngestLedger();
  }
}

export function writeCatalogIngestLedger(
  filePath: string,
  ledger: CatalogIngestLedger,
): void {
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, `${JSON.stringify(ledger, null, 2)}\n`, "utf8");
}

export function catalogArtefactIsFresh(
  ledger: CatalogIngestLedger,
  artefactId: string,
  contentHash: string,
): boolean {
  const hit = ledger.entries[artefactId];
  return Boolean(hit && hit.contentHash === contentHash);
}

/** Inverse of {@link catalogArtefactIsFresh} — true when a fetch is required. */
export function catalogArtefactNeedsFetch(
  ledger: CatalogIngestLedger,
  artefactId: string,
  contentHash: string,
): boolean {
  return !catalogArtefactIsFresh(ledger, artefactId, contentHash);
}

export function purgeStagingArtefact(stagingPath: string): boolean {
  if (!existsSync(stagingPath)) return false;
  try {
    rmSync(stagingPath, { recursive: true, force: true });
    return true;
  } catch {
    try {
      unlinkSync(stagingPath);
      return true;
    } catch {
      return false;
    }
  }
}

/**
 * Enregistre le hash après promote réussi, puis purge le fichier **ou** dossier
 * staging. Retourne le ledger mis à jour.
 */
export function recordCatalogPromoteAndPurgeStaging(input: {
  ledgerPath: string;
  artefactId: string;
  contentHash: string;
  stagingPath: string;
  now?: Date;
  /** When false, keep staging bytes (ledger only). Default true. */
  purge?: boolean;
}): CatalogIngestLedger {
  const ledger = readCatalogIngestLedger(input.ledgerPath);
  ledger.entries[input.artefactId] = {
    artefactId: input.artefactId,
    contentHash: input.contentHash,
    promotedAt: (input.now ?? new Date()).toISOString(),
  };
  writeCatalogIngestLedger(input.ledgerPath, ledger);
  if (input.purge !== false) {
    purgeStagingArtefact(input.stagingPath);
  }
  return ledger;
}
