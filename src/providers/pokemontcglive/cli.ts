#!/usr/bin/env tsx
/**
 * Pokémon foil update: sources + CDN scrape + live-cards index (Node),
 * UnityFS extract (Python/UnityPy).
 *
 *   tsx scripts/pokemon/update.ts --skip-scrape
 *   tsx scripts/pokemon/update.ts --langs fr --scrape-limit 50
 *   tsx scripts/pokemon/update.ts --langs en   # second pass after FR
 *   tsx scripts/pokemon/update.ts --skip-bootstrap-malie  # CDN catalogue only
 *
 * Flow: APK/config inventory ∪ Malie DBs → Rainier CDN UnityFS
 * (Malie-miss logged, CDN-miss logged, skip existing) → Unity extract.
 */

import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  ensureEffectsLayout,
  foilPackDir,
  repoRoot,
  writeLastRun,
} from "@/providers/shared/foilPaths";
import { withCliFoilExtractJob } from "@/lib/admin/foilExtractCliJob";
import {
  catalogueSetnumsFromConfig,
  DEFAULT_DELAY_S,
  DEFAULT_DIR_PROBE,
  DEFAULT_WORKERS,
  loadNames,
  scrape,
  type BundleResult,
  type DirProbeMode,
} from "@/providers/pokemontcglive/cdn";
import {
  bootstrapMalieCatalogue,
  filterMalieStemsByLangs,
  loadMalieBundleStems,
} from "@/providers/pokemontcglive/malie";
import { POKEMON_LIVE_SCRAPE_DEFAULT_LANGUAGES } from "@/providers/pokemontcglive/languages";
import {
  buildScrapeInventory,
  mergeCdnResultsIntoInventory,
  mergeLiveIdentities,
} from "@/providers/pokemontcglive/scrapeInventory";
import { loadCdnCatalogue } from "@/providers/pokemontcglive/scrapePlan";
import { main as auditApkMain } from "./auditApkCoverage";
import {
  collectIdentitiesFromConfigCache,
  writeLiveCardsSqlite,
  writeLiveFoilMasksJson,
} from "@/providers/pokemontcglive/cardDatabase";
import {
  resolveCdnTarget,
  writeSourcesReport,
} from "@/providers/pokemontcglive/sources";
import { scrapeTcgCardsProducts } from "@/providers/shared/dbscards/scrapeProducts";

function packPython(repo: string): string {
  const candidates = [
    path.join(repo, "src/providers/pokemontcglive/unity/.venv/bin/python"),
    path.join(repo, "src/providers/lorcanatcg/unity/.venv/bin/python"),
    path.join(repo, "scripts/pokemon/.venv/bin/python"),
    path.join(repo, "scripts/lorcana/.venv/bin/python"),
  ];
  for (const venv of candidates) {
    if (fs.existsSync(venv)) return venv;
  }
  return "python3";
}

/**
 * Dump ``manifest_<locale>_<bucket>`` for every bucket × lang into
 * ``staging/cdn-manifests``. Default: Node (`dumpCdnManifest.ts`, ADR-021).
 * Escape hatch: ``PLACARR_UNITY_PYTHON=1`` → UnityPy script.
 */
async function runManifestDump(
  repo: string,
  opts: {
    staging: string;
    contentBase: string;
    langs: string[];
  },
): Promise<number> {
  const dirsManifest = path.join(
    opts.staging,
    "config-cache",
    "asset-bundle-manifest_0.0.json",
  );
  if (!fs.existsSync(dirsManifest)) {
    console.warn(
      `  missing ${dirsManifest} — cannot list CDN buckets (need APK config-cache)`,
    );
    return 1;
  }
  const outDir = path.join(opts.staging, "cdn-manifests");
  if (process.env.PLACARR_UNITY_PYTHON === "1") {
    const args = [
      path.join(repo, "src/providers/pokemontcglive/unity/dump_cdn_manifest.py"),
      "--content-base",
      opts.contentBase,
      "--buckets",
      "all",
      "--dirs-manifest",
      dirsManifest,
      "--locales",
      opts.langs.join(","),
      "--out-dir",
      outDir,
    ];
    const r = spawnSync(packPython(repo), args, {
      cwd: repo,
      encoding: "utf8",
      env: {
        ...process.env,
        PYTHONPATH: [
          path.join(repo, "src/providers/pokemontcglive/unity/lib"),
          path.join(repo, "src/providers/pokemontcglive/unity"),
        ].join(path.delimiter),
      },
    });
    if (r.stdout) process.stdout.write(r.stdout);
    if (r.stderr) process.stderr.write(r.stderr);
    return r.status ?? 1;
  }
  const { dumpCdnManifests } = await import(
    "@/providers/pokemontcglive/dumpCdnManifest"
  );
  const result = await dumpCdnManifests({
    contentBase: opts.contentBase,
    buckets: "all",
    dirsManifest,
    locales: opts.langs.join(","),
    outDir,
  });
  console.log(JSON.stringify(result));
  return result.ok || result.written > 0 ? 0 : 2;
}

