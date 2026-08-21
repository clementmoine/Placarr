import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { createFactsStore } from "./factsStore";

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

type Entry = { text: string };

function packWithFacts(payload: unknown): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "facts-store-"));
  roots.push(root);
  const dir = path.join(root, "dbs", "fw");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "facts.json"), JSON.stringify(payload));
  return root;
}

/*
  Ce mécanisme était écrit une fois par pack. Ce qu'il garantit ne dépend
  d'aucun jeu — seule la fabrication de la clé en dépend, et elle reste au pack.
*/
describe("createFactsStore", () => {
  const store = () =>
    createFactsStore<Entry>({
      packSegments: ["dbs", "fw"],
      keyFor: (setCode, number) =>
        `${setCode}-${number}`.replace(/[-_]p\d+$/i, "").toUpperCase(),
    });

  it("rend les faits d'un tirage", () => {
    const root = packWithFacts({
      version: 1,
      cards: { "FB01-045": { text: "un texte" } },
    });
    expect(store().factsFor("FB01", "045", { root })).toEqual({
      text: "un texte",
    });
  });

  /*
    La normalisation appartient au pack : `FB01-045_p1` est une autre
    illustration de `FB01-045`, même fiche, donc le suffixe tombe.
  */
  it("applique la clé que le pack fournit", () => {
    const root = packWithFacts({
      version: 1,
      cards: { "FB01-045": { text: "un texte" } },
    });
    expect(store().factsFor("FB01", "045_p1", { root })).toEqual({
      text: "un texte",
    });
  });

  it("rend null sur un set ou un numéro vide, sans lire le fichier", () => {
    const root = packWithFacts({ version: 1, cards: {} });
    expect(store().factsFor("", "045", { root })).toBeNull();
    expect(store().factsFor("FB01", "  ", { root })).toBeNull();
  });

  /*
    Un fichier sans `cards` n'est pas un fichier vide : c'est un fichier d'autre
    chose. Le refuser évite qu'il se lise comme « aucun fait relevé ».
  */
  it("refuse un fichier qui n'a pas la bonne forme", () => {
    const root = packWithFacts({ version: 1, autre: {} });
    expect(store().payload(root)).toBeNull();
  });

  it("survit à un fichier absent", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "facts-store-"));
    roots.push(root);
    expect(store().payload(root)).toBeNull();
    expect(store().factsFor("FB01", "045", { root })).toBeNull();
  });

  /*
    Le cache ne vaut que pour la racine par défaut : un test qui lit un dossier
    temporaire ne doit pas empoisonner la lecture suivante.
  */
  it("ne met en cache que la racine par défaut", () => {
    const first = packWithFacts({
      version: 1,
      cards: { "FB01-045": { text: "premier" } },
    });
    const second = packWithFacts({
      version: 1,
      cards: { "FB01-045": { text: "second" } },
    });
    const shared = store();
    expect(shared.factsFor("FB01", "045", { root: first })?.text).toBe(
      "premier",
    );
    expect(shared.factsFor("FB01", "045", { root: second })?.text).toBe(
      "second",
    );
  });
});
