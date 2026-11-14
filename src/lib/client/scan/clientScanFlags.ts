/**
 * Full-client scan stack is always on.
 * Server identify is only an automatic fallback when WASM/WebGPU/models fail.
 */

export function isClientOcrEnabled(): boolean {
  return true;
}

export function isClientEmbedEnabled(): boolean {
  return true;
}

export function isClientScanStackEnabled(): boolean {
  return true;
}

/** Prefer client identify; server only as fallback=1. */
export function preferClientIdentify(): boolean {
  return true;
}
