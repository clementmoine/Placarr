/**
 * Serialize every onnxruntime-node inference on the process.
 *
 * transformers.js (DINOv2) and ppu-paddle-ocr share one native ORT build.
 * Concurrent `session.run` / session create has been observed to abort Node
 * with `malloc: pointer being freed was not allocated` — the phone then
 * loses `/assets/…` mid-carousel (iOS blue "?" on every face). One queue
 * for the whole process; cost is latency under load, never a silent kill.
 */

let chain: Promise<unknown> = Promise.resolve();

export function runServerOrtExclusive<T>(fn: () => Promise<T>): Promise<T> {
  const next = chain.then(fn, fn);
  chain = next.then(
    () => undefined,
    () => undefined,
  );
  return next;
}

export function resetServerOrtExclusiveForTests(): void {
  chain = Promise.resolve();
}
