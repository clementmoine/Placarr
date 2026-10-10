/**
 * Shared `--only` / `--skip` / `--offline` step selection for catalogue extract.
 * Packs declare their STEPS; the argv contract stays identical across owners.
 */

export function catalogueArgValue(
  argv: readonly string[],
  name: string,
): string | undefined {
  const idx = argv.indexOf(name);
  if (idx < 0) return undefined;
  return argv[idx + 1];
}

export function catalogueArgList(
  argv: readonly string[],
  name: string,
): string[] {
  return (catalogueArgValue(argv, name) ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export function selectCatalogueSteps<T extends string>(
  argv: readonly string[],
  steps: readonly T[],
  opts?: {
    /** Steps skipped when `--offline` (network harvest). */
    online?: ReadonlySet<T>;
    /** Steps omitted from the default run unless `--only` names them. */
    offByDefault?: ReadonlySet<T>;
    /** Default step list when `--only` is absent (defaults to `steps`). */
    defaults?: readonly T[];
  },
): T[] {
  const only = catalogueArgList(argv, "--only");
  const skip = new Set(catalogueArgList(argv, "--skip"));
  const offline = argv.includes("--offline");
  const defaults = opts?.defaults ?? steps;
  const base = only.length
    ? steps.filter((step) => only.includes(step))
    : [...defaults];
  return base.filter(
    (step) =>
      !skip.has(step) &&
      !(offline && opts?.online?.has(step)) &&
      !(only.length === 0 && opts?.offByDefault?.has(step)),
  );
}
