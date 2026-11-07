const held = new Set<string>();
/** Ids waiting for a slot, FIFO — woken when someone releases. */
const waiting: string[] = [];
const waitListeners = new Set<() => void>();

let maxSlots = 10;

function notifyWaiters(): void {
  for (const listener of waitListeners) listener();
}

/**
 * Subscribe to pool releases. FoilCardImage uses this to retry acquire after
 * a failed attempt — without it, a card that lost the race stays on CSS even
 * after a neighbour scrolls away and frees a slot.
 */
export function subscribeFoilPool(listener: () => void): () => void {
  waitListeners.add(listener);
  return () => {
    waitListeners.delete(listener);
  };
}

export function acquireFoilSlot(id: string): boolean {
  if (held.has(id)) return true;
  if (held.size >= maxSlots) {
    if (!waiting.includes(id)) waiting.push(id);
    return false;
  }
  // Drop from the wait queue if we got in.
  const waitIndex = waiting.indexOf(id);
  if (waitIndex >= 0) waiting.splice(waitIndex, 1);
  held.add(id);
  return true;
}

export function releaseFoilSlot(id: string): void {
  const wasHeld = held.delete(id);
  const waitIndex = waiting.indexOf(id);
  if (waitIndex >= 0) waiting.splice(waitIndex, 1);
  if (!wasHeld) return;
  // FIFO: the oldest waiter inherits the freed slot so a soft-failed tile
  // (or a newly visible one) is not starved by a notify race.
  const next = waiting.shift();
  if (next) held.add(next);
  notifyWaiters();
}

export function hasFoilSlot(id: string): boolean {
  return held.has(id);
}

export function foilPoolSize(): number {
  return held.size;
}

export function foilPoolWaiting(): number {
  return waiting.length;
}

export function setFoilPoolMax(n: number): void {
  maxSlots = Math.max(1, n);
  notifyWaiters();
}

/**
 * Drop every holder / waiter. Used when the playroom switches to single-card
 * focus so a leftover grid slot cannot starve the only mounted canvas.
 */
export function clearFoilPool(): void {
  held.clear();
  waiting.length = 0;
  notifyWaiters();
}

export function resetFoilPoolForTests(): void {
  held.clear();
  waiting.length = 0;
  maxSlots = 10;
}
