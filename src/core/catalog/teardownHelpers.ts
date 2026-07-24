import type {
  BarcodeLookupDeps,
  BarcodeLookupType,
  TeardownBarcodeContext,
  TeardownMetadataContext,
  TeardownProviderTask,
} from "@/types/providerModule";

import {
  createTeardownBarcodeTask,
  createTeardownMetadataTask,
  metadataTeardownLabel,
} from "@/lib/dev/teardownUtils";

export function teardownBarcodeWhen(
  ctx: TeardownBarcodeContext,
  label: string,
  run: () => Promise<unknown>,
  options: {
    requiresBarcode?: boolean;
    types?: Array<string | null>;
  } = {},
): TeardownProviderTask[] {
  const { requiresBarcode = true, types } = options;
  if (requiresBarcode && !ctx.barcode) return [];
  if (types && ctx.type && !types.includes(ctx.type)) return [];
  if (types && !ctx.type && !types.includes(null)) return [];
  return [createTeardownBarcodeTask(label, run)];
}

export function teardownMetadataWhen(
  ctx: TeardownMetadataContext,
  provider: string,
  run: () => Promise<unknown>,
  type: string,
  extra?: { platformPattern?: RegExp },
): TeardownProviderTask[] {
  if (ctx.type !== type) return [];
  if (
    extra?.platformPattern &&
    (!ctx.platform || !extra.platformPattern.test(ctx.platform))
  ) {
    return [];
  }
  return [
    createTeardownMetadataTask(metadataTeardownLabel(provider, ctx), run),
  ];
}

export function barcodeTasksForTeardownType(
  ctx: TeardownBarcodeContext,
  deps: BarcodeLookupDeps,
  label: string,
  type: BarcodeLookupType,
  build: ProviderModuleLike["buildBarcodeTasks"],
): TeardownProviderTask[] {
  if (!ctx.barcode || !build) return [];
  if (ctx.type && ctx.type !== type && type !== "generic") return [];
  if (!ctx.type && type === "generic") return [];
  const tasks = build(deps, type, { barcode: ctx.barcode });
  if (Object.keys(tasks).length === 0) return [];
  return [createTeardownBarcodeTask(label, () => Object.values(tasks)[0])];
}

type ProviderModuleLike = {
  buildBarcodeTasks?: (
    deps: BarcodeLookupDeps,
    type: BarcodeLookupType,
    context: { barcode: string },
  ) => Record<string, Promise<unknown>>;
};
