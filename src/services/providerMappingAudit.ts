import { getMetadataProviderAdapter } from "@/services/metadataResolvers";
import {
  getProviderModule,
  isProviderConfigured,
  PROVIDERS,
  type ProviderInfo,
} from "@/services/providerRegistry";
import { METADATA_OBSERVATION_SCHEMA_VERSION } from "@/lib/metadataObservations";
import {
  inferMappingProbeStatus,
  mergeMappingProbeSamples,
  metadataProbe,
  retry,
} from "@/lib/mappingProbeUtils";
import type { MetadataResult } from "@/types/metadataProvider";

import type {
  MappingProbeResult,
  MappingProbeStatus,
  MetadataAdapterContext,
} from "@/types/providerModule";

export type { MappingProbeStatus } from "@/types/providerModule";

export type ProviderObservationMode =
  | "enabled"
  | "migrating"
  | "legacy"
  | "unknown";

export interface ProviderMappingProbeEntry {
  providerId: string;
  label: string;
  status: MappingProbeStatus;
  sampleInput: string;
  mappedKeys: string[];
  unusedKeys: string[];
  attachmentsCount: number;
  factsCount: number;
  reason: string | null;
  example: string | null;
  observationMode: ProviderObservationMode;
  observationSchemaVersion: string | null;
  observationCount: number;
  observationKinds: string[];
  observationModeReason: string | null;
  hasMetadataAdapter: boolean;
  hasCustomProbe: boolean;
}

export interface ProviderMigrationPlanEntry {
  providerId: string;
  label: string;
  observationMode: ProviderObservationMode;
  status: MappingProbeStatus;
  observationModeReason: string | null;
  reason: string | null;
}

export interface ProviderMigrationPlan {
  next: ProviderMigrationPlanEntry[];
  legacy: ProviderMigrationPlanEntry[];
  unknown: ProviderMigrationPlanEntry[];
  outOfScope: ProviderMigrationPlanEntry[];
}

export interface ProviderMappingAuditPayload {
  generatedAt: string;
  probes: ProviderMappingProbeEntry[];
  migrationPlan: ProviderMigrationPlan;
}

interface ProbeExecution {
  probe: MappingProbeResult | null;
  metadata: MetadataResult | null;
}

interface ObservationSnapshot {
  mode: ProviderObservationMode;
  schemaVersion: string | null;
  count: number;
  kinds: string[];
}

const STATUS_PRIORITY: MappingProbeStatus[] = [
  "ok",
  "partial",
  "empty",
  "blocked",
  "error",
];

function statusRank(status: MappingProbeStatus): number {
  const index = STATUS_PRIORITY.indexOf(status);
  return index === -1 ? STATUS_PRIORITY.length : index;
}

function observationModeReason(
  observation: ObservationSnapshot,
  status: MappingProbeStatus,
  hasMetadataAdapter: boolean,
  hasCustomProbe: boolean,
): string | null {
  if (observation.mode === "enabled") return null;

  if (observation.mode === "migrating") {
    return observation.schemaVersion
      ? `schema version ${observation.schemaVersion} differs from ${METADATA_OBSERVATION_SCHEMA_VERSION}`
      : `observations present but schema version is missing`;
  }

  if (observation.mode === "legacy") {
    return hasMetadataAdapter
      ? "metadata adapter returns legacy fields only (no observations yet)"
      : "legacy output from non-metadata adapter provider";
  }

  if (!hasMetadataAdapter) {
    return hasCustomProbe
      ? "custom mapping probe only (no metadata adapter output)"
      : "no metadata adapter available";
  }

  if (status === "blocked") {
    return "metadata adapter blocked by credentials or configuration";
  }
  if (status === "error") {
    return "metadata adapter probe failed";
  }
  if (status === "empty") {
    return "metadata adapter probe returned no data for sample input";
  }
  return "observation mode could not be determined from probe output";
}

function toMigrationPlanEntry(
  probe: ProviderMappingProbeEntry,
): ProviderMigrationPlanEntry {
  return {
    providerId: probe.providerId,
    label: probe.label,
    observationMode: probe.observationMode,
    status: probe.status,
    observationModeReason: probe.observationModeReason,
    reason: probe.reason,
  };
}

function sortMigrationEntries(
  entries: ProviderMigrationPlanEntry[],
): ProviderMigrationPlanEntry[] {
  return entries.slice().sort((a, b) => {
    const statusDiff = statusRank(a.status) - statusRank(b.status);
    if (statusDiff !== 0) return statusDiff;
    return a.providerId.localeCompare(b.providerId, "en");
  });
}

