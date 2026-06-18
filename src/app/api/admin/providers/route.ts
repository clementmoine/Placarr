import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/auth";
import {
  PROVIDERS,
  isProviderConfigured,
  capabilityCoverage,
  type MediaType,
  type Capability,
} from "@/services/providerRegistry";

const TYPES: MediaType[] = ["games", "movies", "musics", "books", "boardgames"];
const CAPABILITIES: Capability[] = [
  "identify",
  "price",
  "rating",
  "ageRating",
  "cover",
  "description",
  "screenshots",
  "releaseDate",
  "duration",
  "people",
];

/**
 * Vue d'ensemble des providers pour l'admin :
 *   - liste des providers + rôle + clé requise + état de configuration
 *   - matrice de couverture (type × capacité) avec repérage des trous
 *     (0 source) et des single-source dangereux (1 source configurée).
 */
export async function GET() {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  const providers = PROVIDERS.map((p) => ({
    ...p,
    configured: isProviderConfigured(p),
  }));

  const coverage = TYPES.map((type) => ({
    type,
    capabilities: CAPABILITIES.map((capability) => {
      const { providers: ids } = capabilityCoverage(type, capability);
      const configuredIds = ids.filter((id) => {
        const info = PROVIDERS.find((p) => p.id === id);
        return info ? isProviderConfigured(info) : false;
      });
      const risk =
        configuredIds.length === 0
          ? "missing"
          : configuredIds.length === 1
            ? "single-source"
            : "ok";
      return { capability, providers: ids, configuredCount: configuredIds.length, risk };
    }),
  }));

  return NextResponse.json({ providers, coverage });
}
