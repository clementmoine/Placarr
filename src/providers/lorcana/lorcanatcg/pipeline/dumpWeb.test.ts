import { afterEach, describe, expect, it, vi } from "vitest";

import {
  discoverCssPaths,
  dumpLorcanaWeb,
  fetchViewerBytes,
  parseAllAssetStems,
  parseAssetRefs,
  scrapeViewer,
  stableName,
  unlistedFoilStemCandidates,
} from "./dumpWeb";

vi.mock("@/lib/http/httpClient", () => ({
  httpGet: vi.fn(),
}));

vi.mock("@/lib/http/retry", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/http/retry")>();
  // Immediate retries — no backoff sleep in unit tests.
  return {
    ...actual,
    retry: async <T>(
      fn: () => Promise<T>,
      retries = 3,
    ): Promise<T> => {
      let last: unknown;
      for (let attempt = 1; ; attempt += 1) {
        try {
          return await fn();
        } catch (err) {
          last = err;
          if (attempt >= retries || !actual.isRetryableError(err)) throw err;
        }
      }
    },
  };
});

vi.mock("@/providers/lorcana/lorcanatcg/sources/setLogos", () => ({
  ensureLorcanaSetLogoIndex: vi.fn(async () => null),
}));

import { httpGet } from "@/lib/http/httpClient";

const SAMPLE_CSS = `
.Silver .foil-shine .foil-inner{background-image:url(/assets/silverc-B7Q2CuyS.jpg),url(/assets/satin-BFAj3gek.jpg)}
.Satin .foil-shine .foil-inner{background-image:url(/assets/satinc-_4HVyYlm.png),url(/assets/satin-BFAj3gek.jpg)}
.frame{background:url(/assets/frame-slice-D8pv6LjA.png)}
.NewFoil{background:url(/assets/brandnewfoil-AaBbCc12.webp)}
`;

/** Exact ArrayBuffer for a UTF-8 string (not a shared Buffer pool slice). */
function ab(text: string): ArrayBuffer {
  const buf = Buffer.from(text, "utf8");
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
}

afterEach(() => {
  vi.mocked(httpGet).mockReset();
});

describe("dumpWeb", () => {
  it("parseAssetRefs downloads every CSS image stem (no allowlist)", () => {
    const refs = parseAssetRefs(SAMPLE_CSS);
    expect(refs.satin).toBe("/assets/satin-BFAj3gek.jpg");
    expect(refs.silverc).toBe("/assets/silverc-B7Q2CuyS.jpg");
    expect(refs.satinc).toBe("/assets/satinc-_4HVyYlm.png");
    expect(refs.frame).toBe("/assets/frame-slice-D8pv6LjA.png");
    expect(refs.brandnewfoil).toBe("/assets/brandnewfoil-AaBbCc12.webp");
  });

  it("parseAllAssetStems + unlistedFoilStemCandidates surface new site textures", () => {
    const all = parseAllAssetStems(SAMPLE_CSS);
    expect(all.frame).toBe("/assets/frame-slice-D8pv6LjA.png");
    expect(all.brandnewfoil).toBe("/assets/brandnewfoil-AaBbCc12.webp");
    expect(
      unlistedFoilStemCandidates(all, new Set(["silverc", "satin", "satinc"])),
    ).toEqual(["brandnewfoil", "frame"]);
  });

  it("stableName normalizes jpeg → jpg", () => {
    expect(stableName("satin", "jpg")).toBe("satin.jpg");
    expect(stableName("satinc", "JPEG")).toBe("satinc.jpg");
  });

  it("discoverCssPaths finds routes/index sheets", () => {
    const html = '<link rel="stylesheet" href="/assets/routes-DdJjns6d.css">';
    expect(discoverCssPaths(html)).toEqual(["/assets/routes-DdJjns6d.css"]);
  });
});

describe("fetchViewerBytes / scrapeViewer resilience", () => {
  it("retries transient ECONNRESET then succeeds", async () => {
    const reset = Object.assign(new Error("read ECONNRESET"), {
      code: "ECONNRESET",
    });
    vi.mocked(httpGet)
      .mockRejectedValueOnce(reset)
      .mockRejectedValueOnce(reset)
      .mockResolvedValueOnce({ data: ab("ok-bytes-here!!!!") } as never);

    const buf = await fetchViewerBytes("https://cards.disneylorcana.com/fr-FR");
    expect(buf.toString("utf8")).toBe("ok-bytes-here!!!!");
    expect(httpGet).toHaveBeenCalledTimes(3);
  });

  it("scrapeViewer recovers HTML after reset and loads CSS", async () => {
    const reset = Object.assign(new Error("read ECONNRESET"), {
      code: "ECONNRESET",
    });
    const html =
      '<link rel="stylesheet" href="/assets/routes-DdJjns6d.css">';
    vi.mocked(httpGet)
      .mockRejectedValueOnce(reset)
      .mockResolvedValueOnce({ data: ab(html) } as never)
      .mockResolvedValueOnce({ data: ab(SAMPLE_CSS) } as never);

    const scraped = await scrapeViewer();
    expect(scraped.cssSheets).toHaveLength(1);
    expect(scraped.refs.satin).toBe("/assets/satin-BFAj3gek.jpg");
    expect(httpGet).toHaveBeenCalledTimes(3);
  });

  it("dumpLorcanaWeb reports skipped when viewer stays down", async () => {
    const reset = Object.assign(new Error("read ECONNRESET"), {
      code: "ECONNRESET",
    });
    vi.mocked(httpGet).mockRejectedValue(reset);

    const result = await dumpLorcanaWeb({
      root: "/tmp/placarr-lorcana-web-test-missing",
    });
    expect(result.ok).toBe(false);
    expect(result.skipped).toBe(true);
    expect(String(result.reason)).toMatch(/ECONNRESET|failed/i);
    expect(result.files).toBe(0);
  });
});