function buildProviderMigrationPlan(
  probes: ProviderMappingProbeEntry[],
): ProviderMigrationPlan {
  const legacy = sortMigrationEntries(
    probes
      .filter(
        (probe) =>
          probe.observationMode === "legacy" && probe.hasMetadataAdapter,
      )
      .map(toMigrationPlanEntry),
  );
  const unknown = sortMigrationEntries(
    probes
      .filter(
        (probe) =>
          probe.observationMode === "unknown" && probe.hasMetadataAdapter,
      )
      .map(toMigrationPlanEntry),
  );
  const outOfScope = sortMigrationEntries(
    probes
      .filter((probe) => probe.observationMode === "unknown" && !probe.hasMetadataAdapter)
      .map(toMigrationPlanEntry),
  );

  return {
    legacy,
    unknown,
    outOfScope,
    next: [...legacy, ...unknown],
  };
}

function buildObservationSnapshot(
  metadata: MetadataResult | null,
): ObservationSnapshot {
  if (!metadata) {
    return {
      mode: "unknown",
      schemaVersion: null,
      count: 0,
      kinds: [],
    };
  }

  const observations = metadata.observations || [];
  const schemaVersion = metadata.observationSchemaVersion || null;
  const kinds = Array.from(
    new Set(observations.map((observation) => observation.kind)),
  ).sort((a, b) => a.localeCompare(b, "en"));

  if (observations.length === 0) {
    return {
      mode: "legacy",
      schemaVersion,
      count: 0,
      kinds,
    };
  }

  return {
    mode:
      schemaVersion === METADATA_OBSERVATION_SCHEMA_VERSION
        ? "enabled"
        : "migrating",
    schemaVersion,
    count: observations.length,
    kinds,
  };
}

async function runMetadataAdapterProbe(
  providerId: string,
  contextOverride?: MetadataAdapterContext,
): Promise<ProbeExecution> {
  const module = getProviderModule(providerId);
  const adapter = getMetadataProviderAdapter(providerId);
  const ctx = contextOverride ?? module?.mappingProbe?.context;
  if (!adapter || !ctx) return { probe: null, metadata: null };

  const resolve = (context: typeof ctx) => adapter.resolve(context);
  const shouldRetry =
    providerId === "googlebooks" ||
    providerId === "boardgamegeek" ||
    providerId === "openlibrary" ||
    providerId === "screenscraper";

  const resolveWithPolicy = (context: typeof ctx) =>
    shouldRetry ? retry(() => resolve(context), 2) : resolve(context);

  let metadata = await resolveWithPolicy(ctx);
  if (!metadata && ctx.barcode && ctx.name.trim()) {
    metadata = await resolveWithPolicy({
      ...ctx,
      barcode: null,
    });
  }

  return {
    probe: metadataProbe(metadata),
    metadata,
  };
}

async function runProbe(
  providerId: string,
  contextOverride?: MetadataAdapterContext,
): Promise<ProbeExecution> {
  const module = getProviderModule(providerId);
  const hasAdapter = !!getMetadataProviderAdapter(providerId);
  if (module?.runMappingProbe) {
    const customProbe = await module.runMappingProbe();
    if (hasAdapter) {
      const adapterExecution = await runMetadataAdapterProbe(
        providerId,
        contextOverride,
      );
      return {
        probe: customProbe ?? adapterExecution.probe,
        metadata: adapterExecution.metadata,
      };
    }
    return {
      probe: customProbe,
      metadata: null,
    };
  }
  if (hasAdapter) {
    return runMetadataAdapterProbe(providerId, contextOverride);
  }
  return { probe: null, metadata: null };
}

