import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  foilKitStepFresh,
  readFwClientStamp,
  updateFwClientKit,
  type FwClientStamp,
} from "./ensureClient";

function writeStamp(root: string, stamp: FwClientStamp): void {
  mkdirSync(root, { recursive: true });
  writeFileSync(
    join(root, "version.json"),
    `${JSON.stringify(stamp, null, 2)}\n`,
    "utf8",
  );
}

describe("foilKitStepFresh", () => {
  const stamp: FwClientStamp = {
    version: "97",
    buildId: "b",
    stem: "s",
    volumeCount: 1,
    fetchedAt: "2026-01-01T00:00:00.000Z",
    kit: { facesOk: true, shadersOk: true },
  };

  it("skips when kit step is ok and no force/filter", () => {
    expect(foilKitStepFresh(stamp, "facesOk")).toBe(true);
    expect(foilKitStepFresh(stamp, "shadersOk")).toBe(true);
    expect(foilKitStepFresh(stamp, "masksOk")).toBe(false);
  });

  it("does not skip under force, limit, or match", () => {
    expect(foilKitStepFresh(stamp, "facesOk", { force: true })).toBe(false);
    expect(foilKitStepFresh(stamp, "facesOk", { limit: 10 })).toBe(false);
    expect(foilKitStepFresh(stamp, "facesOk", { match: "ST01" })).toBe(false);
  });

  it("refait les faces quand la recette de rendu a changé pour la même version du client", () => {
    const withRecipe = {
      ...stamp,
      kit: { ...stamp.kit, facesRecipe: "cpu-lanczos-v1" },
    };
    expect(
      foilKitStepFresh(withRecipe, "facesOk", {
        facesRecipe: "cpu-lanczos-v1",
      }),
    ).toBe(true);
    expect(
      foilKitStepFresh(withRecipe, "facesOk", {
        facesRecipe: "cpu-lanczos-v2",
      }),
    ).toBe(false);
    // Tampon d'avant la recette (bake WebGL) : à refaire.
    expect(
      foilKitStepFresh(stamp, "facesOk", { facesRecipe: "cpu-lanczos-v1" }),
    ).toBe(false);
  });

  it("does not skip without stamp/kit", () => {
    expect(foilKitStepFresh(null, "facesOk")).toBe(false);
    expect(foilKitStepFresh({ ...stamp, kit: undefined }, "facesOk")).toBe(
      false,
    );
  });
});

describe("updateFwClientKit", () => {
  it("merges kit flags onto the CDN version stamp", () => {
    const root = mkdtempSync(join(tmpdir(), "fw-kit-"));
    writeStamp(root, {
      version: "97",
      buildId: "build",
      stem: "stem",
      volumeCount: 3,
      fetchedAt: "2026-01-01T00:00:00.000Z",
    });

    const next = updateFwClientKit({ facesOk: true, shadersOk: true }, root);
    expect(next?.kit?.facesOk).toBe(true);
    expect(next?.kit?.shadersOk).toBe(true);
    expect(next?.version).toBe("97");

    updateFwClientKit({ masksOk: true }, root);
    const disk = readFwClientStamp(root);
    expect(disk?.kit?.facesOk).toBe(true);
    expect(disk?.kit?.masksOk).toBe(true);
    expect(disk?.kit?.updatedAt).toBeTruthy();

    const raw = JSON.parse(
      readFileSync(join(root, "version.json"), "utf8"),
    ) as FwClientStamp;
    expect(raw.kit?.texturesOk).toBeUndefined();
  });
});
