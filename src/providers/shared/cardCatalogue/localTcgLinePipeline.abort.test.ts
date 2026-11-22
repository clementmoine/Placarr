import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { runWithJobAbortSignal } from "@/lib/http/jobAbort";

import { runLocalTcgPipeline } from "./localTcgLinePipeline";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("runLocalTcgPipeline — job cancellation", () => {
  it("stops at the next step boundary once the job is aborted", async () => {
    // ADR-003 addendum 2026-11-23 : une Sync annulée s'arrête entre deux
    // étapes même quand l'étape en cours ne fait pas de HTTP.
    vi.stubEnv("PLACARR_DATA_DIR", mkdtempSync(path.join(tmpdir(), "ltcg-")));
    const controller = new AbortController();
    const seedProducts = vi.fn(() => ({ written: 0, skipped: 0 }));

    const run = runWithJobAbortSignal(controller.signal, () =>
      runLocalTcgPipeline({
        packId: "test/abort-pack",
        curatedDir: path.join(tmpdir(), "no-curated"),
        label: "Test",
        seed: () => {
          controller.abort(new Error("job cancelled"));
          return { prints: 0, titles: 0 };
        },
        seedProducts,
      }),
    );

    await expect(run).rejects.toThrow("job cancelled");
    expect(seedProducts).not.toHaveBeenCalled();
  });
});
