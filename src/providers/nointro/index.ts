import { createMetadataHealthCheck } from "@/core/catalog/healthUtils";
import { teardownMetadataWhen } from "@/core/catalog/teardownHelpers";
import { metadataProbe } from "@/lib/dev/mappingProbe";
import { collectObjectMappingSignals } from "@/lib/dev/scrapeMappingSignals";
import { probeContextOrDefault } from "@/lib/dev/mappingRawKeys";

import { defineProvider } from "@/providers/shared/defineProvider";
import type { MetadataResult } from "@/types/metadataProvider";

import { ensureNoIntroIndex } from "./indexStore";
import { nointroCatalog } from "./pipeline";
import { fetchFromNoIntro, resolveNoIntroMetadata } from "./resolver";

export const nointroModule = defineProvider({
  info: {
    id: "nointro",
    label: "No-Intro",
    types: ["games"],
    requiresTitleAlignment: true,
    capabilities: ["identify"],
    auth: { kind: "none" },
    supplyMode: "local_catalog",
    canonical: false,
    defaultLanguage: "en",
    websiteUrl: "https://www.no-intro.org/",
    notes:
      "Dump DAT Logiqx (`pnpm nointro:update` : NOINTRO_DAT_PATH et/ou pack zip NOINTRO_DAT_PACK / URL). Index SQLite — pas de download au scan. Checksum (sha1/md5/crc) prioritaire, sinon titre ; pas de jaquette.",
  },
  catalog: nointroCatalog,
  createMetadataAdapter: () => ({
    id: "nointro",
    async resolve(ctx) {
      return (await resolveNoIntroMetadata(ctx)) as MetadataResult | null;
    },
  }),
  healthCheck: createMetadataHealthCheck("nointro", "No-Intro", async () => {
    const start = Date.now();
    const db = await ensureNoIntroIndex();
    return {
      ok: Boolean(db),
      latency: Date.now() - start,
      error: db ? null : "Index unavailable — run pnpm nointro:update",
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
});

export {
  fetchFromNoIntro,
  fetchFromNoIntroByChecksum,
  resolveNoIntroMetadata,
  romChecksumsFromMetadataContext,
} from "./resolver";
export {
  ensureNoIntroIndex,
  buildNoIntroIndex,
  resolveNoIntroDatFiles,
  lookupNoIntroGamesByChecksum,
  searchNoIntroGamesByTitle,
} from "./indexStore";
export {
  isNoIntroDownloadAllowed,
  resolveNoIntroDatPackSource,
  syncNoIntroDatPack,
} from "./syncDatPack";
export { parseNoIntroDatXml } from "./parseDat";
