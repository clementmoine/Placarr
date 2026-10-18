import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { packLogsDir } from "@/lib/packPaths";

import { cardCatalogueHooks } from "./pipeline";

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
  vi.unstubAllEnvs();
});

function tmpDataRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "card-catalogue-"));
  roots.push(root);
  vi.stubEnv("PLACARR_DATA_DIR", root);
  return root;
}

/*
  Ces crochets étaient écrits une fois par pack — neuf lignes de différence sur
  cinquante entre les deux jumeaux Dragon Ball. Ce qu'ils garantissent ne dépend
  d'aucun jeu, et n'était couvert nulle part.
*/
describe("cardCatalogueHooks", () => {
  it("expose dataPack + effectPack pour le wiring hub/foil", () => {
    const hooks = cardCatalogueHooks({
      packId: "test/pack",
      effectPackId: "test-effect",
      dbPath: () => "/introuvable.sqlite",
      runPipeline: async () => undefined,
    });
    expect(hooks.dataPack).toBe("test/pack");
    expect(hooks.effectPack).toBe("test-effect");
  });

  it("persiste cards/products du pipeline dans last-run (signal autonomie)", async () => {
    tmpDataRoot();
    const runPipeline = vi.fn().mockResolvedValue({ cards: 42, products: 3 });
    const hooks = cardCatalogueHooks({
      packId: "test/growth",
      dbPath: () => "/introuvable.sqlite",
      runPipeline,
    });
    await hooks.refresh();
    const lastRun = JSON.parse(
      fs.readFileSync(path.join(packLogsDir("test/growth"), "last-run.json"), "utf8"),
    ) as { cards?: number; products?: number };
    expect(lastRun.cards).toBe(42);
    expect(lastRun.products).toBe(3);
    expect(hooks.status().lastGrowth).toEqual({
      cards: 42,
      products: 3,
      cardsDelta: 42,
      productsDelta: 3,
    });
  });

  it("mesure sets ajoutés avant/après Sync (deltas autonomie)", async () => {
    tmpDataRoot();
    let after = false;
    const hooks = cardCatalogueHooks({
      packId: "test/sets",
      dbPath: () => "/introuvable.sqlite",
      measureCorpus: () =>
        after
          ? {
              cards: 10,
              products: 0,
              sets: 2,
              setIds: ["s1", "s2"],
            }
          : {
              cards: 5,
              products: 0,
              sets: 1,
              setIds: ["s1"],
            },
      runPipeline: async () => {
        after = true;
        return {};
      },
    });
    await hooks.refresh();
    expect(hooks.status().lastGrowth).toEqual({
      cards: 10,
      sets: 2,
      cardsDelta: 5,
      setsDelta: 1,
      addedSets: ["s2"],
    });
  });

  it("passe la main au pipeline du pack, sans argument par défaut", async () => {
    tmpDataRoot();
    const runPipeline = vi.fn().mockResolvedValue(undefined);
    const hooks = cardCatalogueHooks({
      packId: "test/pack",
      dbPath: () => "/introuvable.sqlite",
      runPipeline,
    });

    await hooks.refresh();
    expect(runPipeline).toHaveBeenCalledWith([]);
  });

  it("compose only / langs / limit pour une passe manuelle ciblée", async () => {
    tmpDataRoot();
    const runPipeline = vi.fn().mockResolvedValue(undefined);
    const hooks = cardCatalogueHooks({
      packId: "test/pack",
      dbPath: () => "/introuvable.sqlite",
      runPipeline,
    });

    await hooks.refresh({
      only: ["faces"],
      langs: ["fr"],
      limit: 10,
    });
    expect(runPipeline).toHaveBeenCalledWith([
      "--only",
      "faces",
      "--langs",
      "fr",
      "--limit",
      "10",
    ]);
  });

  it("fusionne skip manuel et autoSkip en CSV", async () => {
    tmpDataRoot();
    const runPipeline = vi.fn().mockResolvedValue(undefined);
    const hooks = cardCatalogueHooks({
      packId: "test/pack",
      dbPath: () => "/introuvable.sqlite",
      runPipeline,
      autoSkip: ["checklist"],
    });

    await hooks.refresh({ auto: true, skip: ["arena"], only: ["faces"] });
    expect(runPipeline).toHaveBeenCalledWith([
      "--only",
      "faces",
      "--skip",
      "checklist,arena",
    ]);
  });

  it("préfixe des args automatiques (ex. --offline Naruto)", async () => {
    tmpDataRoot();
    const runPipeline = vi.fn().mockResolvedValue(undefined);
    const hooks = cardCatalogueHooks({
      packId: "test/pack",
      dbPath: () => "/introuvable.sqlite",
      runPipeline,
      autoExtraArgs: ["--offline"],
      autoSkip: ["checklist"],
    });

    await hooks.refresh({ auto: true });
    expect(runPipeline).toHaveBeenCalledWith([
      "--offline",
      "--skip",
      "checklist",
    ]);
  });

  it("n'invente pas de saut quand le pack n'en déclare aucun", async () => {
    tmpDataRoot();
    const runPipeline = vi.fn().mockResolvedValue(undefined);
    const hooks = cardCatalogueHooks({
      packId: "test/pack",
      dbPath: () => "/introuvable.sqlite",
      runPipeline,
    });

    await hooks.refresh({ auto: true });
    expect(runPipeline).toHaveBeenCalledWith([]);
  });

  /*
    Le cœur : une date de dernier passage qui ment est pire que pas de date du
    tout — on croirait le catalogue frais alors que la moisson a échoué.
  */
  it("n'écrit la trace que si la moisson a abouti", async () => {
    tmpDataRoot();
    const hooks = cardCatalogueHooks({
      packId: "test/pack",
      dbPath: () => "/introuvable.sqlite",
      runPipeline: () => Promise.reject(new Error("moisson tombée")),
    });

    await expect(hooks.refresh()).rejects.toThrow("moisson tombée");
    const trace = path.join(packLogsDir("test/pack"), "last-run.json");
    expect(fs.existsSync(trace)).toBe(false);
  });

  it("écrit la trace quand elle aboutit, en disant si c'était automatique", async () => {
    tmpDataRoot();
    const hooks = cardCatalogueHooks({
      packId: "test/pack",
      dbPath: () => "/introuvable.sqlite",
      runPipeline: () => Promise.resolve(),
    });

    await hooks.refresh({ auto: true });
    const trace = path.join(packLogsDir("test/pack"), "last-run.json");
    expect(fs.existsSync(trace)).toBe(true);
    const written = JSON.parse(fs.readFileSync(trace, "utf8")) as {
      finishedAt?: string;
      auto?: boolean;
    };
    expect(written.auto).toBe(true);
    expect(Date.parse(written.finishedAt ?? "")).not.toBeNaN();

    /*
      Le statut, lui, reste « vide » : ni base ni index sur le disque. C'est
      voulu — une passe qui a tourné ne rend pas un catalogue peuplé, et
      `statusFromLastRun` court-circuite la trace dans ce cas.
    */
    expect(hooks.status().empty).toBe(true);
  });
});
