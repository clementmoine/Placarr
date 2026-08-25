/**
 * Normalize admin / job payload fields into ProviderCatalogRefreshOpts slices.
 */
import type { ProviderCatalogRefreshOpts } from "@/types/providerModule";

function stringList(value: unknown): string[] | undefined {
  if (Array.isArray(value)) {
    const out = value
      .filter((entry): entry is string => typeof entry === "string")
      .map((entry) => entry.trim())
      .filter(Boolean);
    return out.length ? out : undefined;
  }
  if (typeof value === "string") {
    const out = value
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean);
    return out.length ? out : undefined;
  }
  return undefined;
}

function positiveInt(value: unknown): number | undefined {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || n <= 0) return undefined;
  return Math.floor(n);
}

/** Pick refresh granularity from a loose JSON body / job payload. */
export function catalogRefreshOptsFromPayload(
  body: Record<string, unknown> | null | undefined,
): ProviderCatalogRefreshOpts {
  const only = stringList(body?.only);
  const skip = stringList(body?.skip);
  const langs = stringList(body?.langs);
  const limit = positiveInt(body?.limit);
  return {
    auto: Boolean(body?.auto),
    ...(only ? { only } : {}),
    ...(skip ? { skip } : {}),
    ...(langs ? { langs } : {}),
    ...(limit != null ? { limit } : {}),
  };
}
