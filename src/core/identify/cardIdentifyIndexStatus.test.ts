import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  cardIdentifyIndexStatus,
  clearCardIdentifyIndexStatusCache,
} from "./cardIdentifyIndexStatus";

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
  clearCardIdentifyIndexStatusCache();
  vi.unstubAllEnvs();
});

function tmpData(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "identify-status-"));
  roots.push(root);
  vi.stubEnv("PLACARR_DATA_DIR", root);
  return root;
}

describe("cardIdentifyIndexStatus", () => {
  it("reports empty when no indexes", () => {
    tmpData();
    expect(cardIdentifyIndexStatus("ghost/pack")).toEqual({
      visualEntries: 0,
      embeddingEntries: 0,
      embeddingModel: null,
      embeddingsStale: false,
      hasVisual: false,
    });
  });

  it("marks embeddings stale when visual exists without embed", () => {
    const root = tmpData();
    const pack = path.join(root, "demo");
    fs.mkdirSync(pack, { recursive: true });
    fs.writeFileSync(
      path.join(pack, "card-visual-index.json"),
      JSON.stringify({
        version: 2,
        packId: "demo",
        lang: "*",
        builtAt: new Date().toISOString(),
        entries: [
          {
            printKey: "demo:1-1",
            lang: "en",
            set: "1",
            card: "1",
            artRel: "x.webp",
            hash: "0".repeat(16),
          },
        ],
      }),
    );
    const status = cardIdentifyIndexStatus("demo");
    expect(status.hasVisual).toBe(true);
    expect(status.visualEntries).toBe(1);
    expect(status.embeddingEntries).toBe(0);
    expect(status.embeddingsStale).toBe(true);
  });

  it("prefers .count sidecar over scanning the visual JSON", () => {
    const root = tmpData();
    const pack = path.join(root, "demo");
    fs.mkdirSync(pack, { recursive: true });
    const visual = path.join(pack, "card-visual-index.json");
    fs.writeFileSync(
      visual,
      JSON.stringify({
        version: 2,
        packId: "demo",
        lang: "*",
        builtAt: new Date().toISOString(),
        entries: [
          {
            printKey: "demo:1-1",
            lang: "en",
            set: "1",
            card: "1",
            artRel: "x.webp",
            hash: "0".repeat(16),
          },
          {
            printKey: "demo:1-2",
            lang: "en",
            set: "1",
            card: "2",
            artRel: "y.webp",
            hash: "1".repeat(16),
          },
        ],
      }),
    );
    // Sidecar claims 2 — must win without needing another full scan path.
    fs.writeFileSync(`${visual}.count`, "2");
    expect(cardIdentifyIndexStatus("demo").visualEntries).toBe(2);
  });
});
