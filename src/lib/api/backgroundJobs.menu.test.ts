import { describe, expect, it } from "vitest";

import { backgroundJobsForMenu, type BackgroundJob } from "./backgroundJobs";

const base: BackgroundJob = {
  id: "j",
  name: "Naruto 疾風伝",
  slug: null,
  kind: "catalogProviderSync",
  startedAt: "2026-11-22T10:00:00.000Z",
  cancellable: false,
  shelf: null,
};

describe("backgroundJobsForMenu", () => {
  it("garde les tâches en cours et les Sync terminées qui ont mis à jour l'étagère", () => {
    const running = { ...base, id: "a", cancellable: true };
    const doneWithItems = {
      ...base,
      id: "b",
      done: true,
      propagatedItemCount: 12,
    };
    expect(backgroundJobsForMenu([running, doneWithItems])).toEqual([
      running,
      doneWithItems,
    ]);
  });

  it("masque une Sync terminée qui n'a touché aucun objet", () => {
    const doneZero = { ...base, id: "c", done: true, propagatedItemCount: 0 };
    const doneUnknown = { ...base, id: "d", done: true };
    expect(backgroundJobsForMenu([doneZero, doneUnknown])).toEqual([]);
  });
});
