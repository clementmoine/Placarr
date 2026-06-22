import { describe, expect, it, vi, beforeEach } from "vitest";
import { fetchMetadataByType } from "./metadataFetch";
import { metadataProviderResolverMap } from "@/services/metadataResolvers";
import type { MetadataResult } from "@/types/metadataProvider";

// Mock the resolvers map to return test data
const defaultImplementation = async (ctx: any, id: string) => {
  if (ctx.name === "failing") return null;
  return {
    title: `${id} - ${ctx.name}`,
    description: `Description from ${id}`,
  } as MetadataResult;
};

const mockResolve = vi.fn().mockImplementation(defaultImplementation);
vi.mock("@/services/metadataResolvers", () => ({
  metadataProviderResolverMap: {
    get: (id: string) => ({
      id,
      resolve: (ctx: any) => mockResolve(ctx, id),
    }),
  },
}));

describe("fetchMetadataByType generic routing", () => {
  beforeEach(() => {
    mockResolve.mockClear();
    mockResolve.mockImplementation(defaultImplementation);
  });

  it("returns null for unknown media type", async () => {
    const res = await fetchMetadataByType("Catan", "unknown-type");
    expect(res).toBeNull();
  });

  it("queries appropriate providers for books and merges their results", async () => {
    const res = await fetchMetadataByType("Fantastic Mr. Fox", "books");
    
    expect(res).not.toBeNull();
    expect(res?.title).toBe("Fantastic Mr. Fox"); // preferred requested title
    expect(res?.description).toContain("chasseauxlivres"); // description selected from high-weight/French chasseauxlivres
    expect(mockResolve).toHaveBeenCalled();
  });

  it("propagates externalIds from Stage 1 to Stage 2 and fallback resolvers", async () => {
    mockResolve.mockImplementation(async (ctx, id) => {
      if (ctx.name === "Toy Story" && id === "tmdb") {
        return {
          title: "Toy Story",
          externalIds: { imdb: "tt0114709", customId: "prop-test" },
        } as MetadataResult;
      }
      return {
        title: `${id} - Toy Story Stub`,
      } as MetadataResult;
    });

    await fetchMetadataByType("Toy Story", "movies");
    
    const secondaryCall = mockResolve.mock.calls.find((call: any) => {
      const firstArg = call[0];
      const secondArg = call[1];
      return secondArg === "omdb" && firstArg.externalIds?.customId === "prop-test";
    });

    expect(secondaryCall).toBeDefined();
    expect(secondaryCall?.[0].externalIds?.imdb).toBe("tt0114709");
  });
});
