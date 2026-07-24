import { describe, expect, it } from "vitest";

import { resolveInteractiveWorkerConcurrency } from "./workerConcurrency";

describe("resolveInteractiveWorkerConcurrency", () => {
  it("defaults to 6 without FlareSolverr", () => {
    expect(
      resolveInteractiveWorkerConcurrency({}),
    ).toEqual({ concurrency: 6, cappedForFlare: false });
  });

  it("defaults to 2 when FlareSolverr is configured", () => {
    expect(
      resolveInteractiveWorkerConcurrency({
        FLARESOLVERR_URL: "http://localhost:8191",
      }),
    ).toEqual({ concurrency: 2, cappedForFlare: false });
  });

  it("caps explicit high concurrency when Flare is configured", () => {
    expect(
      resolveInteractiveWorkerConcurrency({
        FLARESOLVERR_URL: "http://localhost:8191",
        WORKER_CONCURRENCY: "6",
      }),
    ).toEqual({ concurrency: 3, cappedForFlare: true });
  });

  it("allows forcing high concurrency past the Flare cap", () => {
    expect(
      resolveInteractiveWorkerConcurrency({
        FLARESOLVERR_URL: "http://localhost:8191",
        WORKER_CONCURRENCY: "6",
        WORKER_CONCURRENCY_FORCE: "1",
      }),
    ).toEqual({ concurrency: 6, cappedForFlare: false });
  });
});