function runExtract(
  repo: string,
  opts: {
    bundlesDir: string;
    extractLimit: number;
    textureMode: string;
    extractWorkers: number | null;
  },
  runOpts?: { signal?: AbortSignal },
): Promise<Record<string, unknown>> {
  const args = [
    path.join(repo, "src/providers/pokemontcglive/unity/extract.py"),
    "--repo",
    repo,
    "--bundles-dir",
    opts.bundlesDir,
    "--textures",
    opts.textureMode,
  ];
  if (opts.extractLimit > 0) {
    args.push("--limit-cards", String(opts.extractLimit));
  }
  if (opts.extractWorkers != null) {
    args.push("--workers", String(opts.extractWorkers));
  }
  const pyPath = [
    path.join(repo, "src/providers/pokemontcglive/unity/lib"),
    path.join(repo, "src/providers/pokemontcglive/unity"),
  ].join(path.delimiter);
  const reportPath = path.join(
    repo,
    "data",
    "pokemon",
    "foil",
    "extract-report.json",
  );

  return new Promise((resolve, reject) => {
    let child: ChildProcess;
    try {
      child = spawn(packPython(repo), args, {
        cwd: repo,
        // inherit — spawnSync used to buffer all extract output until exit, so
        // long runs looked silent in foil-extract.log until timeout killed them.
        stdio: "inherit",
        env: {
          ...process.env,
          PYTHONPATH: pyPath,
          PYTHONUNBUFFERED: "1",
        },
      });
    } catch (err) {
      reject(err);
      return;
    }

    const onAbort = () => {
      try {
        child.kill("SIGKILL");
      } catch {
        /* already gone */
      }
      reject(new Error("foil extract cancelled"));
    };
    runOpts?.signal?.addEventListener("abort", onAbort, { once: true });

    child.on("error", (err) => {
      runOpts?.signal?.removeEventListener("abort", onAbort);
      reject(err);
    });
    child.on("close", (code) => {
      runOpts?.signal?.removeEventListener("abort", onAbort);
      let meta: Record<string, unknown> = {
        extractErrors: code === 0 ? 0 : 1,
      };
      if (fs.existsSync(reportPath)) {
        try {
          meta = JSON.parse(fs.readFileSync(reportPath, "utf8")) as Record<
            string,
            unknown
          >;
        } catch {
          /* keep status-based fallback */
        }
      }
      if (typeof meta.extractErrors !== "number") {
        meta.extractErrors = code === 0 ? 0 : 1;
      }
      resolve(meta);
    });
  });
}

export type UpdateOpts = {
  langs: string[];
  skipScrape?: boolean;
  scrapeLimit?: number;
  extractLimit?: number;
  workers?: number;
  delayS?: number;
  dirProbe?: DirProbeMode;
  /**
   * Source the scrape list from the CDN's own AssetManifests instead of the
   * derived APK ∪ Malie inventory. Authoritative: no phantoms, no dir probing
   * (each bundle's bucket comes with it).
   */
  fromManifest?: boolean;
  /** Re-dump the per-bucket AssetManifests before reading the catalogue. */
  refreshManifests?: boolean;
  /** Pull Malie card-databases → exact CDN stem list before scrape (default on). */
  bootstrapMalie?: boolean;
  /** Cap Malie DB files during bootstrap (0 = all). */
  malieLimitFiles?: number;
  withShared?: boolean;
  includeFoilT?: boolean;
  textureMode?: string;
  extractWorkers?: number | null;
  skipApkAudit?: boolean;
  strictApkScrape?: boolean;
  skipStoreAudit?: boolean;
  strictStoreAudit?: boolean;
  /**
   * Paper sealed-product graph from pkmcards.fr (TCG Cards family).
   * Off by default on a Live dump; admin extract passes `--products`.
   */
  skipProducts?: boolean;
  /** AbortSignal from CLI background-job cancel. */
  signal?: AbortSignal;
};

