/**
 * `defineProvider` — factory exécutable pour les providers « cas commun ».
 *
 * Le contrat `ProviderModule` (`@/types/providerModule`) est déclaratif : `info`
 * + ~30 hooks optionnels. Sans factory, chaque provider réassemble la même
 * plomberie à la main (healthCheck par ping, testHandler metadata, imports
 * réseau). `defineProvider` reprend le modèle RomM (contexte injecté) et
 * Backstage (manifeste validé) **sans changer le contrat** :
 *
 * - le `spec.info` est validé par Zod à la création (fail fast : id mal formé,
 *   `types` vide, capability inconnue, `auth` incohérent…) — l'erreur nomme le
 *   provider et le champ fautif ;
 * - les défauts couvrent la plomberie répétée : `healthCheck` par ping de
 *   `healthCheckUrl` (fallback `info.websiteUrl`) via `createMetadataHealthCheck`,
 *   et un testHandler `<id>-metadata` quand `metadataSearch` est fourni ;
 * - tout hook fourni dans le spec prime sur le défaut et passe tel quel —
 *   la factory ne bride aucun hook avancé ;
 * - le contexte injecté (`ProviderContext.http`) ré-exporte la couche
 *   `@/lib/http` pour qu'un provider n'ait pas à importer la couche bas niveau.
 *
 * @see docs/ADR.md ADR-009 — pilote : `src/providers/bedetheque/`.
 */
import { z } from "zod";

import { createMetadataHealthCheck, pingUrl } from "@/core/catalog/healthUtils";
import {
  httpGet,
  httpHead,
  httpPost,
  isAxiosError,
} from "@/lib/http/httpClient";
import {
  fetchGetWithFlareFallback,
  fetchTextWithFlareFallback,
} from "@/lib/http/scrapeFetch";

import type {
  ProviderHealthCheck,
  ProviderModule,
  TestProviderHandler,
} from "@/types/providerModule";
import type { ProviderInfo } from "@/types/providerRegistry";

// ---------------------------------------------------------------------------
// Contexte injecté (modèle RomM) — ré-export ciblé de `@/lib/http`.
// ---------------------------------------------------------------------------

/**
 * Couche HTTP offerte au provider : timeout, abort du job ambiant, dédup,
 * limiter par host, circuit breaker soft-ban et fallback FlareSolverr sont
 * déjà branchés dedans. Un provider qui l'utilise n'importe rien de
 * `@/lib/http` directement.
 */
export const providerHttp = {
  get: httpGet,
  post: httpPost,
  head: httpHead,
  /** GET avec fallback FlareSolverr (hosts protégés), réponse axios-like. */
  scrapeGet: fetchGetWithFlareFallback,
  /** GET texte avec fallback FlareSolverr. */
  scrapeText: fetchTextWithFlareFallback,
  isAxiosError,
} as const;

export type ProviderHttp = typeof providerHttp;

export type ProviderContext = {
  http: ProviderHttp;
};

const providerContext: ProviderContext = { http: providerHttp };

// ---------------------------------------------------------------------------
// Validation du manifeste (modèle Backstage) — fail fast à la création.
// ---------------------------------------------------------------------------

const MEDIA_TYPES = [
  "games",
  "movies",
  "musics",
  "books",
  "boardgames",
  "hardware",
  "tcg",
  "toys",
] as const;

const CAPABILITIES = [
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
] as const;

/**
 * Valide les invariants du manifeste que TypeScript ne peut pas garantir à
 * l'exécution (cohérence, enums, non-vacuité). Les traits optionnels
 * (`coverUrlHost`, `bookCoverPriority`…) restent typés compile-time via
 * `ProviderInfo` ; le schéma ne rejoue pas leur type, il les laisse passer.
 */
const providerInfoSchema = z.looseObject({
  id: z
    .string()
    .min(1)
    .regex(/^[a-z0-9][a-z0-9-]*$/, "id kebab-case attendu (ex. bdovore)"),
  label: z.string().min(1, "label requis"),
  types: z
    .array(z.enum(MEDIA_TYPES))
    .min(1, "types ne peut pas être vide — le provider ne servirait rien"),
  capabilities: z
    .array(z.enum(CAPABILITIES))
    .refine(
      (capabilities) => new Set(capabilities).size === capabilities.length,
      "capabilities en double",
    ),
  auth: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("none") }),
    z.object({ kind: z.literal("scrape") }),
    z.object({
      kind: z.literal("key"),
      env: z.array(z.string().min(1)).min(1, "auth.key sans variable d'env"),
      free: z.boolean(),
    }),
  ]),
  canonical: z.boolean(),
  supplyMode: z.enum(["api_live", "scrape_cache", "local_catalog"]).optional(),
  defaultLanguage: z.enum(["fr", "en", "unknown"]).optional(),
  bookCoverPriority: z.enum(["primary", "secondary"]).optional(),
  coverDefaultRegion: z.enum(["fr", "en", "eu", "us", "jp", "wor"]).optional(),
  websiteUrl: z.url().optional(),
});

