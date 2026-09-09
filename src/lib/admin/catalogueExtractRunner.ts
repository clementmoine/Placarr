/**
 * Catalogue extract runner (admin API + background worker).
 *
 * In-process Node only — no `tsx` / CLI spawn. Docker prod never needs a CLI
 * entrypoint; Catalogue Sync / Extract is the product path.
 */
import { access } from "node:fs/promises";
import { inspect } from "node:util";
import path from "node:path";

import { dataRoot } from "@/lib/runtimeData";
import { packApksDir } from "@/lib/packPaths";
import { POKEMON_LIVE_LANGS_CSV } from "@/providers/pokemontcglive/languages";
import { catalogueExtractSkipArgs } from "@/lib/admin/catalogueExtractCheckpoint";
import {
  CATALOGUE_EXTRACT_DBS_FACES_TIMEOUT_MS,
  CATALOGUE_EXTRACT_FULL_TIMEOUT_MS,
  CATALOGUE_EXTRACT_SCOPES,
  CATALOGUE_EXTRACT_TIMEOUT_MS,
  CATALOGUE_PACKS,
  cataloguePackForExtractTarget,
  cataloguePackInfo,
  resolveCataloguePackId,
  type CatalogueExtractScope,
  type CatalogueExtractTarget,
} from "@/lib/admin/cataloguePacks";

/** Same vocabulary as Catalogue packs — adding a pack is enough. */
export type { CatalogueExtractScope, CatalogueExtractTarget };
export {
  CATALOGUE_EXTRACT_DBS_FACES_TIMEOUT_MS,
  CATALOGUE_EXTRACT_FULL_TIMEOUT_MS,
  CATALOGUE_EXTRACT_SCOPES,
  CATALOGUE_EXTRACT_TIMEOUT_MS,
};

export const CATALOGUE_EXTRACT_TARGETS: readonly CatalogueExtractTarget[] = [
  ...new Set(CATALOGUE_PACKS.map((pack) => pack.extractTarget)),
];

/** Legacy admin targets → single pack extract. */
const LEGACY_LORCANA_TARGETS = new Set([
  "lorcana-web",
  "lorcana-mobile",
  "lorcana-cards",
]);

export function normalizeCatalogueExtractTarget(
  value: unknown,
): CatalogueExtractTarget | null {
  if (typeof value !== "string") return null;
  const raw = value.trim();
  if ((CATALOGUE_EXTRACT_TARGETS as readonly string[]).includes(raw)) {
    return raw as CatalogueExtractTarget;
  }
  if (LEGACY_LORCANA_TARGETS.has(raw)) return "lorcana";
  return cataloguePackInfo(resolveCataloguePackId(raw))?.extractTarget ?? null;
}

export function isCatalogueExtractTarget(
  value: unknown,
): value is CatalogueExtractTarget {
  return normalizeCatalogueExtractTarget(value) != null;
}

export function catalogueExtractLabel(target: CatalogueExtractTarget): string {
  const packs = CATALOGUE_PACKS.filter((pack) => pack.extractTarget === target);
  if (packs.length > 1) return packs[0]!.franchiseLabelEn;
  return packs[0]?.labelEn ?? target;
}

export function catalogueExtractTimeoutMs(
  target: CatalogueExtractTarget,
  scope: CatalogueExtractScope = "inventory",
): number {
  const extract = cataloguePackForExtractTarget(target)?.extract;
  if (!extract) return CATALOGUE_EXTRACT_TIMEOUT_MS;
  return extract.timeoutMsByScope?.[scope] ?? extract.timeoutMs;
}

