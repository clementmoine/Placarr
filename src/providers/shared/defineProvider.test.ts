import { describe, expect, it } from "vitest";

import type { ProviderInfo } from "@/types/providerRegistry";

import {
  defineProvider,
  providerHttp,
  type ProviderSpec,
} from "./defineProvider";

function minimalInfo(overrides: Partial<ProviderInfo> = {}): ProviderInfo {
  return {
    id: "demo",
    label: "Démo",
    types: ["books"],
    capabilities: ["identify"],
    auth: { kind: "none" },
    canonical: false,
    ...overrides,
  };
}

function define(info: ProviderInfo, rest: Partial<ProviderSpec> = {}) {
  return defineProvider({ info, ...rest });
}

describe("defineProvider — validation du manifeste", () => {
  it("accepte le manifeste minimal et le retourne tel quel", () => {
    const info = minimalInfo();
    const module_ = define(info);
    expect(module_.info).toEqual(info);
    // Pas d'URL à pinguer, pas de recherche : aucun défaut n'est inventé.
    expect(module_.healthCheck).toBeUndefined();
    expect(module_.testHandlers).toBeUndefined();
  });

  it("refuse un spec sans types", () => {
    expect(() => define(minimalInfo({ types: [] }))).toThrow(
      /defineProvider: manifeste invalide pour "demo".*types/,
    );
  });

  it("refuse une capability inconnue", () => {
    expect(() =>
      define(
        minimalInfo({
          capabilities: [
            "identify",
            "magic" as ProviderInfo["capabilities"][number],
          ],
        }),
      ),
    ).toThrow(/manifeste invalide pour "demo"/);
  });

  it("refuse un id mal formé ou un label vide", () => {
    expect(() => define(minimalInfo({ id: "Bad Id!" }))).toThrow(/id/);
    expect(() => define(minimalInfo({ label: "" }))).toThrow(/label/);
  });

  it("refuse un auth key sans variable d'env", () => {
    expect(() =>
      define(minimalInfo({ auth: { kind: "key", env: [], free: true } })),
    ).toThrow(/auth/);
  });

  it("refuse des capabilities en double", () => {
    expect(() =>
      define(minimalInfo({ capabilities: ["identify", "identify"] })),
    ).toThrow(/double/);
  });
});

describe("defineProvider — défauts du cas commun", () => {
  it("assemble un healthCheck par ping de info.websiteUrl", () => {
    const module_ = define(
      minimalInfo({
        auth: { kind: "scrape" },
        websiteUrl: "https://www.example.com/",
      }),
    );
    expect(module_.healthCheck?.providerId).toBe("demo");
  });

  it("healthCheckUrl prime sur info.websiteUrl", async () => {
    const explicit = {
      providerId: "demo",
      run: async () => ({
        name: "Démo",
        type: "metadata" as const,
        configured: true,
        status: "up" as const,
        latency: 1,
        error: null,
        credits: null,
      }),
    };
    const module_ = define(minimalInfo(), {
      healthCheckUrl: "https://ping.example.com/",
      healthCheck: explicit,
    });
    expect(module_.healthCheck).toBe(explicit);
  });

  it("génère le testHandler <id>-metadata depuis metadataSearch", async () => {
    const module_ = define(minimalInfo(), {
      metadataSearch: async (query) => ({ query }),
    });
    const handler = module_.testHandlers?.["demo-metadata"];
    expect(handler?.kind).toBe("metadata");
    expect(handler?.label).toBe("Démo - Metadata");
    await expect(handler?.run("Astérix", null)).resolves.toEqual({
      query: "Astérix",
    });
  });

  it("des testHandlers explicites priment sur le défaut", () => {
    const module_ = define(minimalInfo(), {
      metadataSearch: async () => null,
      testHandlers: {
        custom: { label: "Custom", kind: "prices", run: async () => [] },
      },
    });
    expect(Object.keys(module_.testHandlers ?? {})).toEqual(["custom"]);
  });

  it("laisse passer les hooks avancés tels quels", () => {
    const parseMetadataRecordIdFromUrl = (url: string) => url || null;
    const module_ = define(minimalInfo(), { parseMetadataRecordIdFromUrl });
    expect(module_.parseMetadataRecordIdFromUrl).toBe(
      parseMetadataRecordIdFromUrl,
    );
  });
});

describe("defineProvider — contexte injecté", () => {
  it("la forme fonction reçoit ctx.http (ré-export de @/lib/http)", () => {
    let seen: unknown;
    const module_ = defineProvider((ctx) => {
      seen = ctx.http;
      return { info: minimalInfo() };
    });
    expect(module_.info.id).toBe("demo");
    expect(seen).toBe(providerHttp);
    expect(typeof providerHttp.get).toBe("function");
    expect(typeof providerHttp.scrapeText).toBe("function");
    expect(typeof providerHttp.isAxiosError).toBe("function");
  });
});
