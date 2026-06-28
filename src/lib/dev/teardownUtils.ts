import type {
  TeardownBarcodeContext,
  TeardownMetadataContext,
  TeardownProviderTask,
} from "@/types/providerModule";

export function teardownProviderLabel(
  provider: string,
  type: string,
  includeType: boolean,
): string {
  return includeType ? `${provider}:${type}` : provider;
}

export function createTeardownMetadataTask(
  providerLabel: string,
  run: () => Promise<unknown>,
): TeardownProviderTask {
  return {
    providerLabel,
    phase: "metadata",
    run,
  };
}

export function createTeardownBarcodeTask(
  providerLabel: string,
  run: () => Promise<unknown>,
): TeardownProviderTask {
  return {
    providerLabel,
    phase: "barcode",
    run,
  };
}

export function metadataTeardownLabel(
  provider: string,
  ctx: TeardownMetadataContext,
): string {
  return teardownProviderLabel(provider, ctx.type, ctx.includeTypeInLabel);
}

export function dedupeTeardownQueries(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

export function shouldRunMusicBarcodeTeardown(
  ctx: TeardownBarcodeContext,
): boolean {
  return Boolean(ctx.barcode && (ctx.type === "musics" || !ctx.type));
}

export function shouldRunGameBarcodeTeardown(
  ctx: TeardownBarcodeContext,
): boolean {
  return Boolean(ctx.barcode && (ctx.type === "games" || !ctx.type));
}

export function shouldRunBookBarcodeTeardown(
  ctx: TeardownBarcodeContext,
): boolean {
  return Boolean(
    ctx.barcode &&
      (ctx.type === "books" ||
        ctx.barcode.startsWith("978") ||
        ctx.barcode.startsWith("979")),
  );
}
