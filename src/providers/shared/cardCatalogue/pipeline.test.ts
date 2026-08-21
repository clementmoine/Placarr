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
  it("passe la main au pipeline du pack, sans argument par défaut", async () => {
    tmpDataRoot();
    const runPipeline = vi.fn().mockResolvedValue(undefined);
    const hooks = cardCatalogueHooks({
      packId: "test/pack",
      dbPath: () => "/introuvable.sqlite",
      runPipeline,
      autoSkip: ["products"],
    });

    await hooks.refresh();
    expect(runPipeline).toHaveBeenCalledWith([]);
  });

  /*
    Un rafraîchissement horaire n'a pas les mêmes droits qu'un clic : le graphe
    produit se moissonne sur un hôte qui ralentit les rafales.
  */
  it("saute ce qu'une passe automatique ne s'autorise pas", async () => {
    tmpDataRoot();
    const runPipeline = vi.fn().mockResolvedValue(undefined);
    const hooks = cardCatalogueHooks({
      packId: "test/pack",
      dbPath: () => "/introuvable.sqlite",
      runPipeline,
      autoSkip: ["products"],
    });

    await hooks.refresh({ auto: true });
    expect(runPipeline).toHaveBeenCalledWith(["--skip", "products"]);
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
