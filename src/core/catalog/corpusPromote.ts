/**
 * Promote a well-anchored shelf item toward a catalogue corpus line.
 * Admin confirm only — apply writes sqlite only after accept, via the pack's
 * `catalog.applyCorpusPromote` hook (no provider-id literals in core).
 */
import { prisma } from "@/lib/db/prisma";
import { affinityScopePackFromPrintKey } from "@/core/catalog/providerAffinity";
import { discoverCatalogProviderModules } from "@/core/catalog/catalog";

export type PromoteCandidateStatus =
  | "pending"
  | "accepted"
  | "rejected"
  | "applied";

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

function catalogModuleForDataPack(dataPack: string) {
  const pack = dataPack.trim().toLowerCase();
  if (!pack) return null;
  const matches = discoverCatalogProviderModules().filter(
    (mdl) => mdl.catalog?.dataPack.trim().toLowerCase() === pack,
  );
  // Dual owners (e.g. pokemon Live + TCGdex) share dataPack — prefer the
  // module that can actually write the promote.
  return (
    matches.find((mdl) => mdl.catalog?.applyCorpusPromote) ??
    matches[0] ??
    null
  );
}

/**
 * After admin accept: write the print into the pack corpus when the module
 * exposes `applyCorpusPromote`. Idempotent when already `applied`.
 */
export async function applyAcceptedCorpusPromote(id: string): Promise<{
  id: string;
  status: string;
  appliedToCorpus: boolean;
  reason?: string;
}> {
  const candidate = await prisma.corpusPromoteCandidate.findUnique({
    where: { id },
  });
  if (!candidate) {
    throw new Error(`Promote candidate not found: ${id}`);
  }
  if (candidate.status === "applied") {
    return { id: candidate.id, status: "applied", appliedToCorpus: true };
  }
  if (candidate.status === "rejected") {
    return {
      id: candidate.id,
      status: "rejected",
      appliedToCorpus: false,
      reason: "candidate rejected",
    };
  }
  if (candidate.status !== "accepted" && candidate.status !== "pending") {
    return {
      id: candidate.id,
      status: candidate.status,
      appliedToCorpus: false,
      reason: `unexpected status ${candidate.status}`,
    };
  }

  // Fresh item identity — candidate row may be stale.
  const item = await prisma.item.findUnique({
    where: { id: candidate.itemId },
    select: {
      printKey: true,
      name: true,
      language: true,
      barcode: true,
      shelf: { select: { dataPack: true } },
    },
  });
  if (!item) {
    throw new Error(`Item not found for promote: ${candidate.itemId}`);
  }

  const printKey = (item.printKey || candidate.printKey || "").trim();
  if (!printKey) {
    return {
      id: candidate.id,
      status: candidate.status,
      appliedToCorpus: false,
      reason: "printKey required to write a corpus print",
    };
  }

  const dataPack =
    item.shelf.dataPack?.trim() || candidate.dataPack?.trim() || null;
  if (!dataPack) {
    return {
      id: candidate.id,
      status: candidate.status,
      appliedToCorpus: false,
      reason: "dataPack required (shelf.dataPack or candidate)",
    };
  }

  const mdl = catalogModuleForDataPack(dataPack);
  const apply = mdl?.catalog?.applyCorpusPromote;
  if (!apply) {
    return {
      id: candidate.id,
      status: candidate.status,
      appliedToCorpus: false,
      reason: `pack ${dataPack} has no applyCorpusPromote hook`,
    };
  }

  const result = await apply({
    printKey,
    title: item.name?.trim() || candidate.title,
    language: item.language,
    barcode: item.barcode?.trim() || candidate.barcode,
  });

  if (!result.written) {
    await prisma.corpusPromoteCandidate.update({
      where: { id: candidate.id },
      data: {
        status: "accepted",
        note: result.reason,
        printKey,
        dataPack,
        title: item.name?.trim() || candidate.title,
      },
    });
    return {
      id: candidate.id,
      status: "accepted",
      appliedToCorpus: false,
      reason: result.reason,
    };
  }

  const row = await prisma.corpusPromoteCandidate.update({
    where: { id: candidate.id },
    data: {
      status: "applied",
      printKey: result.printKey,
      dataPack,
      title: item.name?.trim() || candidate.title,
      note: null,
    },
  });

  return {
    id: row.id,
    status: row.status,
    appliedToCorpus: true,
  };
}

/**
 * Accept or reject. Accept also attempts corpus apply when the pack supports it.
 */
export async function decideCorpusPromoteCandidate(
  id: string,
  status: "accepted" | "rejected",
  note?: string | null,
): Promise<{
  id: string;
  status: string;
  appliedToCorpus: boolean;
  reason?: string;
}> {
  if (status === "rejected") {
    const row = await setCorpusPromoteStatus(id, "rejected", note);
    return { id: row.id, status: row.status, appliedToCorpus: false };
  }

  await setCorpusPromoteStatus(id, "accepted", note);
  return applyAcceptedCorpusPromote(id);
}
