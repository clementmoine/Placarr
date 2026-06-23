import { describe, expect, it } from "vitest";

import {
  buildUnusedKeys,
  collectMappedKeyLabels,
  inferMappingProbeStatus,
  listProbe,
  metadataProbe,
  mergeMappingProbeRawKeys,
  mergeMappingProbeSamples,
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

  it("unions multiple samples so a field mapped or returned by any sample counts", () => {
    // Sample A: maps title, exposes a raw "Plot" we don't map.
    const sampleA = {
      probe: mergeMappingProbeRawKeys(metadataProbe({ title: "A" }), [
        "Title",
        "Plot",
      ]),
      rawKeys: ["Title", "Plot"],
    };
    // Sample B: maps a description (covers "Plot"), exposes a new raw "Videos".
    const sampleB = {
      probe: mergeMappingProbeRawKeys(
        metadataProbe({ title: "B", description: "desc" }),
        ["Title", "Videos"],
      ),
      rawKeys: ["Title", "Videos"],
    };

    const merged = mergeMappingProbeSamples([sampleA, sampleB]);

    // Raw keys are unioned across both samples.
    expect(merged?.rawKeys).toEqual(["Plot", "Title", "Videos"]);
    // "Plot" is covered by B's description → no longer counted unused.
    expect(merged?.unusedKeys).not.toContain("Plot");
    // "Videos" is exposed by B but mapped by nobody → a real gap surfaces.
    expect(merged?.unusedKeys).toContain("Videos");
  });

  it("preserves the primary sample's statusHint (never degrades)", () => {
    // A sparse probe would infer "partial"…
    expect(inferMappingProbeStatus(metadataProbe({ title: "Sparse" }))).toBe(
      "partial",
    );
    // …but if the primary sample carries an explicit "ok" hint, the union keeps it.
    const sparse = metadataProbe({ title: "Sparse" })!;
    const primary = { ...sparse, statusHint: "ok" as const };
    const merged = mergeMappingProbeSamples([
      { probe: primary, rawKeys: [] },
      { probe: metadataProbe({ title: "Other" }), rawKeys: [] },
    ]);
    expect(merged?.statusHint).toBe("ok");
    expect(inferMappingProbeStatus(merged)).toBe("ok");
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
