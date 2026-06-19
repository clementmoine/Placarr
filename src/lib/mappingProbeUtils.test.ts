import { describe, expect, it } from "vitest";

import {
  buildUnusedKeys,
  collectMappedKeyLabels,
  inferMappingProbeStatus,
  listProbe,
  metadataProbe,
  mergeMappingProbeRawKeys,
  rawProbe,
} from "./mappingProbeUtils";

describe("mappingProbeUtils", () => {
  it("marks sparse metadata as partial", () => {
    const result = metadataProbe({ title: "Hades" });
    expect(inferMappingProbeStatus(result)).toBe("partial");
  });

  it("marks rich metadata as ok", () => {
    const result = metadataProbe({
      title: "Hades",
      description: "Roguelike",
      facts: [{ kind: "rating", label: "Metacritic", value: "90" }],
      attachments: [{ type: "cover", url: "https://example.com/cover.jpg" }],
    });
    expect(inferMappingProbeStatus(result)).toBe("ok");
  });

  it("detects unused raw keys via aliases", () => {
    const unused = buildUnusedKeys(
      ["UnknownField", "Title"],
      ["title", "description"],
    );
    expect(unused).toContain("UnknownField");
    expect(unused).not.toContain("Title");
  });

  it("ignores transport-only API keys", () => {
    const unused = buildUnusedKeys(
      ["id", "Response", "title"],
      ["title", "description"],
    );
    expect(unused).toEqual([]);
  });

  it("merges API raw keys into probe results", () => {
    const merged = mergeMappingProbeRawKeys(metadataProbe({ title: "Hades" }), [
      "Plot",
      "Title",
    ]);
    expect(merged?.rawKeys).toEqual(["Plot", "Title"]);
    expect(merged?.unusedKeys.length).toBeGreaterThan(0);
  });

  it("extracts list probe examples", () => {
    const result = listProbe([{ name: "Wheelman PS3" }]);
    expect(result?.example).toBe("Wheelman PS3");
    expect(inferMappingProbeStatus(result)).toBe("ok");
  });

  it("lists stored metadata fields without alias noise", () => {
    const labels = collectMappedKeyLabels({
      title: "Hades",
      description: "Roguelike",
      facts: [
        { kind: "rating", label: "Metacritic", value: "90" },
        { kind: "genre", label: "Genres", value: "Action" },
      ],
      attachments: [{ type: "cover", url: "https://example.com/cover.jpg" }],
    });

    expect(labels).toEqual(
      [
        "attachment:cover",
        "description",
        "genre (Genres)",
        "rating (Metacritic)",
        "title",
      ].sort((a, b) => a.localeCompare(b, "fr")),
    );
  });

  it("treats OpenLibrary ISBN fields as covered", () => {
    const unused = buildUnusedKeys(
      ["works", "isbn_13", "classifications", "title"],
      ["title", "barcode", "description"],
    );
    expect(unused).toEqual([]);
  });

  it("treats Steam developers and screenshots as covered", () => {
    const unused = buildUnusedKeys(
      ["developers", "screenshots", "name"],
      ["title", "authors", "attachments"],
    );
    expect(unused).toEqual([]);
  });

  it("treats Deezer availability and explicit flags as covered", () => {
    const unused = buildUnusedKeys(
      ["available", "explicit_content_lyrics", "title"],
      ["title", "facts"],
    );
    expect(unused).toEqual([]);
  });
});
