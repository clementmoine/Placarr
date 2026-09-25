/**
 * Pokémon TCG Live — official local ingest (CDN / APK → data/pokemon).
 * Live join store: `live.sqlite`. Catalogue identity remains TCGdex (`catalog.sqlite`).
 */
import { existsSync } from "node:fs";
import path from "node:path";

import { createMetadataHealthCheck } from "@/core/catalog/healthUtils";
import { parsePrintKey } from "@/core/identify/printKey";
import { dataRoot } from "@/lib/runtimeData";
import type { MetadataResult } from "@/types/metadataProvider";
import type {
  MetadataAdapterContext,
} from "@/types/providerModule";
import { defineProvider } from "@/providers/shared/defineProvider";
import {
  ensurePokemonDbLayout,
  pokemonLiveDbPath,
} from "@/providers/pokemon/paths";

import {
  buildPokemonLiveAttachments,
  liveDefaultImageUrl,
  liveTitleForPrint,
} from "./disk/liveAssets";
import { pokemontcgliveCatalog } from "./pipeline";
import {
  ensureTcgdexSetLogoIndex,
  loadTcgdexSetLogoIndex,
  tcgdexCatalogueSetIdForProduct,
  tcgdexLogoUrlForProduct,
} from "@/providers/pokemon/tcgdex/setLogos";

const PROVIDER_ID = "pokemontcglive";
const PROVIDER_LABEL = "Pokémon TCG Live (local)";
const POKEMON_GAME = "pokemon";

export function pokemonLiveCardsDbPath(): string {
  ensurePokemonDbLayout();
  return pokemonLiveDbPath();
}

function resolveFromLocal(ctx: MetadataAdapterContext): MetadataResult | null {
  const printKey =
    ctx.printKey?.trim() || ctx.externalIds?.printKey?.trim() || "";
  if (!printKey) return null;
  const parsed = parsePrintKey(printKey);
  if (parsed && parsed.game !== POKEMON_GAME) return null;

  const name = ctx.name?.trim() || null;
  const attachments = buildPokemonLiveAttachments({
    printKey,
    name,
    title: name,
  });
  if (attachments.length === 0) return null;

  const title = liveTitleForPrint({ printKey, name }) ?? name ?? printKey;
  return {
    title,
    imageUrl:
      liveDefaultImageUrl({ printKey, name, title }) ?? attachments[0]?.url,
    attachments,
    externalIds: {
      [PROVIDER_ID]: printKey,
      printKey,
    },
  };
}

export const pokemontcgliveModule = defineProvider({
  info: {
    id: PROVIDER_ID,
    label: PROVIDER_LABEL,
    types: ["tcg"],
    capabilities: ["identify", "cover"],
    auth: { kind: "none" },
    supplyMode: "local_catalog",
    catalogLifecycle: "living",
    canonical: false,
    defaultLanguage: "fr",
    websiteUrl: "https://www.pokemon.com/us/pokemon-tcg/",
    notes:
      "Ingest officiel TCG Live (CDN + APK) → `data/pokemon/`. Faces Live : **en** + **fr**. Identité / titres : TCGdex **ja** (original) + fr + en (`catalog.sqlite`). Live join / foil : `live.sqlite`. CDN Live parle aussi de/it/es/ptbr (stems). Produits scellés : pkmcards.fr. Sync : Catalogue Extract.",
  },
  catalog: pokemontcgliveCatalog,
  /*
    Le pack `pokemon` est servi par ce module, mais ses logos de set viennent du
    relevé tcgdex — l'un tient le foil du client Live, l'autre l'identité des
    cartes. C'est ici que les deux se rejoignent, plutôt que dans du code
    partagé qui aurait dû connaître les deux.
  */
  refreshSetLogos: async () => {
    const logos = await ensureTcgdexSetLogoIndex();
    if (!logos) return "tcgdex set logos : indisponible";
    const withLogo = logos.sets.filter((row) => row.logo).length;
    return `tcgdex set logos : ${withLogo} wordmarks / ${logos.sets.length} sets`;
  },
  printGames: [POKEMON_GAME],
  resolveSetLogo: ({ setCode, slug, name }) =>
    tcgdexLogoUrlForProduct({
      setCode,
      slug,
      name,
      index: loadTcgdexSetLogoIndex(),
    }),
  resolveCatalogueSetId: ({ setCode, slug, name }) =>
    tcgdexCatalogueSetIdForProduct({
      setCode,
      slug,
      name,
      index: loadTcgdexSetLogoIndex(),
    }),
  createMetadataAdapter: () => ({
    id: PROVIDER_ID,
    async resolve(ctx) {
      return resolveFromLocal(ctx);
    },
  }),
  // Local ingest resolves by printKey only — probe the same path.
  mappingProbe: {
    sampleInput: "pokemon:bw10-001",
    context: { printKey: "pokemon:bw10-001" },
  },
  healthCheck: createMetadataHealthCheck(
    PROVIDER_ID,
    PROVIDER_LABEL,
    async () => {
      const start = Date.now();
      const dbPath = pokemonLiveCardsDbPath();
      const ok = existsSync(dbPath);
      return {
        ok,
        latency: Date.now() - start,
        error: ok
          ? null
          : `Index unavailable — run Catalogue Sync for Pokémon (${dbPath})`,
        configured: true,
      };
    },
  ),
});

export {
  buildPokemonLiveAttachments,
  liveFrontUrlForPrint,
} from "./disk/liveAssets";
