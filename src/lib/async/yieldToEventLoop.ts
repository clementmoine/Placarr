/**
 * Let the Node event loop flush pending I/O (HTTP, timers) before continuing.
 *
 * Used inside worker slots and residual in-process pools so long synchronous
 * stretches (HTML parse, sharp setup) do not starve other queued work.
 */
export function yieldToEventLoop(): Promise<void> {
  return new Promise((resolve) => {
    setImmediate(resolve);
  });
}
