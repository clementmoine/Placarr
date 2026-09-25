import { afterEach, describe, expect, it, vi } from "vitest";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  packCatalogIngestLedgerPath,
  readCatalogIngestLedger,
} from "@/providers/shared/catalogIngestLedger";
import {
  hashNarutoCuratedJson,
  narutoDigArtefactFresh,
  promoteAndPurgeNarutoDig,
} from "./promoteNarutoDig";

describe("promoteNarutoDig stable contentHash", () => {
  const roots: string[] = [];
  afterEach(() => {
    for (const root of roots.splice(0)) {
      rmSync(root, { recursive: true, force: true });
    }
    vi.unstubAllEnvs();
  });

  function tmpDataRoot(): string {
    const root = mkdtempSync(path.join(os.tmpdir(), "naruto-dig-"));
    roots.push(root);
    vi.stubEnv("PLACARR_DATA_DIR", root);
    return root;
  }

  it("hashNarutoCuratedJson is stable for equal payloads", () => {
    const a = hashNarutoCuratedJson({ faces: [{ id: "1" }] });
    const b = hashNarutoCuratedJson({ faces: [{ id: "1" }] });
    expect(a).toBe(b);
    expect(a).toMatch(/^[a-f0-9]{64}$/);
  });

  it("skips harvest when ledger matches curated hash (not folder fingerprint)", () => {
    tmpDataRoot();
    const packId = "naruto/test-pack";
    const artefactId = "faces:demo";
    const contentHash = hashNarutoCuratedJson({ cards: ["a", "b"] });
    const stagingRel = "demo-faces";
    const staging = path.join(
      process.env.PLACARR_DATA_DIR!,
      ...packId.split("/"),
      "staging",
      stagingRel,
    );
    mkdirSync(staging, { recursive: true });
    writeFileSync(path.join(staging, "card.jpg"), "bytes");

    const promoted = promoteAndPurgeNarutoDig({
      packId,
      artefactId,
      stagingRel,
      contentHash,
    });
    expect(promoted.purged).toBe(true);
    expect(promoted.contentHash).toBe(contentHash);
    expect(existsSync(staging)).toBe(false);

    expect(
      narutoDigArtefactFresh({ packId, artefactId, contentHash }),
    ).toBe(true);
    expect(
      narutoDigArtefactFresh({
        packId,
        artefactId,
        contentHash: "files:1|bytes:5",
      }),
    ).toBe(false);
    expect(
      narutoDigArtefactFresh({
        packId,
        artefactId,
        contentHash,
        force: true,
      }),
    ).toBe(false);

    const ledger = readCatalogIngestLedger(packCatalogIngestLedgerPath(packId));
    expect(ledger.entries[artefactId]?.contentHash).toBe(contentHash);
  });
});
