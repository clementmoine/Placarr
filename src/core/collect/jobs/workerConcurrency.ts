/**
 * Interactive worker concurrency: I/O-bound enrich vs single FlareSolverr browser.
 */
export function resolveInteractiveWorkerConcurrency(
  env: NodeJS.ProcessEnv = process.env,
): { concurrency: number; cappedForFlare: boolean } {
  const raw = Number.parseInt(
    env.WORKER_CONCURRENCY ||
      env.BACKGROUND_IO_CONCURRENCY ||
      env.BACKGROUND_WORK_CONCURRENCY ||
      "",
    10,
  );
  const flareConfigured = Boolean(env.FLARESOLVERR_URL?.trim());
  const forceHighConcurrency = Boolean(
    env.WORKER_CONCURRENCY_FORCE?.trim(),
  );
  // Default 6 drains manga/game backlogs when scrapes are direct. With Flare
  // configured, default 2 — the remote browser is serial (AsyncQueue 1).
  const requested =
    Number.isFinite(raw) && raw > 0 ? raw : flareConfigured ? 2 : 6;

  // Cap unless explicitly forced: concurrency 6 + Flare serial → 90s soft
  // timeouts and abandoned progressive stores (audit P2).
  if (flareConfigured && !forceHighConcurrency && requested > 3) {
    return { concurrency: 3, cappedForFlare: true };
  }
  return { concurrency: requested, cappedForFlare: false };
}