function validateProviderInfo(info: ProviderInfo): ProviderInfo {
  const result = providerInfoSchema.safeParse(info);
  if (result.success) return info;

  const details = result.error.issues
    .map((issue) => `${issue.path.join(".") || "(racine)"}: ${issue.message}`)
    .join("; ");
  const id = typeof info?.id === "string" && info.id ? info.id : "(id inconnu)";
  throw new Error(
    `defineProvider: manifeste invalide pour "${id}" — ${details}`,
  );
}

// ---------------------------------------------------------------------------
// Défauts du cas commun.
// ---------------------------------------------------------------------------

/**
 * Le healthCheck répété à l'identique dans ~45 providers : ping du site avec
 * latence mesurée, via `createMetadataHealthCheck`. Déclenché au `run()`,
 * jamais à l'import.
 */
function defaultHealthCheck(
  info: ProviderInfo,
  healthCheckUrl?: string,
): ProviderHealthCheck | undefined {
  const url = healthCheckUrl ?? info.websiteUrl;
  if (!url) return undefined;
  return createMetadataHealthCheck(info.id, info.label, async () => {
    const start = Date.now();
    const isUp = await pingUrl(url);
    return {
      ok: isUp,
      latency: Date.now() - start,
      error: isUp ? null : "Host unreachable",
    };
  });
}

/**
 * Le testHandler « recherche de métadonnées par titre » que tout provider de
 * recherche réécrit : `<id>-metadata`, kind `metadata`, run = la recherche.
 */
function defaultTestHandlers(
  info: ProviderInfo,
  metadataSearch: (query: string) => Promise<unknown>,
): Record<string, TestProviderHandler> {
  return {
    [`${info.id}-metadata`]: {
      label: `${info.label} - Metadata`,
      kind: "metadata",
      run: (query) => metadataSearch(query),
    },
  };
}

// ---------------------------------------------------------------------------
// Spec & factory.
// ---------------------------------------------------------------------------

/**
 * Un `ProviderModule` en devenir : `info` + hooks, plus deux commodités du cas
 * commun (`healthCheckUrl`, `metadataSearch`). Tout hook de `ProviderModule`
 * peut être posé tel quel — la factory ne fait que combler les absents.
 */
export type ProviderSpec = Omit<
  ProviderModule,
  "info" | "healthCheck" | "testHandlers"
> & {
  info: ProviderInfo;
  /** Hook complet fourni à la main — prime sur le défaut par ping. */
  healthCheck?: ProviderHealthCheck;
  /** URL pinguée par le healthCheck par défaut (fallback : `info.websiteUrl`). */
  healthCheckUrl?: string;
  /** Handlers complets — primen sur le défaut issu de `metadataSearch`. */
  testHandlers?: Record<string, TestProviderHandler>;
  /**
   * Recherche de métadonnées par titre. Génère le testHandler
   * `<id>-metadata` quand `testHandlers` n'est pas fourni.
   */
  metadataSearch?: (query: string) => Promise<unknown>;
};

/**
 * Assemble un `ProviderModule` depuis un manifeste validé + des hooks.
 *
 * La forme fonction `(ctx) => spec` injecte le contexte (`ctx.http`) — le
 * provider n'importe alors rien de `@/lib/http`. La forme objet reste
 * disponible pour les providers dont le réseau vit déjà dans `fetch.ts`.
 */
export function defineProvider(
  spec: ProviderSpec | ((ctx: ProviderContext) => ProviderSpec),
): ProviderModule {
  const resolved = typeof spec === "function" ? spec(providerContext) : spec;
  const info = validateProviderInfo(resolved.info);

  const {
    info: _info,
    healthCheck,
    healthCheckUrl,
    testHandlers,
    metadataSearch,
    ...hooks
  } = resolved;

  const module_: ProviderModule = { ...hooks, info };

  const resolvedHealthCheck =
    healthCheck ?? defaultHealthCheck(info, healthCheckUrl);
  if (resolvedHealthCheck) module_.healthCheck = resolvedHealthCheck;

  const resolvedTestHandlers =
    testHandlers ??
    (metadataSearch ? defaultTestHandlers(info, metadataSearch) : undefined);
  if (resolvedTestHandlers) module_.testHandlers = resolvedTestHandlers;

  return module_;
}
