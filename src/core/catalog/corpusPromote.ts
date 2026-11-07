/**
 * Promote a well-anchored shelf item toward a catalogue corpus line.
 * Admin confirm only — never auto-write into sqlite from this helper.
 */
import { prisma } from "@/lib/db/prisma";
import { affinityScopePackFromPrintKey } from "@/core/catalog/providerAffinity";

export type PromoteCandidateStatus = "pending" | "accepted" | "rejected";

export async function enqueueCorpusPromoteCandidate(itemId: string): Promise<{
  id: string;
  status: string;
  created: boolean;
}> {
  const item = await prisma.item.findUnique({
    where: { id: itemId },
    select: {
      id: true,
      name: true,
      barcode: true,
      printKey: true,
      shelf: { select: { dataPack: true } },
    },
  });
  if (!item) {
    throw new Error(`Item not found: ${itemId}`);
  }
  if (!item.barcode?.trim() && !item.printKey?.trim()) {
    throw new Error(
      "Promote requires a barcode or printKey identity on the shelf item",
    );
  }

  const existing = await prisma.corpusPromoteCandidate.findFirst({
    where: { itemId: item.id, status: "pending" },
    select: { id: true, status: true },
  });
  if (existing) {
    return { id: existing.id, status: existing.status, created: false };
  }

  const packFromKey = affinityScopePackFromPrintKey(item.printKey)?.replace(
    /^pack:/,
    "",
  );
  const row = await prisma.corpusPromoteCandidate.create({
    data: {
      itemId: item.id,
      dataPack: item.shelf.dataPack?.trim() || packFromKey || null,
      printKey: item.printKey?.trim() || null,
      barcode: item.barcode?.trim() || null,
      title: item.name?.trim() || null,
      status: "pending",
    },
  });
  return { id: row.id, status: row.status, created: true };
}

export async function listCorpusPromoteCandidates(input?: {
  status?: PromoteCandidateStatus;
  limit?: number;
}) {
  const status = input?.status ?? "pending";
  return prisma.corpusPromoteCandidate.findMany({
    where: { status },
    orderBy: { createdAt: "desc" },
    take: Math.min(input?.limit ?? 100, 500),
  });
}

export async function setCorpusPromoteStatus(
  id: string,
  status: Exclude<PromoteCandidateStatus, "pending">,
  note?: string | null,
) {
  return prisma.corpusPromoteCandidate.update({
    where: { id },
    data: {
      status,
      ...(note != null ? { note } : {}),
    },
  });
}
