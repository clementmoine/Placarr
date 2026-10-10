export function isAbortError(error: unknown): boolean {
  if (!error) return false;
  if (error instanceof DOMException && error.name === "AbortError") return true;
  if (error instanceof Error && error.name === "AbortError") return true;
  // undici / Next when the client disconnects mid-flight
  if (error instanceof Error && error.name === "ResponseAborted") return true;
  if (
    error instanceof Error &&
    /request aborted|response aborted/i.test(error.message)
  ) {
    return true;
  }
  if (typeof error === "object" && error !== null) {
    const record = error as { code?: string; name?: string; message?: string };
    if (record.code === "ERR_CANCELED") return true;
    if (record.name === "CanceledError") return true;
    if (record.name === "ResponseAborted") return true;
    if (
      typeof record.message === "string" &&
      /request aborted|response aborted/i.test(record.message)
    ) {
      return true;
    }
  }
  return false;
}

export function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new DOMException("Metadata refresh aborted", "AbortError");
  }
}

/**
 * A single signal that aborts as soon as any of the inputs does. Returns the
 * lone signal unchanged when only one is defined, and `undefined` when none are,
 * so callers can pass it straight through to fetch/axios. Backed by the native
 * `AbortSignal.any`, which cleans up its listeners when the result is collected
 * (the previous hand-rolled version leaked a listener per still-pending source).
 */
export function mergeAbortSignals(
  ...signals: Array<AbortSignal | undefined>
): AbortSignal | undefined {
  const defined = signals.filter((signal): signal is AbortSignal =>
    Boolean(signal),
  );
  if (defined.length === 0) return undefined;
  if (defined.length === 1) return defined[0];
  return AbortSignal.any(defined);
}
