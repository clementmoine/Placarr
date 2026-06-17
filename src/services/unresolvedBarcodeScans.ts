import { prisma } from "@/lib/prisma";

type UnresolvedBarcodeProduct = {
  name?: string | null;
  isAlias?: boolean;
  region?: string | null;
};

export type UnresolvedBarcodeSource = {
  providerName: string;
  products?: UnresolvedBarcodeProduct[];
};

export type UnresolvedBarcodeScanView = {
  id: number;
  barcode: string;
  shelfType: string;
  reason: string;
  status: string;
  seenCount: number;
  providers: string[];
  rawNames: string[];
  rawPayload: Array<{
    providerName: string;
    name: string;
    isAlias?: boolean;
    region?: string | null;
  }>;
  firstSeenAt: string;
  lastSeenAt: string;
};

function parseJsonArray<T>(value?: string | null): T[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function safeStringify(value: unknown, maxLength = 24000): string {
  const serialized = JSON.stringify(value);
  return serialized.length > maxLength
    ? serialized.slice(0, maxLength)
    : serialized;
}

function compactSources(sources: UnresolvedBarcodeSource[]) {
  const entries = sources.flatMap((source) =>
    (source.products || [])
      .map((product) => ({
        providerName: source.providerName,
        name: (product.name || "").trim(),
        isAlias: product.isAlias || undefined,
        region: product.region || undefined,
      }))
      .filter((entry) => entry.name.length > 0),
  );

  const providers = Array.from(
    new Set(entries.map((entry) => entry.providerName)),
  );
  const rawNames = Array.from(new Set(entries.map((entry) => entry.name))).slice(
    0,
    60,
  );
  const rawPayload = entries.slice(0, 120);

  return { providers, rawNames, rawPayload };
}

export async function recordUnresolvedBarcodeScan({
  barcode,
  shelfType,
  reason,
  sources,
}: {
  barcode: string;
  shelfType?: string | null;
  reason: string;
  sources: UnresolvedBarcodeSource[];
}) {
  const cleanBarcode = barcode.replace(/[^\d]/g, "").trim();
  if (!cleanBarcode) return;

  const normalizedShelfType = shelfType || "unknown";
  const { providers, rawNames, rawPayload } = compactSources(sources);

  try {
    await prisma.unresolvedBarcodeScan.upsert({
      where: {
        barcode_shelfType_reason: {
          barcode: cleanBarcode,
          shelfType: normalizedShelfType,
          reason,
        },
      },
      create: {
        barcode: cleanBarcode,
        shelfType: normalizedShelfType,
        reason,
        providers: safeStringify(providers),
        rawNames: safeStringify(rawNames),
        rawPayload: safeStringify(rawPayload),
      },
      update: {
        seenCount: { increment: 1 },
        providers: safeStringify(providers),
        rawNames: safeStringify(rawNames),
        rawPayload: safeStringify(rawPayload),
      },
    });
  } catch (error) {
    console.error("[UnresolvedBarcodeScan] Failed to record scan:", error);
  }
}

export async function markUnresolvedBarcodeScanResolved({
  barcode,
  shelfType,
}: {
  barcode: string;
  shelfType?: string | null;
}) {
  const cleanBarcode = barcode.replace(/[^\d]/g, "").trim();
  if (!cleanBarcode) return;

  try {
    await prisma.unresolvedBarcodeScan.updateMany({
      where: {
        barcode: cleanBarcode,
        status: "open",
        ...(shelfType ? { shelfType } : {}),
      },
      data: {
        status: "resolved",
      },
    });
  } catch (error) {
    console.error(
      "[UnresolvedBarcodeScan] Failed to mark scan as resolved:",
      error,
    );
  }
}

export function formatUnresolvedBarcodeScan(scan: {
  id: number;
  barcode: string;
  shelfType: string;
  reason: string;
  status: string;
  seenCount: number;
  providers?: string | null;
  rawNames?: string | null;
  rawPayload?: string | null;
  firstSeenAt: Date;
  lastSeenAt: Date;
}): UnresolvedBarcodeScanView {
  return {
    id: scan.id,
    barcode: scan.barcode,
    shelfType: scan.shelfType,
    reason: scan.reason,
    status: scan.status,
    seenCount: scan.seenCount,
    providers: parseJsonArray<string>(scan.providers),
    rawNames: parseJsonArray<string>(scan.rawNames),
    rawPayload: parseJsonArray<UnresolvedBarcodeScanView["rawPayload"][number]>(
      scan.rawPayload,
    ),
    firstSeenAt: scan.firstSeenAt.toISOString(),
    lastSeenAt: scan.lastSeenAt.toISOString(),
  };
}
