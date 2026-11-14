/**
 * Lazy-register TCG effect packs. Eager `import "@/effects"` pulls every pack
 * into the shelf bundle; shelves only need packs when a foil finish resolves.
 */
let ready = false;
let pending: Promise<void> | null = null;
const listeners = new Set<() => void>();

export function effectsRegistered(): boolean {
  return ready;
}

/** Called from `effects/index` when packs are imported (eager or lazy). */
export function markEffectsRegistered(): void {
  if (ready) return;
  ready = true;
  for (const listener of listeners) listener();
}

export function subscribeEffectsReady(onStoreChange: () => void): () => void {
  listeners.add(onStoreChange);
  return () => {
    listeners.delete(onStoreChange);
  };
}

export function ensureEffects(): Promise<void> {
  if (ready) return Promise.resolve();
  if (!pending) {
    pending = import("@/effects").then(() => undefined);
  }
  return pending;
}
