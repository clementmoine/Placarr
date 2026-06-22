import { describe, expect, it, vi, beforeEach } from "vitest";
import { fetchMetadataByType } from "./metadataFetch";
import { metadataCandidatesForType } from "./metadataProviderSelection";
import { resetMetadataProviderQueuesForTests } from "@/lib/metadataProviderQueue";
import type { MetadataResult } from "@/types/metadataProvider";

// Regression guard for the metadata-refresh hang: production wires every
// provider adapter through wrapMetadataProviderAdapter, so resolve() already
// passes through the per-provider queue (concurrency 1 for most providers).
// This mock mirrors that wiring exactly. If fetchMetadata's fallback pass ever
// wraps resolve() in runQueuedMetadataProviderCall AGAIN, the outer task holds
// the only queue slot while awaiting the inner task — a re-entrant deadlock
// that hangs the request forever. The test then times out instead of resolving.
const { mockResolve } = vi.hoisted(() => ({ mockResolve: vi.fn() }));

vi.mock("@/services/metadataResolvers", async () => {
  const { runQueuedMetadataProviderCall } = await vi.importActual<
    typeof import("@/lib/metadataProviderQueue")
  >("@/lib/metadataProviderQueue");
  return {
    metadataProviderResolverMap: {
      get: (id: string) => ({
        id,
        resolve: (ctx: unknown) =>
          runQueuedMetadataProviderCall(id, () => mockResolve(ctx, id)),
      }),
    },
  };
});

const CANONICAL = "The Hobbit";

describe("fetchMetadata fallback pass (deadlock regression)", () => {
  beforeEach(() => {
    resetMetadataProviderQueuesForTests();
    mockResolve.mockReset();
  });

  it("does not deadlock when missing providers fall through to the fallback pass", async () => {
    const candidates = metadataCandidatesForType("books");
    expect(candidates.length).toBeGreaterThan(1);
    const anchorId = candidates[0].id;

    // Anchor returns a hit on the canonical name (so hasAnyResult is true and
    // fallback names get built); every other provider misses on the canonical
    // name, forcing them through the fallback pass where the deadlock lived.
    // The anchor's alias becomes a non-canonical fallback name, which is what
    // drives the fallback pass to actually call the missing providers' resolve.
    const FALLBACK_NAME = "Bilbo Le Hobbit";
    mockResolve.mockImplementation(
      async (ctx: { name: string }, id: string): Promise<MetadataResult | null> => {
        if (id === anchorId) {
          return {
            title: CANONICAL,
            aliases: [FALLBACK_NAME],
            imageUrl: "https://example.test/c.jpg",
          };
        }
        if (ctx.name === CANONICAL) return null;
        return { title: ctx.name };
      },
    );

    const result = await Promise.race([
      fetchMetadataByType(CANONICAL, "books"),
      new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error("fetchMetadata deadlocked (timed out)")),
          4000,
        ),
      ),
    ]);

    expect(result).not.toBeNull();
    // The fallback pass must actually have invoked a missing provider with the
    // non-canonical fallback name — this is the call path that deadlocked.
    expect(
      mockResolve.mock.calls.some(
        ([ctx, id]) =>
          id !== anchorId && (ctx as { name: string }).name === "Bilbo Le Hobbit",
      ),
    ).toBe(true);
  });
});
