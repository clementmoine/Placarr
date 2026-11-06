import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { readPackDocumentsIndex } from "@/lib/admin/packDocuments";

describe("harvestPackDocuments", () => {
  let dataDir: string;

  beforeEach(() => {
    dataDir = mkdtempSync(path.join(tmpdir(), "placarr-docs-"));
    vi.stubEnv("PLACARR_DATA_DIR", dataDir);
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
    rmSync(dataDir, { recursive: true, force: true });
  });

  it("downloads public PDFs under documents/{lang}/{kind}/ and keeps URL-only stubs", async () => {
    const { harvestPackDocuments } = await import("./harvestPackDocuments");
    const bytes = Buffer.from("%PDF-1.4 fake");

    const result = await harvestPackDocuments({
      packId: "pokemon",
      curated: [
        {
          url: "https://assets.pokemon.com/assets/cms2/pdf/trading-card-game/rulebook/swsh10_rulebook_en.pdf",
        },
        {
          url: "https://brand.ravensburger-group.com/d/e1vhRSQ7WeNy",
          download: false,
          kind: "brand",
          lang: "und",
        },
      ],
      fetchBytes: async () => bytes,
    });

    expect(result.fetched).toBe(1);
    expect(result.urlOnly).toBe(1);
    expect(result.failed).toBe(0);

    const index = readPackDocumentsIndex("pokemon");
    expect(index.documents).toHaveLength(2);

    const rulebook = index.documents.find((d) => d.kind === "rulebook");
    expect(rulebook?.relativePath).toBe(
      "en/rulebook/swsh10_rulebook_en.pdf",
    );
    expect(rulebook?.sha256).toBeTruthy();
    expect(rulebook?.bytes).toBe(bytes.byteLength);

    const onDisk = path.join(
      dataDir,
      "pokemon/documents",
      rulebook!.relativePath!,
    );
    expect(readFileSync(onDisk)).toEqual(bytes);

    const brand = index.documents.find((d) => d.kind === "brand");
    expect(brand?.relativePath).toBeNull();
    expect(brand?.fetchedAt).toBeNull();
  });

  it("promotes localPath bytes without network", async () => {
    const { writeFileSync, mkdirSync } = await import("node:fs");
    const staging = path.join(dataDir, "pokemon/staging/docs");
    mkdirSync(staging, { recursive: true });
    const src = path.join(staging, "local-checklist.pdf");
    writeFileSync(src, Buffer.from("%PDF-1.4 local"));

    const { harvestPackDocuments } = await import("./harvestPackDocuments");
    const result = await harvestPackDocuments({
      packId: "pokemon",
      curated: [
        {
          url: "https://example.test/local-checklist.pdf",
          localPath: "staging/docs/local-checklist.pdf",
          lang: "fr",
          kind: "checklist",
        },
      ],
      fetchBytes: async () => {
        throw new Error("network should not be used");
      },
    });

    expect(result.fetched).toBe(1);
    expect(result.failed).toBe(0);
    const index = readPackDocumentsIndex("pokemon");
    const row = index.documents.find((d) => d.kind === "checklist");
    expect(row?.relativePath).toBe("fr/checklist/local-checklist.pdf");
  });

  it("skips re-download when sha256 matches (idempotent)", async () => {
    const { harvestPackDocuments } = await import("./harvestPackDocuments");
    const bytes = Buffer.from("%PDF-1.4 again");
    let fetches = 0;
    const fetchBytes = async () => {
      fetches += 1;
      return bytes;
    };
    const curated = [
      {
        url: "https://assets.pokemon.com/assets/cms2-fr-fr/pdf/trading-card-game/rulebook/xy01_rulebook_fr.pdf",
      },
    ];

    await harvestPackDocuments({
      packId: "pokemon",
      curated,
      fetchBytes,
    });
    const second = await harvestPackDocuments({
      packId: "pokemon",
      curated,
      fetchBytes,
    });

    expect(fetches).toBe(1);
    expect(second.skipped).toBe(1);
    expect(second.fetched).toBe(0);
  });
});
