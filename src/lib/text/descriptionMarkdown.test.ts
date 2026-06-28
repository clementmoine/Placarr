import { describe, expect, it } from "vitest";

import {
  normalizeNumberedDescriptionLists,
  parseInlineNumberedList,
  prepareDescriptionMarkdown,
} from "./descriptionMarkdown";

describe("normalizeNumberedDescriptionLists", () => {
  it("converts a contiguous list starting at 1", () => {
    const input = [
      "Histoires contenues :",
      "",
      "1 Remue-ménage chez Donald",
      "",
      "2 Des chiens qui rapportent",
      "",
      "3 De cadeau en surprise",
    ].join("\n");

    expect(normalizeNumberedDescriptionLists(input)).toBe(
      [
        "Histoires contenues :",
        "",
        "1. Remue-ménage chez Donald",
        "2. Des chiens qui rapportent",
        "3. De cadeau en surprise",
      ].join("\n"),
    );
  });

  it("leaves broken sequences unchanged", () => {
    const input = ["1 First", "2 Second", "4 Fourth"].join("\n");

    expect(normalizeNumberedDescriptionLists(input)).toBe(
      ["1 First", "2 Second", "4 Fourth"].join("\n"),
    );
  });

  it("does not convert a list that does not start at 1", () => {
    const input = ["2 Alpha", "3 Beta"].join("\n");

    expect(normalizeNumberedDescriptionLists(input)).toBe(input);
  });

  it("does not convert a single numbered line", () => {
    const input = "1 Only one entry";

    expect(normalizeNumberedDescriptionLists(input)).toBe(input);
  });

  it("converts an inline list after a heading on the same line", () => {
    const input =
      "Histoires contenues : 1 Picsou ferrailleur de l’espace 2 Sa majesté le roi Dingo 3 Donald à le sens du sou";

    expect(normalizeNumberedDescriptionLists(input)).toBe(
      [
        "Histoires contenues :",
        "",
        "1. Picsou ferrailleur de l’espace",
        "2. Sa majesté le roi Dingo",
        "3. Donald à le sens du sou",
      ].join("\n"),
    );
  });

  it("converts a compact inline list on one line", () => {
    const input =
      "1 Mickey : Une île nommée Mythologia V La corne de licorne 2 Daisy Minnie : Une île nommée Mythologia VI menace dans la brume 3 Donald : Quelle mouche le pique";

    expect(parseInlineNumberedList(input)).toEqual([
      {
        num: 1,
        text: "Mickey : Une île nommée Mythologia V La corne de licorne",
      },
      {
        num: 2,
        text: "Daisy Minnie : Une île nommée Mythologia VI menace dans la brume",
      },
      { num: 3, text: "Donald : Quelle mouche le pique" },
    ]);

    expect(normalizeNumberedDescriptionLists(input)).toBe(
      [
        "1. Mickey : Une île nommée Mythologia V La corne de licorne",
        "2. Daisy Minnie : Une île nommée Mythologia VI menace dans la brume",
        "3. Donald : Quelle mouche le pique",
      ].join("\n"),
    );
  });

  it("converts dashed bullet numbering with blank lines (n°24)", () => {
    const input = [
      "1 Donald chez les vikings",
      "",
      "-2 Désaccord parfait",
      "",
      "- 3 Donald, cet aventurier !",
      "",
      "- 4 Incas pas très logiques",
    ].join("\n");

    expect(normalizeNumberedDescriptionLists(input)).toBe(
      [
        "1. Donald chez les vikings",
        "2. Désaccord parfait",
        "3. Donald, cet aventurier !",
        "4. Incas pas très logiques",
      ].join("\n"),
    );
  });

  it("converts dashed bullet lists after a heading (n°30)", () => {
    const input = [
      "Histoires:",
      "- 1 Les mésaventures de Donaldino",
      "- 2 Caractère changeant",
      "- 3 Vols aéro-portés",
    ].join("\n");

    expect(normalizeNumberedDescriptionLists(input)).toBe(
      [
        "Histoires:",
        "1. Les mésaventures de Donaldino",
        "2. Caractère changeant",
        "3. Vols aéro-portés",
      ].join("\n"),
    );
  });

  it("converts histoire n° markers on one line (n°37)", () => {
    const input =
      "Page de couverture: Oncle Picsou histoire n°1: le rayon anticyclonique histoire n°2: la fontaine de jouvence histoire n°3: la curiosité est un vilain défaut";

    expect(normalizeNumberedDescriptionLists(input)).toBe(
      [
        "Page de couverture: Oncle Picsou",
        "",
        "1. le rayon anticyclonique",
        "2. la fontaine de jouvence",
        "3. la curiosité est un vilain défaut",
      ].join("\n"),
    );
  });

  it("converts a dash-separated inline list after a heading (n°65)", () => {
    const input =
      "Histoires contenues : - Mission Mars pour oncle Picsou (Pages 3 à 32) - Mickey et la statue de Chipo-Latah (Pages 38 à 53) - La fin du haricot ! (Pages 59 à 69)";

    expect(normalizeNumberedDescriptionLists(input)).toBe(
      [
        "Histoires contenues :",
        "",
        "- Mission Mars pour oncle Picsou (Pages 3 à 32)",
        "- Mickey et la statue de Chipo-Latah (Pages 38 à 53)",
        "- La fin du haricot ! (Pages 59 à 69)",
      ].join("\n"),
    );
  });

  it("converts a heading plus spaced multiline numbering (n°79)", () => {
    const input = [
      "Histoires : 1 Donald fait de la résistance",
      "",
      "2 Etat de siège",
      "",
      "3 Mickey et la lettre illisible",
    ].join("\n");

    expect(normalizeNumberedDescriptionLists(input)).toBe(
      [
        "Histoires :",
        "",
        "1. Donald fait de la résistance",
        "2. Etat de siège",
        "3. Mickey et la lettre illisible",
      ].join("\n"),
    );
  });

  it("converts dot-suffixed numbering with blank lines (n°90)", () => {
    const input = [
      "Liste des épisodes :",
      "",
      "1.La terreur venue de l'espace",
      "",
      "2.Donald se met au golf",
      "",
      "3.Mickeymouche",
    ].join("\n");

    expect(normalizeNumberedDescriptionLists(input)).toBe(
      [
        "Liste des épisodes :",
        "",
        "1. La terreur venue de l'espace",
        "2. Donald se met au golf",
        "3. Mickeymouche",
      ].join("\n"),
    );
  });
});

describe("prepareDescriptionMarkdown", () => {
  it("normalizes headings and numbered lists together", () => {
    expect(
      prepareDescriptionMarkdown("##Synopsis\n\n1 One\n2 Two"),
    ).toBe("## Synopsis\n\n1. One\n2. Two");
  });
});