export async function runUpdate(
  repo: string,
  opts: UpdateOpts,
): Promise<Record<string, unknown>> {
  ensureEffectsLayout(repo);
  const signal = opts.signal;
  const throwIfAborted = () => {
    if (signal?.aborted) throw new Error("foil extract cancelled");
  };
  throwIfAborted();
  if (opts.skipProducts === false) {
    console.log("── products pkmcards.fr (papier scellé, famille TCG Cards)");
    const products = await scrapeTcgCardsProducts("pkmcards", {
      onProgress: (message) => console.log(`   products — ${message}`),
    });
    console.log(
      `── products : ${products.listed} SKU, ${products.detail} fiches, ` +
        `${products.printsLinked} liens carte (${products.fetched} GET)`,
    );
  }

  const cache = path.join(repo, "data/pokemon");
  const staging = path.join(cache, "staging");
  const bundles = path.join(staging, "cdn-bundles");
  const configCache = path.join(staging, "config-cache");
  const pack = foilPackDir(repo, "pokemon");

  const sources = await writeSourcesReport(cache);
  const target = await resolveCdnTarget(cache);
  console.log(
    `CDN target ver=${target.version} dir=${target.content_dir}` +
      (target.content_base ? ` base=${target.content_base}` : "") +
      ` (ver:${target.versionSource}, dir:${target.dirSource}` +
      (target.contentBaseSource ? `, base:${target.contentBaseSource}` : "") +
      `)`,
  );

  let malieReport: Record<string, unknown> | null = null;
  let malieIdentities: ReturnType<typeof collectIdentitiesFromConfigCache> = [];
  // Malie catalogue (skip unchanged DBs) — merge into APK inventory below.
  if (opts.bootstrapMalie !== false) {
    console.log("── Malie bootstrap (catalogue stems; skip unchanged)");
    const boot = await bootstrapMalieCatalogue({
      outDir: staging,
      langs: opts.langs,
      signal,
      limitFiles: opts.malieLimitFiles ?? 0,
    });
    malieReport = boot.report as unknown as Record<string, unknown>;
    malieIdentities = boot.identities;
    console.log(JSON.stringify(boot.report, null, 2));
  }

  const catPath = path.join(staging, "cdn-catalogue-setnum.txt");
  let setnums = fs.existsSync(configCache)
    ? catalogueSetnumsFromConfig(configCache)
    : [];
  if (!setnums.length && fs.existsSync(catPath)) {
    setnums = fs
      .readFileSync(catPath, "utf8")
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith("#"));
  }
  if (setnums.length) {
    fs.writeFileSync(catPath, `${setnums.join("\n")}\n`, "utf8");
  }
  console.log(`Catalogue setnums=${setnums.length} → ${catPath}`);

  const apkIdentities = fs.existsSync(configCache)
    ? collectIdentitiesFromConfigCache(configCache)
    : [];
  const identityRows = mergeLiveIdentities(malieIdentities, apkIdentities);

  let liveCardsIndex: Record<string, unknown> | null = null;
  if (identityRows.length) {
    console.log("── index catalog.sqlite (Malie ∪ APK)");
    liveCardsIndex = writeLiveCardsSqlite(
      identityRows,
      path.join(cache, "catalog.sqlite"),
    ) as unknown as Record<string, unknown>;
    const foilMasks = writeLiveFoilMasksJson(
      identityRows,
      path.join(repo, "data", "pokemon", "liveFoilMasks.json"),
    );
    liveCardsIndex = { ...liveCardsIndex, foilMasks };
    console.log(JSON.stringify(liveCardsIndex, null, 2));
  } else if (fs.existsSync(configCache)) {
    console.log("no card-database identities to index");
  }

  // Malie writes stems under staging/ (same as bootstrap outDir).
  const malieStems = filterMalieStemsByLangs(
    loadMalieBundleStems(staging),
    opts.langs,
  );
  const apkStems = [
    ...new Set(
      apkIdentities.map((r) => r.bundle_stem).filter((s) => Boolean(s?.trim())),
    ),
  ];
  console.log("── scrape inventory (APK/config ∪ Malie)");
  // When Malie stems exist they are lang-exact. Expanding setnum×langs
  // creates ~6× phantoms (Malie-miss) and wastes CDN GETs — ptcgl.dev /
  // Malie consumers scrape the exact list, not the cartesian product.
  const expandSetnums = malieStems.length === 0;
  if (!expandSetnums) {
    console.log(
      `  Malie stems=${malieStems.length} → skip setnum×langs expand` +
        ` (would be ~${setnums.length * opts.langs.length} phantoms)`,
    );
  }
  const inventory = buildScrapeInventory({
    outDir: cache,
    langs: opts.langs,
    apkStems,
    apkSetnums: expandSetnums ? setnums : [],
    malieStems,
    includeFoilT: Boolean(opts.includeFoilT),
  });
  console.log(
    JSON.stringify(
      {
        stems: inventory.report.stemCount,
        bySource: inventory.report.bySource,
        malieUnavailable: inventory.report.malieUnavailable,
        malieUnavailablePath: inventory.report.malieUnavailablePath,
      },
      null,
      2,
    ),
  );
  if (inventory.report.malieUnavailable > 0) {
    console.log(
      `  Malie miss: ${inventory.report.malieUnavailable} stems known from APK/config only → will try Pokémon CDN`,
    );
  }

  throwIfAborted();
  let scrapeReport: Record<string, unknown> | null = null;
  let catalogue: ReturnType<typeof loadCdnCatalogue> | null = null;
  if (opts.fromManifest) {
    if (opts.refreshManifests) {
      console.log("── dump AssetManifests (14 buckets × langs)");
      const code = await runManifestDump(repo, {
        staging,
        contentBase: target.content_base,
        langs: opts.langs,
      });
      if (code !== 0) {
        console.warn("  manifest dump failed — falling back to dumps on disk");
      }
    }
    // Manifest dumps + dirs live under staging/ (post data-layout migrate).
    catalogue = loadCdnCatalogue(staging, {
      langs: opts.langs,
      includeThumbnails: Boolean(opts.includeFoilT),
    });
    console.log(
      `── catalogue CDN: ${catalogue.names.length} bundles` +
        ` sur ${catalogue.buckets.length} buckets × ${catalogue.locales.length} langues`,
    );
    if (!catalogue.names.length) {
      console.warn(
        "  aucun dump de manifeste sous staging/cdn-manifests —" +
          " relance avec --refresh-manifests ; on retombe sur l'inventaire APK ∪ Malie",
      );
      catalogue = null;
    }
  }
  if (!opts.skipScrape) {
    const extras = opts.withShared === false ? [] : ["shadersbundle"];
    let cardNames = catalogue ? catalogue.names : inventory.stems;
    if (!cardNames.length) {
      cardNames = await loadNames({
        names: [],
        fromSetnums: setnums.length ? catPath : null,
        langs: opts.langs,
        includeFoilT: Boolean(opts.includeFoilT),
        limit: opts.scrapeLimit ?? 0,
        extras: [],
      });
    } else if (opts.scrapeLimit) {
      cardNames = cardNames.slice(0, opts.scrapeLimit);
    }
    const names = [...extras, ...cardNames];
    console.log(
      `Scraping ${names.length} (${catalogue ? "catalogue CDN" : "inventory"} ∪ shared)` +
        ` langs=${opts.langs.join(",")}` +
        ` → ${bundles} (CDN; Malie-miss already logged)`,
    );
    scrapeReport = (await scrape(names, bundles, {
      version: target.version,
      contentDir: target.content_dir,
      contentBase: target.content_base,
      // Catalogue carries each bundle's bucket → probing is moot.
      dirProbe: catalogue ? "all" : (opts.dirProbe ?? DEFAULT_DIR_PROBE),
      bucketOf: catalogue?.bucketOf ?? null,
      hashOf: catalogue?.hashOf ?? null,
      configCache: fs.existsSync(configCache) ? configCache : null,
      workers: opts.workers ?? DEFAULT_WORKERS,
      delayS: opts.delayS ?? DEFAULT_DELAY_S,
      dryRun: false,
      signal,
    })) as unknown as Record<string, unknown>;
    const results = (scrapeReport.results ?? []) as BundleResult[];
    mergeCdnResultsIntoInventory(inventory, results);
    console.log(
      `  CDN miss logged: ${inventory.report.cdnUnavailable}` +
        ` → ${inventory.report.cdnUnavailablePath}`,
    );
    const keys = [
      "requested",
      "ok",
      "skipped",
      "failed",
      "aborted",
      "byStatus",
      "version",
      "contentDir",
      "contentBase",
      "workers",
      "delayS",
    ] as const;
    console.log(
      JSON.stringify(
        Object.fromEntries(keys.map((k) => [k, scrapeReport![k]])),
        null,
        2,
      ),
    );
  }

  throwIfAborted();
  console.log(`Extract → ${pack}`);
  const ew =
    opts.extractWorkers ?? Math.max(1, Math.floor((os.cpus().length || 4) / 2));
  const extractReport = await runExtract(
    repo,
    {
      bundlesDir: bundles,
      extractLimit: opts.extractLimit ?? 0,
      textureMode: opts.textureMode ?? "cards",
      extractWorkers: ew,
    },
    { signal },
  );

  let apkAuditRc: number | null = null;
  if (!opts.skipApkAudit && fs.existsSync(configCache)) {
    console.log("── audit APK coverage");
    const auditArgv: string[] = [];
    if (opts.strictApkScrape) auditArgv.push("--strict-scrape");
    apkAuditRc = auditApkMain(auditArgv);
  }

  let storeAuditRc: number | null = null;
  if (!opts.skipStoreAudit) {
    console.log("── audit store coverage");
    const storeCmd = [
      "exec",
      "tsx",
      "src/providers/pokemontcglive/audit_store.ts",
    ];
    if (opts.strictStoreAudit) storeCmd.push("--", "--strict");
    storeAuditRc =
      spawnSync("pnpm", storeCmd, { cwd: repo, stdio: "inherit" }).status ?? 1;
  }

  const extractErrors = Number(extractReport.extractErrors ?? 0);
  const summary: Record<string, unknown> = {
    ok:
      extractErrors === 0 &&
      (apkAuditRc == null || apkAuditRc === 0) &&
      (storeAuditRc == null || storeAuditRc === 0),
    cdn: (sources as { cdn?: unknown }).cdn,
    catalogueSetnums: setnums.length,
    scrape: scrapeReport
      ? {
          requested: scrapeReport.requested,
          ok: scrapeReport.ok,
          failed: scrapeReport.failed,
        }
      : null,
    extract: extractReport,
    apkAuditExit: apkAuditRc,
    storeAuditExit: storeAuditRc,
    liveCardsIndex,
    malieBootstrap: malieReport,
    scrapeInventory: {
      stems: inventory.report.stemCount,
      bySource: inventory.report.bySource,
      malieUnavailable: inventory.report.malieUnavailable,
      cdnUnavailable: inventory.report.cdnUnavailable,
      availabilityPath: inventory.report.availabilityPath,
    },
    sourcesReport: path.join(cache, "sources-report.json"),
    packDir: pack,
  };

  if (
    scrapeReport &&
    scrapeReport.ok === 0 &&
    (scrapeReport.requested as number) > 0
  ) {
    summary.ok = false;
  }

  writeLastRun(repo, "pokemon", { provider: "tcglive-update", ...summary });

  // Rebuild per-print foil index from cards.json (same DB as live_cards).
  try {
    const { buildCardFoilIndex } = await import("./indexCardFoil");
    const foil = buildCardFoilIndex();
    console.log(
      `card_foil: ${foil.rows} rows from ${foil.bundles} bundles → ${foil.path}`,
    );
    (summary as { cardFoil?: unknown }).cardFoil = foil;
  } catch (err) {
    console.warn(
      `[foil] index-card-foil skipped: ${err instanceof Error ? err.message : err}`,
    );
  }

  try {
    const { rebuildPokemonCardsIndex } = await import("./rebuildCardsIndex");
    const faces = rebuildPokemonCardsIndex({ root: repo });
    if (faces.skipped) {
      console.warn("cards-index: skipped — no data/pokemon/cards yet");
    } else {
      console.log(`cards-index: ${faces.cards} stems → ${faces.path}`);
    }
    (summary as { cardsIndex?: unknown }).cardsIndex = faces;
  } catch (err) {
    console.warn(
      `[foil] cards-index skipped: ${err instanceof Error ? err.message : err}`,
    );
  }

  return summary;
}

