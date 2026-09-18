import { describe, expect, it } from "vitest";

import { auditSiteCategories } from "./auditCategories";
import { tcgCardsSite } from "./sites";

describe("auditSiteCategories", () => {
  const lorcards = tcgCardsSite("lorcards");

  it("signale un rayon publié, typé, et jamais déclaré", () => {
    const site = { ...lorcards, categories: ["boosters", "displays"] };
    const audit = auditSiteCategories(site, [
      "boosters",
      "displays",
      "prerelease-packs",
    ]);
    expect(audit.missing).toEqual(["prerelease-packs"]);
  });

  it("range les accessoires et les rouages du site à part, pas en trou", () => {
    const site = { ...lorcards, categories: ["boosters"] };
    const audit = auditSiteCategories(site, [
      "boosters",
      "card-sleeves",
      "playmats",
      "loader",
      "suggest",
    ]);
    expect(audit.missing).toEqual([]);
    expect(audit.unknown).toEqual([
      "card-sleeves",
      "playmats",
      "loader",
      "suggest",
    ]);
  });

  it("dit ce qui est déclaré mais absent de la nav, sans le retirer", () => {
    const site = { ...lorcards, categories: ["boosters", "illumineers-quest"] };
    // `illumineers-quest` répond 200 alors qu'il a quitté la nav : constaté,
    // pas supprimé.
    const audit = auditSiteCategories(site, ["boosters"]);
    expect(audit.stale).toEqual(["illumineers-quest"]);
  });

  it("distingue un site injoignable d'un site sans trou", () => {
    const audit = auditSiteCategories(lorcards, null);
    expect(audit.reachable).toBe(false);
    expect(audit.missing).toEqual([]);
  });
});
