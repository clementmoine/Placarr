import { NextRequest, NextResponse } from "next/server";

import { requireAdmin } from "@/lib/auth";
import { consumeRateLimit } from "@/lib/http/rateLimit";
import {
  enqueueCorpusPromoteCandidate,
  listCorpusPromoteCandidates,
  setCorpusPromoteStatus,
} from "@/core/catalog/corpusPromote";

export const maxDuration = 30;

/** List pending (or filtered) promote candidates. */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  const statusRaw = req.nextUrl.searchParams.get("status")?.trim();
  const status =
    statusRaw === "accepted" ||
    statusRaw === "rejected" ||
    statusRaw === "pending"
      ? statusRaw
      : "pending";

  const rows = await listCorpusPromoteCandidates({ status });
  return NextResponse.json({
    ok: true,
    count: rows.length,
    candidates: rows.map((row) => ({
      id: row.id,
      itemId: row.itemId,
      dataPack: row.dataPack,
      printKey: row.printKey,
      barcode: row.barcode,
      title: row.title,
      status: row.status,
      note: row.note,
      createdAt: row.createdAt.toISOString(),
    })),
  });
}

/**
 * Enqueue a shelf item for corpus promotion, or accept/reject a candidate.
 * Body: `{ itemId }` | `{ id, status: "accepted"|"rejected", note? }`
 */
export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  const throttle = consumeRateLimit(`corpus-promote:${auth.user.id}`, {
    limit: 30,
    windowMs: 60_000,
  });
  if (!throttle.allowed) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const body = (await req.json()) as {
    itemId?: string;
    id?: string;
    status?: string;
    note?: string;
  };

  if (body.id && (body.status === "accepted" || body.status === "rejected")) {
    const row = await setCorpusPromoteStatus(
      body.id.trim(),
      body.status,
      body.note?.trim() || null,
    );
    return NextResponse.json({
      ok: true,
      id: row.id,
      status: row.status,
      // Accepted = queued for human/corpus write — sqlite apply is a later step.
      appliedToCorpus: false,
    });
  }

  const itemId = String(body.itemId || "").trim();
  if (!itemId) {
    return NextResponse.json(
      { error: "itemId required (or id + status accept/reject)" },
      { status: 400 },
    );
  }

  try {
    const result = await enqueueCorpusPromoteCandidate(itemId);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
