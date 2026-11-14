import { describe, expect, it } from "vitest";

import {
  dbsCgBaseNumber,
  normalizeDbsCgNumber,
  parseDbsCgMastersRow,
  parseDbsCgMastersSuperset,
  splitDbsCgRarity,
} from "./mastersFacts";

/* Relevé sur le dépôt du 2026-08-19 — BT1-001, un Leader recto-verso. */
const LEADER = {
  card_number: "BT1-001",
  card_name: "Champa, Aloof God of Destruction",
  card_rarity: "Rare[R]",
  card_type: "LEADER",
  card_color: "Red",
  card_series: "Galactic Battle",
  card_character: ["Champa"],
  card_era: ["Universe Survival Saga"],
  card_traits: ["God"],
  keywords: ["Awaken"],
  card_power: "10000",
  card_energy_cost: null,
  card_combo_cost: null,
  card_combo_power: null,
  z_energy_cost: null,
  card_skill: '<span class="skill-text">[Auto] Draw 1 card.</span>',
  card_skill_unstyled: "[Auto] Draw 1 card.",
  card_back_name: "God of Destruction Champa",
  card_back_power: "15000",
  card_back_skill: "-",
  card_back_skill_unstyled: "[Awaken] When your life is at 4 or less.",
  card_back_character: ["Champa"],
  card_back_era: ["Universe Survival Saga"],
  card_back_traits: ["God"],
  is_horizontal: false,
  is_banned: false,
  is_limited: false,
  limited_to: 1,
  has_errata: false,
  erratas: [],
  finishes: null,
  status: "published",
  variants: [3729, 473],
};

describe("normalizeDbsCgNumber", () => {
  it("aligne le souligné, le zéro du numéro et le rang de variante", () => {
    expect(normalizeDbsCgNumber("BT24-086_PR2")).toBe("BT24-086-PR2");
    expect(normalizeDbsCgNumber("EX06-35")).toBe("EX06-035");
    // La source écrit `PR2`, le catalogue `PR02` : un seul tirage.
    expect(normalizeDbsCgNumber("BT1-005-PR02")).toBe("BT1-005-PR2");
    expect(normalizeDbsCgNumber("bt1-005")).toBe("BT1-005");
  });

  it("rend le numéro de base d'une réimpression", () => {
    expect(dbsCgBaseNumber("BT24-086_PR2")).toBe("BT24-086");
    expect(dbsCgBaseNumber("BT1-005")).toBe("BT1-005");
  });
});

describe("splitDbsCgRarity", () => {
  it("sépare libellé et code, quelle que soit l'écriture de la source", () => {
    expect(splitDbsCgRarity("Uncommon[UC]")).toEqual({
      rarity: "Uncommon",
      rarityCode: "UC",
    });
    // La même rareté avec une espace avant le crochet : même résultat.
    expect(splitDbsCgRarity("Uncommon [UC]")).toEqual({
      rarity: "Uncommon",
      rarityCode: "UC",
    });
    expect(splitDbsCgRarity("Common")).toEqual({
      rarity: "Common",
      rarityCode: null,
    });
    expect(splitDbsCgRarity(null)).toEqual({ rarity: null, rarityCode: null });
  });
});

describe("parseDbsCgMastersRow", () => {
  it("garde le texte de la carte, le statut tournoi et le verso", () => {
    const card = parseDbsCgMastersRow(LEADER);
    expect(card).toMatchObject({
      cardNumber: "BT1-001",
      name: "Champa, Aloof God of Destruction",
      rarity: "Rare",
      rarityCode: "R",
      cardType: "LEADER",
      color: "Red",
      series: "Galactic Battle",
      power: "10000",
      skill: "[Auto] Draw 1 card.",
      banned: false,
    });
    expect(card?.traits).toEqual(["God"]);
    expect(card?.keywords).toEqual(["Awaken"]);
    // `is_limited` est faux : `limited_to: 1` ne veut alors rien dire.
    expect(card?.limitedTo).toBeNull();
    expect(card?.back).toMatchObject({
      name: "God of Destruction Champa",
      power: "15000",
      skill: "[Awaken] When your life is at 4 or less.",
    });
  });

  it("préfère le texte sans balises et nettoie celui qui en a", () => {
    const card = parseDbsCgMastersRow({
      ...LEADER,
      card_skill_unstyled: null,
    });
    expect(card?.skill).toBe("[Auto] Draw 1 card.");
  });

  it("ne fabrique pas de verso quand la source n'écrit qu'un tiret", () => {
    const card = parseDbsCgMastersRow({
      card_number: "BT1-004",
      card_name: "Krillin",
      card_back_skill: "-",
      card_back_name: null,
      card_back_power: null,
    });
    expect(card?.back).toBeNull();
  });

  it("marque la ligne non publiée au lieu de la faire disparaître", () => {
    const card = parseDbsCgMastersRow({ ...LEADER, status: "Draft" });
    expect(card?.draft).toBe(true);
    expect(parseDbsCgMastersRow(LEADER)?.draft).toBe(false);
  });

  it("retient la limitation quand elle est réelle", () => {
    const card = parseDbsCgMastersRow({
      ...LEADER,
      is_limited: true,
      limited_to: 1,
    });
    expect(card?.limitedTo).toBe(1);
  });

  it("refuse une ligne sans numéro ou sans nom", () => {
    expect(parseDbsCgMastersRow({ card_name: "Sans numéro" })).toBeNull();
    expect(parseDbsCgMastersRow({ card_number: "BT1-002" })).toBeNull();
  });
});

describe("parseDbsCgMastersSuperset", () => {
  it("lit le dépôt indexé par rang et trie par numéro", () => {
    const cards = parseDbsCgMastersSuperset({
      "0": { ...LEADER, card_number: "BT2-010" },
      "1": LEADER,
      "2": null,
    });
    expect(cards.map((c) => c.cardNumber)).toEqual(["BT1-001", "BT2-010"]);
  });

  it("ne garde qu'une ligne par numéro normalisé", () => {
    const cards = parseDbsCgMastersSuperset({
      "0": { ...LEADER, card_number: "BT1-005_PR2" },
      "1": { ...LEADER, card_number: "BT1-005-PR02" },
    });
    expect(cards).toHaveLength(1);
  });
});

describe("décodage du texte", () => {
  it("décode les entités écrites deux fois par le dépôt", () => {
    const card = parseDbsCgMastersRow({
      card_number: "BT1-010",
      card_name: "Test",
      // Relevé tel quel dans `erratas` : le `&` est lui-même encodé.
      card_skill_unstyled: "add +10000 to this card&amp;apos;s Combo",
    });
    expect(card?.skill).toBe("add +10000 to this card's Combo");
  });

  it("décode aussi les entités écrites une seule fois", () => {
    const card = parseDbsCgMastersRow({
      card_number: "BT1-011",
      card_name: "Test",
      card_skill_unstyled: "Play &lt;Fusion&gt; &amp; draw",
    });
    expect(card?.skill).toBe("Play <Fusion> & draw");
  });
});
