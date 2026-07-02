import { prisma } from "@/lib/db/prisma";
import { isAbortError, throwIfAborted } from "@/lib/http/abort";

export type ItemMetadataRefreshSession = {
  generation: number;
  startedAt: Date;
  signal: AbortSignal;
};

type ActiveRefreshSession = ItemMetadataRefreshSession & {
  controller: AbortController;
};

const activeSessions = new Map<string, ActiveRefreshSession>();

export async function beginItemMetadataRefresh(
  itemId: string,
): Promise<ItemMetadataRefreshSession> {
  const previous = activeSessions.get(itemId);
  if (previous) {
    previous.controller.abort();
    activeSessions.delete(itemId);
  }

  const startedAt = new Date();
  const updated = await prisma.item.update({
    where: { id: itemId },
    data: {
      metadataRefreshStartedAt: startedAt,
      metadataRefreshGeneration: { increment: 1 },
    },
    select: { metadataRefreshGeneration: true },
  });

  const controller = new AbortController();
  const session: ActiveRefreshSession = {
    generation: updated.metadataRefreshGeneration,
    startedAt,
    signal: controller.signal,
    controller,
  };
  activeSessions.set(itemId, session);

  return {
    generation: session.generation,
    startedAt: session.startedAt,
    signal: session.signal,
  };
}

export async function isItemMetadataRefreshCurrent(
  itemId: string,
  generation: number,
): Promise<boolean> {
  const item = await prisma.item.findUnique({
    where: { id: itemId },
    select: { metadataRefreshGeneration: true },
  });
  return item?.metadataRefreshGeneration === generation;
}

export async function finishItemMetadataRefresh(
  itemId: string,
  generation: number,
): Promise<void> {
  const active = activeSessions.get(itemId);
  if (active?.generation === generation) {
    activeSessions.delete(itemId);
  }

  await prisma.item.updateMany({
    where: { id: itemId, metadataRefreshGeneration: generation },
    data: { metadataRefreshStartedAt: null },
  });
}

export async function assertRefreshCanPersist(
  itemId: string,
  session: Pick<ItemMetadataRefreshSession, "generation" | "signal">,
): Promise<boolean> {
  throwIfAborted(session.signal);
  return isItemMetadataRefreshCurrent(itemId, session.generation);
}

export function cancelItemMetadataRefresh(itemId: string): void {
  const active = activeSessions.get(itemId);
  if (!active) return;
  active.controller.abort();
  activeSessions.delete(itemId);
}

export function getInMemoryMetadataRefreshItemIds(): string[] {
  return [...activeSessions.keys()];
}

export async function cancelAndClearItemMetadataRefresh(
  itemId: string,
): Promise<void> {
  cancelItemMetadataRefresh(itemId);
  await prisma.item.updateMany({
    where: { id: itemId },
    data: { metadataRefreshStartedAt: null },
  });
}

export async function cancelAllMetadataRefreshesForItems(
  itemIds: string[],
): Promise<number> {
  let cancelled = 0;
  for (const itemId of itemIds) {
    const hadSession = activeSessions.has(itemId);
    await cancelAndClearItemMetadataRefresh(itemId);
    if (hadSession) cancelled++;
  }
  return cancelled;
}

export function resetMetadataRefreshSessionsForTests(): void {
  for (const session of activeSessions.values()) {
    session.controller.abort();
  }
  activeSessions.clear();
}

export { isAbortError };
