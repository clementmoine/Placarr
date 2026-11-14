import { describe, expect, it } from "vitest";

import {
  catalogSkipsAutoSync,
  duplicateCatalogProviderSyncIdsToCancel,
} from "@/lib/admin/catalogueAutoSync";
import { BACKGROUND_WORK_STATUS } from "@/core/collect/jobs/workQueue";

describe("catalogSkipsAutoSync", () => {
  it.each([
    { lifecycle: undefined, skip: false },
    { lifecycle: "living", skip: false },
    { lifecycle: "finished", skip: true },
  ] as const)("lifecycle $lifecycle → skip=$skip", ({ lifecycle, skip }) => {
    expect(catalogSkipsAutoSync(lifecycle)).toBe(skip);
  });
});

describe("duplicateCatalogProviderSyncIdsToCancel", () => {
  const t0 = new Date("2026-09-19T12:00:00Z");
  const t1 = new Date("2026-09-19T12:01:00Z");
  const t2 = new Date("2026-09-19T12:02:00Z");

  it("keeps a single pending job per provider (oldest)", () => {
    expect(
      duplicateCatalogProviderSyncIdsToCancel([
        {
          id: "a1",
          status: BACKGROUND_WORK_STATUS.pending,
          providerId: "dbsfw",
          createdAt: t0,
        },
        {
          id: "a2",
          status: BACKGROUND_WORK_STATUS.pending,
          providerId: "dbsfw",
          createdAt: t1,
        },
        {
          id: "a3",
          status: BACKGROUND_WORK_STATUS.pending,
          providerId: "dbsfw",
          createdAt: t2,
        },
        {
          id: "b1",
          status: BACKGROUND_WORK_STATUS.pending,
          providerId: "dbscg",
          createdAt: t0,
        },
      ]),
    ).toEqual(["a2", "a3"]);
  });

  it("prefers the running job over older pendings", () => {
    expect(
      duplicateCatalogProviderSyncIdsToCancel([
        {
          id: "old",
          status: BACKGROUND_WORK_STATUS.pending,
          providerId: "dbsfw",
          createdAt: t0,
        },
        {
          id: "run",
          status: BACKGROUND_WORK_STATUS.running,
          providerId: "dbsfw",
          createdAt: t1,
        },
        {
          id: "new",
          status: BACKGROUND_WORK_STATUS.pending,
          providerId: "dbsfw",
          createdAt: t2,
        },
      ]),
    ).toEqual(["old", "new"]);
  });

  it("leaves singleton jobs alone", () => {
    expect(
      duplicateCatalogProviderSyncIdsToCancel([
        {
          id: "only",
          status: BACKGROUND_WORK_STATUS.pending,
          providerId: "tcgdex",
          createdAt: t0,
        },
      ]),
    ).toEqual([]);
  });
});