function repoRoot(): string {
  return path.dirname(dataRoot());
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function preferredLorcanaApk(): Promise<string | null> {
  const dir = packApksDir("lorcana");
  for (const name of ["base.apk", "split_UnityDataAssetPack.apk"]) {
    const full = path.join(dir, name);
    if (await fileExists(full)) return full;
  }
  return null;
}

export type CatalogueExtractPlan = {
  target: CatalogueExtractTarget;
  /** Flags passed to the in-process pack pipeline (no CLI path). */
  argv: string[];
  prelude: string[];
};

export function normalizeCatalogueExtractScope(
  value: unknown,
): CatalogueExtractScope {
  const raw = String(value ?? "")
    .trim()
    .toLowerCase();
  return (CATALOGUE_EXTRACT_SCOPES as readonly string[]).includes(raw)
    ? (raw as CatalogueExtractScope)
    : "inventory";
}

/**
 * Build argv + log prelude for a catalogue extract (validation + UI).
 * @deprecated alias — prefer {@link resolveCatalogueExtractPlan}
 */
export async function resolveCatalogueExtractCommand(
  target: CatalogueExtractTarget,
  opts: {
    scope?: CatalogueExtractScope;
    completedSteps?: readonly string[];
  } = {},
): Promise<CatalogueExtractPlan> {
  return resolveCatalogueExtractPlan(target, opts);
}

/** Lorcana in-process providers — Unity / products are optional. */
export function lorcanaExtractProviders(opts: {
  hasApk: boolean;
  skipUnity?: boolean;
  skipProducts?: boolean;
}): string[] {
  const providers = ["lorcanaweb", "lorcanacards"];
  if (!opts.skipProducts) providers.push("lorcanaproducts");
  if (opts.hasApk && !opts.skipUnity) providers.push("lorcanamobile");
  return providers;
}

export async function resolveCatalogueExtractPlan(
  target: CatalogueExtractTarget,
  opts: {
    scope?: CatalogueExtractScope;
    completedSteps?: readonly string[];
    skipUnity?: boolean;
    skipProducts?: boolean;
    skipAudits?: boolean;
    skipPaperFaces?: boolean;
  } = {},
): Promise<CatalogueExtractPlan> {
  const scope = opts.scope ?? "inventory";
  const pack = cataloguePackForExtractTarget(target);
  if (!pack) {
    throw new Error(`No extract pipeline for catalogue target ${target}`);
  }
  const skipArgs = catalogueExtractSkipArgs(
    opts.completedSteps,
    pack.extract.pipelineSteps,
  );
  const resumePrelude =
    skipArgs.length > 0
      ? [`reprise: ${skipArgs[0]} ${skipArgs[1]}`]
      : [];

  if (target === "lorcana") {
    const apk = await preferredLorcanaApk();
    const providers = lorcanaExtractProviders({
      hasApk: Boolean(apk),
      skipUnity: opts.skipUnity,
      skipProducts: opts.skipProducts,
    });
    const argv = ["--providers", ...providers, ...skipArgs];
    const prelude: string[] = [...resumePrelude];
    if (apk && !opts.skipUnity) {
      argv.push("--apk", apk);
      prelude.push(`apk=${apk}`);
    } else if (!apk) {
      prelude.push(
        "skip Unity: no APK under data/lorcana/staging/apks/ (web + cards only)",
      );
    } else {
      prelude.push("skip Unity: APK unchanged — web + cards only");
    }
    if (!opts.skipProducts) {
      prelude.push(
        "produits scellés lorcards.fr (famille TCG Cards) — HTML déjà là = reprise",
      );
    }
    return { target, argv, prelude };
  }

  if (target === "pokemon") {
    const argv = ["--langs", POKEMON_LIVE_LANGS_CSV, ...skipArgs];
    if (opts.skipProducts) argv.push("--skip-products");
    else argv.push("--products");
    if (opts.skipAudits) {
      argv.push("--skip-apk-audit", "--skip-store-audit");
    }
    if (opts.skipPaperFaces) argv.push("--skip-paper-faces");
    const prelude =
      scope === "catalogue"
        ? [
            ...resumePrelude,
            "Pokémon: catalogue CDN (AssetManifests, 14 buckets) → tous les bundles listés",
            "chaque bundle porte son bucket : aucune sonde de dossiers",
          ]
        : [
            ...resumePrelude,
            "Pokémon: inventory APK/config ∪ Malie → CDN sequential (workers=1, delay=0; misses logged)",
          ];
    if (!opts.skipProducts) {
      prelude.push(
        "produits papier scellés pkmcards.fr (famille dbscards) — HTML déjà là = reprise",
      );
    }
    if (!opts.skipPaperFaces) {
      prelude.push(
        "faces papier : Coleka FR + TCGPlayer EN + pokemontcg.io + pkmcards.fr (toutes sources)",
      );
    } else {
      prelude.push("faces papier skipped (auto catalogue)");
    }
    if (scope === "catalogue") argv.push("--refresh-manifests");
    prelude.push(`langs=${POKEMON_LIVE_LANGS_CSV}`, `scope=${scope}`);
    return { target, argv, prelude };
  }

  return {
    target,
    argv: [...skipArgs],
    prelude: [...resumePrelude, ...(pack.extract.prelude ?? [])],
  };
}

function formatLogArgs(args: unknown[]): string {
  return args
    .map((a) =>
      typeof a === "string"
        ? a
        : inspect(a, { depth: 2, breakLength: 120, compact: true }),
    )
    .join(" ");
}

/**
 * Tee console → admin extract log while keeping stdout for the worker.
 *
 * Re-entrant: if ``onLog`` itself calls ``console.*`` (worker heartbeat),
 * we forward to the originals only — otherwise the tee stacks prefixes until
 * ``Maximum call stack size exceeded``.
 */
export async function withConsoleTee<T>(
  onLog: (line: string) => void,
  fn: () => Promise<T>,
): Promise<T> {
  const orig = {
    log: console.log,
    info: console.info,
    warn: console.warn,
    error: console.error,
  };
  let insideTee = false;
  const tee =
    (level: keyof typeof orig) =>
    (...args: unknown[]) => {
      if (!insideTee) {
        insideTee = true;
        try {
          const text = formatLogArgs(args);
          for (const line of text.split("\n")) {
            if (line.length > 0) onLog(line);
          }
        } finally {
          insideTee = false;
        }
      }
      orig[level](...args);
    };
  console.log = tee("log");
  console.info = tee("info");
  console.warn = tee("warn");
  console.error = tee("error");
  try {
    return await fn();
  } finally {
    console.log = orig.log;
    console.info = orig.info;
    console.warn = orig.warn;
    console.error = orig.error;
  }
}

async function invokePackPipeline(
  target: CatalogueExtractTarget,
  argv: string[],
  signal?: AbortSignal,
): Promise<void> {
  if (signal?.aborted) throw new Error("foil extract aborted");
  const root = repoRoot();

  switch (target) {
    case "pokemon": {
      const { runPokemonFoilExtract } = await import(
        "@/providers/pokemontcglive/extract"
      );
      await runPokemonFoilExtract(argv, { repo: root, signal });
      return;
    }
    case "lorcana": {
      const { runLorcanaFoilExtract } = await import(
        "@/providers/lorcanatcg/extract"
      );
      await runLorcanaFoilExtract(argv, { repo: root, signal });
      return;
    }
    case "naruto": {
      const { runNarutoPackPipeline } = await import(
        "@/providers/narutocarddass/extract"
      );
      await runNarutoPackPipeline(argv);
      return;
    }
    case "naruto-shippuden": {
      const { runNarutoShippudenPackPipeline } = await import(
        "@/providers/narutoshippuden/extract"
      );
      await runNarutoShippudenPackPipeline();
      return;
    }
    case "naruto-ranks": {
      const { runNarutoRanksPackPipeline } = await import(
        "@/providers/narutoranks/extract"
      );
      await runNarutoRanksPackPipeline(argv);
      return;
    }
    case "naruto-ultra": {
      const { runNarutoUltraPackPipeline } = await import(
        "@/providers/narutoultra/extract"
      );
      await runNarutoUltraPackPipeline(argv);
      return;
    }
    case "naruto-mythos": {
      const { runNarutoMythosPackPipeline } = await import(
        "@/providers/narutomythos/extract"
      );
      await runNarutoMythosPackPipeline(argv);
      return;
    }
    case "naruto-kayou": {
      const { runNarutoKayouPackPipeline } = await import(
        "@/providers/narutokayou/extract"
      );
      await runNarutoKayouPackPipeline(argv);
      return;
    }
    case "naruto-data-carddass": {
      const { runNarutoDataCarddassPackPipeline } = await import(
        "@/providers/narutodatacarddass/extract"
      );
      await runNarutoDataCarddassPackPipeline(argv);
      return;
    }
    case "dbs-cg": {
      const { runDbsCgPackPipeline } = await import("@/providers/dbscg/extract");
      await runDbsCgPackPipeline(argv);
      return;
    }
    case "dbs-fw": {
      const { runDbsFwPackPipeline } = await import("@/providers/dbsfw/extract");
      await runDbsFwPackPipeline(argv);
      return;
    }
    case "dbs-lamincards": {
      const { runDbsLamincardsPackPipeline } = await import(
        "@/providers/dbslamincards/extract"
      );
      await runDbsLamincardsPackPipeline(argv);
      return;
    }
    case "onepiece": {
      const { runOnepiecePackPipeline } = await import(
        "@/providers/onepiece/extract"
      );
      await runOnepiecePackPipeline(argv);
      return;
    }
    case "digimon": {
      const { runDigimonPackPipeline } = await import("@/providers/digimon/extract");
      await runDigimonPackPipeline(argv);
      return;
    }
    case "yugioh": {
      const { runYugiohPackPipeline } = await import("@/providers/yugioh/extract");
      await runYugiohPackPipeline(argv);
      return;
    }
    case "mtg": {
      const { runMtgPackPipeline } = await import("@/providers/mtg/extract");
      await runMtgPackPipeline(argv);
      return;
    }
    default: {
      const _exhaustive: never = target;
      throw new Error(`No in-process pipeline for ${_exhaustive}`);
    }
  }
}

/**
 * Run the extract in-process. Honours AbortSignal (cooperative — pipelines
 * that check `signal` stop; others finish the current step).
 *
 * Always tees stdout-style logs to ``data/<pack>/logs/foil-extract.log``.
 */
export type ExtractApkFetchOutcome =
  | { status: "skipped" }
  | { status: "up-to-date"; versionCode: number }
  | { status: "updated"; versionCode: number }
  | { status: "unavailable"; reason: string };

/** Probe/download the store APK when the pack has an `androidPackageId`. */
export async function maybeFetchStoreApkForExtract(
  target: CatalogueExtractTarget,
  options: {
    force?: boolean;
    signal?: AbortSignal;
    onLog?: (line: string) => void;
  } = {},
): Promise<ExtractApkFetchOutcome> {
  const pack = cataloguePackForExtractTarget(target);
  if (!pack?.androidPackageId) return { status: "skipped" };
  options.onLog?.(
    `── store APK ${pack.id} (${pack.androidPackageId})`,
  );
  const { fetchStoreApksForPack } = await import("@/lib/admin/apkStoreFetch");
  const result = await fetchStoreApksForPack(pack.id, {
    force: options.force,
    signal: options.signal,
    onLog: options.onLog,
  });
  if (result.status === "unavailable") {
    options.onLog?.(`store APK unavailable: ${result.reason}`);
    return result;
  }
  if (result.status === "up-to-date") {
    options.onLog?.(
      `store APK up-to-date (versionCode=${result.versionCode})`,
    );
    return result;
  }
  options.onLog?.(
    `store APK updated (versionCode=${result.versionCode})`,
  );
  return result;
}

/**
 * Auto jobs still refresh CDN / LorcanaJSON when the APK did not move.
 * Unity + product graphs + paper faces stay on a new APK (or a manual Sync).
 */
export type AutoExtractPolicy = {
  skipUnity: boolean;
  preferCatalogueScope: boolean;
  skipProducts: boolean;
  skipAudits: boolean;
  skipPaperFaces: boolean;
};

export function autoExtractPolicy(
  auto: boolean,
  outcome: ExtractApkFetchOutcome,
): AutoExtractPolicy {
  if (!auto || outcome.status === "updated") {
    return {
      skipUnity: false,
      preferCatalogueScope: false,
      skipProducts: false,
      skipAudits: false,
      skipPaperFaces: false,
    };
  }
  return {
    skipUnity: true,
    preferCatalogueScope: true,
    skipProducts: true,
    skipAudits: true,
    skipPaperFaces: true,
  };
}

export async function runCatalogueExtractCommand(
  target: CatalogueExtractTarget,
  options: {
    signal?: AbortSignal;
    onLog?: (line: string) => void;
    timeoutMs?: number;
    logHeader?: readonly string[];
    scope?: CatalogueExtractScope;
    completedSteps?: readonly string[];
    auto?: boolean;
    forceApk?: boolean;
  } = {},
): Promise<void> {
  const { appendCatalogueExtractLogSync, beginCatalogueExtractLog } =
    await import("@/lib/admin/catalogueExtractLog");
  await beginCatalogueExtractLog(target, options.logHeader ?? []);

  const onLog = (line: string) => {
    options.onLog?.(line);
    try {
      appendCatalogueExtractLogSync(target, line);
    } catch {
      /* best-effort */
    }
  };

  const apkOutcome = await maybeFetchStoreApkForExtract(target, {
    force: options.forceApk,
    signal: options.signal,
    onLog,
  });
  const policy = autoExtractPolicy(options.auto === true, apkOutcome);
  if (policy.skipUnity) {
    onLog("── auto: pas de nouvel APK — catalogue réseau (sans Unity)");
  }

  const scope =
    options.scope ??
    (policy.preferCatalogueScope ? "catalogue" : "inventory");
  const timeoutMs =
    options.timeoutMs ?? catalogueExtractTimeoutMs(target, scope);

  const { argv, prelude } = await resolveCatalogueExtractPlan(target, {
    scope,
    completedSteps: options.completedSteps,
    skipUnity: policy.skipUnity,
    skipProducts: policy.skipProducts,
    skipAudits: policy.skipAudits,
    skipPaperFaces: policy.skipPaperFaces,
  });

  for (const line of prelude) onLog(line);
  onLog(`in-process extract ${target} ${argv.join(" ")}`.trimEnd());

  if (options.signal?.aborted) {
    throw new Error("foil extract aborted");
  }

  const abortError = new Error("foil extract aborted");
  const onAbort = () => {
    /* cooperative pipelines check signal; this rejects the outer race */
  };
  options.signal?.addEventListener("abort", onAbort);

  try {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(
          new Error(
            `foil extract timed out after ${Math.round(timeoutMs / 1000)}s`,
          ),
        );
      }, timeoutMs);
      if (typeof timer.unref === "function") timer.unref();

      const abortReject = () => {
        clearTimeout(timer);
        reject(abortError);
      };
      options.signal?.addEventListener("abort", abortReject, { once: true });

      void withConsoleTee(onLog, () =>
        invokePackPipeline(target, argv, options.signal),
      )
        .then(() => {
          clearTimeout(timer);
          options.signal?.removeEventListener("abort", abortReject);
          resolve();
        })
        .catch((error) => {
          clearTimeout(timer);
          options.signal?.removeEventListener("abort", abortReject);
          reject(error);
        });
    });

    const postExtract =
      cataloguePackForExtractTarget(target)?.extract.postExtract;
    if (postExtract === "invalidatePokemonFoilNamesCache") {
      const { invalidatePokemonFoilNamesCache } =
        await import("@/effects/pokemon/foilNames");
      invalidatePokemonFoilNamesCache();
    }
    onLog("── done");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/aborted/i.test(message)) onLog("── cancelled");
    else onLog(`── failed: ${message}`);
    throw error;
  } finally {
    options.signal?.removeEventListener("abort", onAbort);
    // Disk log is sync (appendCatalogueExtractLogSync) — no async chain to flush.
  }
}
