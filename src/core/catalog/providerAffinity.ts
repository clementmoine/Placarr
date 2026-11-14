/**
 * Provider affinity memory — learn catalogue-scoped successes from shelf wins.
 *
 * One successful price/cover/face on an item generalizes to the **catalogue**
 * scope (`type:…` / `pack:…`), not the item id. Memory is for admin + soft
 * call ordering under concurrency — never a consensus gate: every capable
 * provider still runs; merge / trim stays multi-source and agnostic.
 */
import { providerIdForSourceToken } from "@/core/catalog/catalog";
import { prisma } from "@/lib/db/prisma";

export const PROVIDER_AFFINITY_CAPABILITIES = [
  "price",
  "cover",
  "faces",
  "identify",
  "catalogRefresh",
] as const;

export type ProviderAffinityCapability =
  (typeof PROVIDER_AFFINITY_CAPABILITIES)[number];

export function affinityScopeType(shelfType: string): string {
  return `type:${shelfType.trim().toLowerCase() || "unknown"}`;
}

/** Game / pack prefix from a printKey (`lorcana:9-1` → `pack:lorcana`). */
export function affinityScopePackFromPrintKey(
  printKey: string | null | undefined,
): string | null {
  const raw = printKey?.trim();
  if (!raw) return null;
  const colon = raw.indexOf(":");
  if (colon <= 0) return null;
  const pack = raw.slice(0, colon).trim().toLowerCase();
  return pack ? `pack:${pack}` : null;
}

export function affinityScopePack(dataPack: string): string {
  return `pack:${dataPack.trim().toLowerCase()}`;
}

export type RecordAffinitySuccessInput = {
  scopeKey: string;
  capability: ProviderAffinityCapability;
  providerId: string;
  /** 0–1; defaults bump toward 1 with repeats. */
  confidence?: number;
};

/**
 * Upsert a catalogue-scoped success. Fire-and-forget safe — never throws to
 * callers (affinity must not break price persist).
 */
export async function recordAffinitySuccess(
  input: RecordAffinitySuccessInput,
): Promise<void> {
  const scopeKey = input.scopeKey.trim();
  const providerId = input.providerId.trim();
  if (!scopeKey || !providerId) return;
  const confidence = Math.min(
    1,
    Math.max(0.1, input.confidence ?? 0.6),
  );
  try {
    await prisma.providerAffinity.upsert({
      where: {
        scopeKey_capability_providerId: {
          scopeKey,
          capability: input.capability,
          providerId,
        },
      },
      create: {
        scopeKey,
        capability: input.capability,
        providerId,
        successCount: 1,
        confidence,
        lastAt: new Date(),
      },
      update: {
        successCount: { increment: 1 },
        confidence: confidence,
        lastAt: new Date(),
      },
    });
  } catch (error) {
    console.warn("[providerAffinity] record failed", error);
  }
}

/** Record price wins for shelf type (+ optional pack from printKey). */
export async function recordPriceAffinityFromOffers(input: {
  shelfType: string;
  printKey?: string | null;
  providerIds: readonly string[];
}): Promise<void> {
  // Offers carry display/source tokens (`pkmcards`); affinity keys are module ids.
  const ids = [
    ...new Set(
      input.providerIds
        .map((id) => providerIdForSourceToken(id.trim()))
        .filter(Boolean),
    ),
  ];
  if (ids.length === 0) return;
  const scopes = [
    affinityScopeType(input.shelfType),
    affinityScopePackFromPrintKey(input.printKey),
  ].filter((s): s is string => Boolean(s));
  await Promise.all(
    scopes.flatMap((scopeKey) =>
      ids.map((providerId) =>
        recordAffinitySuccess({
          scopeKey,
          capability: "price",
          providerId,
          confidence: 0.7,
        }),
      ),
    ),
  );
}

export type AffinityRow = {
  providerId: string;
  successCount: number;
  confidence: number;
  lastAt: Date;
};

export async function listAffinities(input: {
  scopeKeys: readonly string[];
  capability: ProviderAffinityCapability;
}): Promise<AffinityRow[]> {
  const scopeKeys = [...new Set(input.scopeKeys.filter(Boolean))];
  if (scopeKeys.length === 0) return [];
  try {
    const rows = await prisma.providerAffinity.findMany({
      where: {
        scopeKey: { in: scopeKeys },
        capability: input.capability,
      },
      select: {
        providerId: true,
        successCount: true,
        confidence: true,
        lastAt: true,
      },
      orderBy: [{ successCount: "desc" }, { lastAt: "desc" }],
    });
    // Merge same provider across scopes (pack + type) — keep max success.
    const byId = new Map<string, AffinityRow>();
    for (const row of rows) {
      const prev = byId.get(row.providerId);
      if (!prev || row.successCount > prev.successCount) {
        byId.set(row.providerId, row);
      }
    }
    return [...byId.values()].sort(
      (a, b) =>
        b.successCount - a.successCount ||
        b.lastAt.getTime() - a.lastAt.getTime(),
    );
  } catch (error) {
    // Table may not exist until migrate — treat as empty memory.
    const code =
      error && typeof error === "object" && "code" in error
        ? String((error as { code?: unknown }).code)
        : "";
    if (code !== "P2021") {
      console.warn("[providerAffinity] list failed", error);
    }
    return [];
  }
}

/**
 * Stable reorder: affine providers first (by successCount), then the rest
 * in original order. Scheduling hint only — callers must still invoke every
 * capable provider; never use this to drop sources from consensus.
 */
export function orderByAffinity<T>(
  items: readonly T[],
  providerIdOf: (item: T) => string,
  affinities: readonly AffinityRow[],
): T[] {
  if (affinities.length === 0 || items.length <= 1) return [...items];
  const rank = new Map(
    affinities.map((row, index) => [row.providerId, index]),
  );
  return [...items].sort((a, b) => {
    const aRank = rank.get(providerIdOf(a));
    const bRank = rank.get(providerIdOf(b));
    if (aRank == null && bRank == null) return 0;
    if (aRank == null) return 1;
    if (bRank == null) return -1;
    return aRank - bRank;
  });
}
