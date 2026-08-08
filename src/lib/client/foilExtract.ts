/**
 * Admin foil extract — enqueue durable background job (`POST /api/admin/foil-extract`).
 */

export type FoilExtractTarget = "lorcana" | "pokemon";

export type FoilExtractEnqueued = {
  ok: true;
  jobId: string;
  target: FoilExtractTarget;
  kind: "foilExtract";
  label: string;
  hint?: string;
};

/**
 * Enqueue foil extract on the interactive worker. Survives navigation;
 * watch progress via the header background-jobs menu.
 */
export async function enqueueFoilExtract(
  target: FoilExtractTarget,
): Promise<FoilExtractEnqueued> {
  const res = await fetch("/api/admin/foil-extract", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ target }),
  });

  const body = (await res.json()) as {
    error?: string;
    ok?: boolean;
    jobId?: string;
    target?: FoilExtractTarget;
    kind?: "foilExtract";
    label?: string;
    hint?: string;
  };

  if (!res.ok || !body.ok || !body.jobId) {
    throw new Error(body.error || `HTTP ${res.status}`);
  }

  return {
    ok: true,
    jobId: body.jobId,
    target: body.target ?? target,
    kind: "foilExtract",
    label: body.label ?? target,
    hint: body.hint,
  };
}

/** @deprecated Use {@link enqueueFoilExtract} — stream mode removed. */
export async function runFoilExtractStream(
  target: FoilExtractTarget,
  onLog: (line: string) => void,
): Promise<{ ok: boolean; target?: FoilExtractTarget; hint?: string }> {
  const done = await enqueueFoilExtract(target);
  onLog(done.hint ?? `queued ${done.jobId}`);
  return { ok: true, target: done.target, hint: done.hint };
}
