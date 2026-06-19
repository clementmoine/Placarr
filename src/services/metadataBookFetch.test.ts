import { describe, expect, it, vi, beforeEach } from "vitest";

const { openlibraryResolve, googlebooksResolve } = vi.hoisted(() => ({
  openlibraryResolve: vi.fn(),
  googlebooksResolve: vi.fn(),
}));

vi.mock("@/services/metadataResolvers", () => ({
  metadataProviderResolverMap: new Map([
    ["openlibrary", { id: "openlibrary", resolve: openlibraryResolve }],
    ["googlebooks", { id: "googlebooks", resolve: googlebooksResolve }],
  ]),
}));
vi.mock("@/services/metadataProviderSelection", () => ({
  orderedProviderIdsForType: (_type: string, order: string[]) => order,
}));

import { fetchFromAllBookSources } from "@/services/metadataBookFetch";

describe("fetchFromAllBookSources", () => {
  beforeEach(() => {
    openlibraryResolve.mockReset();
    googlebooksResolve.mockReset();
  });

  it("fusionne OpenLibrary et Google Books avec fieldEvidence", async () => {
    openlibraryResolve.mockResolvedValue({
      title: "Fantastic Mr. Fox",
      authors: [{ name: "Roald Dahl" }],
    });
    googlebooksResolve.mockResolvedValue({
      title: "Fantastic Mr. Fox",
      description: "A clever fox outwits three farmers.",
    });

    const res = await fetchFromAllBookSources(
      "Fantastic Mr. Fox",
      "9780140328721",
    );

    expect(res?.title).toBe("Fantastic Mr. Fox");
    expect(res?.description).toContain("clever fox");
    expect(res?.fieldEvidence?.some((e) => e.source === "OpenLibrary")).toBe(
      true,
    );
    expect(res?.fieldEvidence?.some((e) => e.source === "Google Books")).toBe(
      true,
    );
  });

  it("retourne null si aucune source ne répond", async () => {
    openlibraryResolve.mockResolvedValue(null);
    googlebooksResolve.mockResolvedValue(null);

    expect(
      await fetchFromAllBookSources("Inconnu", "0000000000000"),
    ).toBeNull();
  });

  it("fonctionne avec une seule source disponible", async () => {
    openlibraryResolve.mockResolvedValue(null);
    googlebooksResolve.mockResolvedValue({ title: "Solo Book" });

    const res = await fetchFromAllBookSources("Solo Book");

    expect(res?.title).toBe("Solo Book");
  });
});
