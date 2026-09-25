/**
 * Checkpoint protocol for long catalogue extracts.
 *
 * CLIs that expose discrete `--skip` / `--only` steps emit
 * `── checkpoint <step>` after each completed step. The foil worker parses
 * those lines, merges them into `BackgroundWorkJob.payload.completedSteps`,
 * and on resume the runner appends `--skip a,b,…` so already-finished work
 * is not redone (ADR-017 / autonomy_audit §4).
 */

/** Stable log line emitted by stepped CLIs after a successful step. */
export const CATALOGUE_CHECKPOINT_RE = /^── checkpoint ([a-z][a-z0-9-]*)\s*$/i;

export function parseCatalogueCheckpointStep(line: string): string | null {
  const match = CATALOGUE_CHECKPOINT_RE.exec(line.trim());
  return match?.[1]?.toLowerCase() ?? null;
}

export function mergeCompletedSteps(
  existing: readonly string[] | null | undefined,
  step: string,
): string[] {
  const next = String(step || "")
    .trim()
    .toLowerCase();
  if (!next) return [...(existing ?? [])];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const value of [...(existing ?? []), next]) {
    const token = String(value || "")
      .trim()
      .toLowerCase();
    if (!token || seen.has(token)) continue;
    seen.add(token);
    out.push(token);
  }
  return out;
}

/**
 * Build CLI argv fragments for packs that honour `--skip a,b`.
 * Unknown / empty completed lists → no args (full run).
 * When `pipelineSteps` is set, only known steps are forwarded.
 */
export function catalogueExtractSkipArgs(
  completedSteps: readonly string[] | null | undefined,
  pipelineSteps?: readonly string[] | null,
): string[] {
  const known = pipelineSteps?.length
    ? new Set(pipelineSteps.map((s) => s.toLowerCase()))
    : null;
  const skip = mergeCompletedSteps(completedSteps, "").filter((step) =>
    known ? known.has(step) : true,
  );
  if (!skip.length) return [];
  return ["--skip", skip.join(",")];
}

/** Emit the protocol line — call from a CLI after a step finishes. */
export function logCatalogueCheckpoint(step: string): void {
  const token = String(step || "")
    .trim()
    .toLowerCase();
  if (!token) return;
  console.log(`── checkpoint ${token}`);
}