function parseArgs(
  argv: string[],
): UpdateOpts & { repo: string; noJob: boolean } {
  const out: UpdateOpts & { repo: string; noJob: boolean } = {
    repo: process.cwd(),
    langs: [...POKEMON_LIVE_SCRAPE_DEFAULT_LANGUAGES],
    skipScrape: false,
    scrapeLimit: 0,
    extractLimit: 0,
    workers: DEFAULT_WORKERS,
    delayS: DEFAULT_DELAY_S,
    dirProbe: DEFAULT_DIR_PROBE,
    bootstrapMalie: true,
    malieLimitFiles: 0,
    withShared: true,
    includeFoilT: false,
    textureMode: "cards",
    extractWorkers: null,
    skipApkAudit: false,
    strictApkScrape: false,
    skipStoreAudit: false,
    strictStoreAudit: false,
    skipProducts: true,
    noJob: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === "--repo") out.repo = path.resolve(argv[++i]!);
    else if (a === "--langs") {
      out.langs = argv[++i]!.split(",")
        .map((x) => x.trim())
        .filter(Boolean);
    } else if (a === "--skip-scrape") out.skipScrape = true;
    else if (a === "--scrape-limit") out.scrapeLimit = Number(argv[++i]);
    else if (a === "--extract-limit") out.extractLimit = Number(argv[++i]);
    else if (a === "--workers") out.workers = Number(argv[++i]);
    else if (a === "--delay") out.delayS = Number(argv[++i]);
    else if (a === "--probe-all-dirs") out.dirProbe = "all";
    else if (a === "--from-manifest") out.fromManifest = true;
    else if (a === "--refresh-manifests") {
      out.fromManifest = true;
      out.refreshManifests = true;
    } else if (a === "--bootstrap-malie") out.bootstrapMalie = true;
    else if (a === "--skip-bootstrap-malie") out.bootstrapMalie = false;
    else if (a === "--malie-limit-files") {
      out.malieLimitFiles = Number(argv[++i]);
    } else if (a === "--no-shared") out.withShared = false;
    else if (a === "--foil-t") out.includeFoilT = true;
    else if (a === "--textures") out.textureMode = argv[++i]!;
    else if (a === "--extract-workers") out.extractWorkers = Number(argv[++i]);
    else if (a === "--skip-apk-audit") out.skipApkAudit = true;
    else if (a === "--strict-apk-scrape") out.strictApkScrape = true;
    else if (a === "--skip-store-audit") out.skipStoreAudit = true;
    else if (a === "--strict-store-audit") out.strictStoreAudit = true;
    else if (a === "--products") out.skipProducts = false;
    else if (a === "--skip-products") out.skipProducts = true;
    else if (a === "--no-job") out.noJob = true;
  }
  return out;
}

export async function main(argv = process.argv.slice(2)): Promise<number> {
  const args = parseArgs(argv);
  const repo = path.resolve(args.repo || repoRoot());
  const { noJob, repo: _repo, ...updateOpts } = args;

  const summary = await withCliFoilExtractJob(
    "pokemon",
    async ({ signal }) => runUpdate(repo, { ...updateOpts, signal }),
    { disabled: noJob },
  );
  const { extract, ...rest } = summary;
  console.log(JSON.stringify(rest, null, 2));
  console.log(JSON.stringify(extract, null, 2));
  return summary.ok ? 0 : 1;
}

const entry = process.argv[1]
  ? pathToFileURL(path.resolve(process.argv[1])).href
  : "";
if (import.meta.url === entry) {
  main().then((code) => process.exit(code));
}
