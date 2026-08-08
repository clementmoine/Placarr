import { afterEach, describe, expect, it, vi } from "vitest";

import { enqueueFoilExtract, runFoilExtractStream } from "./foilExtract";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("enqueueFoilExtract", () => {
  it("returns the queued job id", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: true,
          jobId: "job-1",
          target: "pokemon",
          kind: "foilExtract",
          label: "Pokémon (TCG Live CDN)",
          hint: "queued",
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const done = await enqueueFoilExtract("pokemon");
    expect(done).toEqual({
      ok: true,
      jobId: "job-1",
      target: "pokemon",
      kind: "foilExtract",
      label: "Pokémon (TCG Live CDN)",
      hint: "queued",
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/admin/foil-extract",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("throws on HTTP errors", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: "Too many extracts" }), {
          status: 429,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );

    await expect(enqueueFoilExtract("lorcana")).rejects.toThrow(
      "Too many extracts",
    );
  });
});

describe("runFoilExtractStream (compat)", () => {
  it("delegates to enqueue", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            ok: true,
            jobId: "job-2",
            target: "pokemon",
            kind: "foilExtract",
            label: "Pokémon",
            hint: "queued",
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        ),
      ),
    );

    const logs: string[] = [];
    const done = await runFoilExtractStream("pokemon", (line) =>
      logs.push(line),
    );
    expect(done.ok).toBe(true);
    expect(logs[0]).toContain("queued");
  });
});
