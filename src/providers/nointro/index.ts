import { createMetadataHealthCheck } from "@/core/catalog/healthUtils";
import { teardownMetadataWhen } from "@/core/catalog/teardownHelpers";
import { metadataProbe } from "@/lib/dev/mappingProbe";
import { collectObjectMappingSignals } from "@/lib/dev/scrapeMappingSignals";
import { probeContextOrDefault } from "@/lib/dev/mappingRawKeys";

import type { ProviderModule } from "@/types/providerModule";
import type { MetadataResult } from "@/types/metadataProvider";

import { ensureNoIntroIndex } from "./indexStore";
import { fetchFromNoIntro } from "./resolver";

export const nointroModule: ProviderModule = {
  info: {
    id: "nointro",
    label: "No-Intro",
    types: ["games"],
    requiresTitleAlignment: true,
    capabilities: ["identify"],
    auth: { kind: "none" },
    canonical: false,
    defaultLanguage: "en",
    websiteUrl: "https://www.no-intro.org/",
    notes:
      "Dump DAT Logiqx local (`pnpm nointro:build-index`, NOINTRO_DAT_PATH = fichier ou dossier). Index SQLite — pas de download au scan. Titre + CRC/clone ; pas de jaquette.",
  },
  createMetadataAdapter: () => ({
    id: "nointro",
    async resolve({ name, platform }) {
      return (await fetchFromNoIntro(name, platform)) as MetadataResult | null;
    },
  }),
  healthCheck: createMetadataHealthCheck("nointro", "No-Intro", async () => {
    const start = Date.now();
    const db = await ensureNoIntroIndex();
    return {
      ok: Boolean(db),
      latency: Date.now() - start,
      error: db ? null : "Index unavailable — run pnpm nointro:build-index",
      configured: true,
    };
  }),
  testHandlers: {
    "nointro-metadata": {
      label: "No-Intro - Metadata",
      kind: "metadata",
      run: (query) => fetchFromNoIntro(query),
    },
  },
  buildTeardownMetadataTasks(ctx) {
    return teardownMetadataWhen(
      ctx,
      "No-Intro",
      () => fetchFromNoIntro(ctx.name, ctx.platform),
      "games",
    );
  },
  mappingProbe: {
    sampleInput: "Tetris (World)",
    context: {
      name: "Tetris",
      platform: "Game Boy",
    },
  },
  runMappingProbe: async () => {
    const metadata = await fetchFromNoIntro("Tetris", "Game Boy");
    return metadataProbe(metadata);
  },
  collectMappingRawKeys: async (context) => {
    const ctx = probeContextOrDefault(context, {
      name: "Tetris",
      platform: "Game Boy",
    });
    const metadata = await fetchFromNoIntro(
      ctx.name,
      ctx.platform ?? undefined,
    );
    return collectObjectMappingSignals(metadata);
  },
};

export { fetchFromNoIntro, fetchFromNoIntroByChecksum } from "./resolver";
export {
  ensureNoIntroIndex,
  buildNoIntroIndex,
  resolveNoIntroDatFiles,
  lookupNoIntroGamesByChecksum,
  searchNoIntroGamesByTitle,
} from "./indexStore";
export { parseNoIntroDatXml } from "./parseDat";