export async function runProviderMappingAudit(): Promise<ProviderMappingAuditPayload> {
  const probes = await Promise.all(
    PROVIDERS.map(async (provider): Promise<ProviderMappingProbeEntry> => {
      const module = getProviderModule(provider.id);
      const sampleInput = module?.mappingProbe?.sampleInput || provider.id;
      const hasCustomProbe = !!module?.runMappingProbe;
      const hasMetadataAdapter = !!getMetadataProviderAdapter(provider.id);

      if (
        provider.id === "googlebooks" &&
        !process.env.GOOGLE_BOOKS_API_KEY?.trim()
      ) {
        return blockedEntry(
          provider,
          sampleInput,
          "GOOGLE_BOOKS_API_KEY missing — free key via Google Cloud Console (Books API)",
          hasMetadataAdapter,
          hasCustomProbe,
        );
      }

      if (
        provider.id === "boardgamegeek" &&
        !process.env.BGG_API_TOKEN?.trim()
      ) {
        return blockedEntry(
          provider,
          sampleInput,
          "BGG_API_TOKEN missing — add it to .env (Bearer token from boardgamegeek.com/using_the_xml_api)",
          hasMetadataAdapter,
          hasCustomProbe,
        );
      }

      if (provider.auth.kind === "key" && !isProviderConfigured(provider)) {
        return blockedEntry(
          provider,
          sampleInput,
          `Missing env: ${provider.auth.env.join(", ")}`,
          hasMetadataAdapter,
          hasCustomProbe,
        );
      }

      try {
        // Probe the primary sample plus any opt-in additional samples, then
        // union their raw + mapped keys so per-product field gaps don't hide
        // unexploited keys (see mergeMappingProbeSamples).
        const sampleContexts: Array<MetadataAdapterContext | undefined> = [
          module?.mappingProbe?.context,
          ...(module?.mappingProbe?.additionalSamples ?? []).map(
            (sample) => sample.context,
          ),
        ];
        if (sampleContexts.length === 0) sampleContexts.push(undefined);

        const sampleResults = await Promise.all(
          sampleContexts.map(async (context) => {
            const execution = await runProbe(provider.id, context);
            const rawKeys = module?.collectMappingRawKeys
              ? await module.collectMappingRawKeys(context)
              : [];
            return { ...execution, rawKeys };
          }),
        );

        const mergedResult = mergeMappingProbeSamples(
          sampleResults.map(({ probe, rawKeys }) => ({ probe, rawKeys })),
        );
        const metadata =
          sampleResults.find((result) => result.metadata)?.metadata ?? null;
        const status = inferMappingProbeStatus(mergedResult);
        const observation = buildObservationSnapshot(metadata);
        const observationReason = observationModeReason(
          observation,
          status,
          hasMetadataAdapter,
          hasCustomProbe,
        );

        return {
          providerId: provider.id,
          label: provider.label,
          status,
          sampleInput,
          mappedKeys: mergedResult?.mappedKeys || [],
          unusedKeys: mergedResult?.unusedKeys || [],
          attachmentsCount: mergedResult?.attachmentsCount || 0,
          factsCount: mergedResult?.factsCount || 0,
          reason:
            mergedResult?.reason ||
            (status === "empty" ? "No data for sample query" : null),
          example: mergedResult?.example || null,
          observationMode: observation.mode,
          observationSchemaVersion: observation.schemaVersion,
          observationCount: observation.count,
          observationKinds: observation.kinds,
          observationModeReason: observationReason,
          hasMetadataAdapter,
          hasCustomProbe,
        };
      } catch (error) {
        const observation = buildObservationSnapshot(null);
        const observationReason = observationModeReason(
          observation,
          "error",
          hasMetadataAdapter,
          hasCustomProbe,
        );
        return {
          providerId: provider.id,
          label: provider.label,
          status: "error",
          sampleInput,
          mappedKeys: [],
          unusedKeys: [],
          attachmentsCount: 0,
          factsCount: 0,
          reason: error instanceof Error ? error.message : String(error),
          example: null,
          observationMode: "unknown",
          observationSchemaVersion: null,
          observationCount: 0,
          observationKinds: [],
          observationModeReason: observationReason,
          hasMetadataAdapter,
          hasCustomProbe,
        };
      }
    }),
  );

  return {
    generatedAt: new Date().toISOString(),
    probes,
    migrationPlan: buildProviderMigrationPlan(probes),
  };
}

function blockedEntry(
  provider: ProviderInfo,
  sampleInput: string,
  reason: string,
  hasMetadataAdapter: boolean,
  hasCustomProbe: boolean,
): ProviderMappingProbeEntry {
  const observation = buildObservationSnapshot(null);
  const observationReason = observationModeReason(
    observation,
    "blocked",
    hasMetadataAdapter,
    hasCustomProbe,
  );
  return {
    providerId: provider.id,
    label: provider.label,
    status: "blocked",
    sampleInput,
    mappedKeys: [],
    unusedKeys: [],
    attachmentsCount: 0,
    factsCount: 0,
    reason,
    example: null,
    observationMode: "unknown",
    observationSchemaVersion: null,
    observationCount: 0,
    observationKinds: [],
    observationModeReason: observationReason,
    hasMetadataAdapter,
    hasCustomProbe,
  };
}
