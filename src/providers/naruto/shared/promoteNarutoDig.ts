/**
 * Promote a valued Naruto dig folder → ingest ledger + purge staging.
 * Rebuildable harvests only — face-gap digs stay until mapped.
 *
 * Sync skip: compare a **stable** curated contentHash (not staging fingerprint)
 * via {@link narutoDigArtefactFresh} **before** re-download. Folder fingerprints
 * are useless after purge (staging empty ⇒ harvest always restarts).
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

import { packStagingDir } from "@/lib/packPaths";
import {
  catalogArtefactIsFresh,
  hashCatalogArtefactBytes,
  packCatalogIngestLedgerPath,
  readCatalogIngestLedger,
  recordCatalogPromoteAndPurgeStaging,
} from "@/providers/shared/catalogIngestLedger";

/** Cheap fingerprint when no single content file is the SSOT. */
export function narutoDigFolderFingerprint(stagingPath: string): string {
  let files = 0;
  let bytes = 0;
  const walk = (dir: string) => {
    if (!existsSync(dir)) return;
    for (const name of readdirSync(dir)) {
      if (name.startsWith(".")) continue;
      const abs = path.join(dir, name);
      let st;
      try {
        st = statSync(abs);
      } catch {
        continue;
      }
      if (st.isDirectory()) walk(abs);
      else {
        files += 1;
        bytes += st.size;
      }
    }
  };
  walk(stagingPath);
  return `files:${files}|bytes:${bytes}`;
}

export function hashNarutoCuratedFile(absPath: string): string {
  return hashCatalogArtefactBytes(readFileSync(absPath));
}

export function hashNarutoCuratedJson(value: unknown): string {
  return hashCatalogArtefactBytes(JSON.stringify(value));
}

/** True ⇒ skip harvest/install (ledger hash matches curated SSOT). */
export function narutoDigArtefactFresh(opts: {
  packId: string;
  artefactId: string;
  contentHash: string;
  force?: boolean;
}): boolean {
  if (opts.force) return false;
  return catalogArtefactIsFresh(
    readCatalogIngestLedger(packCatalogIngestLedgerPath(opts.packId)),
    opts.artefactId,
    opts.contentHash,
  );
}

export function promoteAndPurgeNarutoDig(opts: {
  packId: string;
  artefactId: string;
  stagingRel: string;
  /** Override hash (e.g. curated TSV / checklist). Default = folder fingerprint. */
  contentHash?: string;
  stagingDir?: string;
}): { purged: boolean; contentHash: string | null } {
  const staging =
    opts.stagingDir ??
    path.join(packStagingDir(opts.packId), opts.stagingRel);
  if (!existsSync(staging)) {
    return { purged: false, contentHash: null };
  }
  const contentHash =
    opts.contentHash ?? narutoDigFolderFingerprint(staging);
  recordCatalogPromoteAndPurgeStaging({
    ledgerPath: packCatalogIngestLedgerPath(opts.packId),
    artefactId: opts.artefactId,
    contentHash,
    stagingPath: staging,
  });
  return { purged: !existsSync(staging), contentHash };
}
