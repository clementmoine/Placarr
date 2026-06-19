import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/auth";
import { buildCapabilityCoverageMatrix } from "@/lib/providerCoverage";
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
  "players",
  "pageCount",
  "tracksCount",
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

  const providerAuthKinds = new Map(
    PROVIDERS.map((provider) => [provider.id, provider.auth.kind]),
  );

  const coverage = buildCapabilityCoverageMatrix(
    TYPES,
    CAPABILITIES,
    capabilityCoverage,
    (providerId) => {
      const info = PROVIDERS.find((provider) => provider.id === providerId);
      return info ? isProviderConfigured(info) : false;
    },
    providerAuthKinds,
  );

  return NextResponse.json({ providers, coverage });
}
