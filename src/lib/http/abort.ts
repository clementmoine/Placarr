export function isAbortError(error: unknown): boolean {
  if (!error) return false;
  if (error instanceof DOMException && error.name === "AbortError") return true;
  if (error instanceof Error && error.name === "AbortError") return true;
  if (typeof error === "object" && error !== null) {
    const record = error as { code?: string; name?: string };
    if (record.code === "ERR_CANCELED") return true;
    if (record.name === "CanceledError") return true;
  }
  return false;
}

export function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new DOMException("Metadata refresh aborted", "AbortError");
  }
}

export function mergeAbortSignals(
  ...signals: Array<AbortSignal | undefined>
): AbortSignal | undefined {
  const defined = signals.filter((signal): signal is AbortSignal => Boolean(signal));
  if (defined.length === 0) return undefined;
  if (defined.length === 1) return defined[0];

  const controller = new AbortController();
  const abort = () => controller.abort();

  for (const signal of defined) {
    if (signal.aborted) {
      abort();
      return controller.signal;
    }
    signal.addEventListener("abort", abort, { once: true });
  }

  return controller.signal;
}
