/**
 * Lorcana foil extract — Catalogue Sync / worker (in-process).
 *
 * STEPS mirror dbscg/dbsfw: `--only` / `--skip` / `--offline` pick which
 * passes run. Legacy `--providers` still works and maps onto the same steps.
 */

import fs from "node:fs";
import path from "node:path";

import {
  ensureEffectsLayout,
  repoRoot,
  writeLastRun,
} from "@/providers/shared/foilPaths";
import { selectCatalogueSteps } from "@/providers/shared/cardCatalogue/catalogueSteps";
import { scrapeLorcardsProducts } from "@/providers/lorcana/lorcanatcg/sources/lorcards";
import { scrapeLorcanaCards } from "@/providers/lorcana/lorcanatcg/scrape/cards";
import { dumpLorcanaWeb } from "@/providers/lorcana/lorcanatcg/pipeline/dumpWeb";
import { lorcanaUnityArtifactsFresh } from "@/providers/lorcana/lorcanatcg/extract/unityApk";

export const LORCANA_STEPS = [
  "web",
  "cards",
  "products",
  "official",
  "mobile",
] as const;
export type LorcanaStep = (typeof LORCANA_STEPS)[number];

/**
 * Steps that need the network (skipped under `--offline`).
 * `products` can reuse on-disk lorcards staging like dbscg/dbsfw.
 */
const LORCANA_ONLINE = new Set<LorcanaStep>([
  "web",
  "cards",
  "official",
  "mobile",
]);

const PROVIDER_TO_STEP: Record<string, LorcanaStep> = {
  lorcanaweb: "web",
  lorcanacards: "cards",
  lorcanaproducts: "products",
  lorcanaofficial: "official",
  lorcanamobile: "mobile",
};

/**
 * Resolve which Lorcana extract passes to run.
 *
 * `--providers` (legacy) wins when present; otherwise `--only` / `--skip` /
 * `--offline` filter {@link LORCANA_STEPS}. Default = web + cards + products
 * + mobile (SKUs / scellés / packshots via lorcards + site officiel).
 */
export function selectLorcanaSteps(argv: readonly string[]): LorcanaStep[] {
  const providersIdx = argv.indexOf("--providers");
  if (providersIdx >= 0) {
    const providers: string[] = [];
    for (let i = providersIdx + 1; i < argv.length; i++) {
      const a = argv[i]!;
      if (a.startsWith("--")) break;
      providers.push(a);
    }
    const fromProviders = providers
      .map((p) => PROVIDER_TO_STEP[p])
      .filter((s): s is LorcanaStep => Boolean(s));
    if (fromProviders.length) return fromProviders;
  }

  return selectCatalogueSteps(argv, LORCANA_STEPS, {
    online: LORCANA_ONLINE,
    defaults: ["web", "cards", "products", "mobile"],
  });
}

async function runOfficialSiteOnly(
  force: boolean,
): Promise<Record<string, unknown>> {
  const { runOfficialSiteProductsStep } = await import(
    "./scrape/officialSiteStep"
  );
  const out = await runOfficialSiteProductsStep({
    force,
    spoilers: true,
    log: (message) => console.log(message),
  });
  return {
    provider: "lorcanaofficial",
    ok: true,
    officialPages: out.pages,
    officialLogos: out.logos,
    officialPackshots: out.packshots,
    officialSpoilers: out.spoilers,
    officialSpoilerFaces: out.spoilerFaces,
    officialSpoilerUnmatched: out.spoilerUnmatched,
    officialUpserted: out.upserted,
  };
}

async function runLorcardsProducts(
  force: boolean,
  offline: boolean,
): Promise<Record<string, unknown>> {
  const result = await scrapeLorcardsProducts({
    force,
    offline,
    onProgress: (message) => console.log(`   products — ${message}`),
  });
  console.log(
    `── products : ${result.listed} SKU, ${result.detail} fiches, ` +
      `${result.printsLinked} liens carte (${result.fetched} GET)`,
  );

  let listDump: Record<string, unknown> = {};
  if (!offline) {
    const { ensureCardsFrListDump } = await import(
      "@/providers/shared/tcgcards/ensureListDump"
    );
    const {
      LORCARDS_CARD_SITE,
      lorcardsIndexPath,
    } = await import("@/providers/shared/tcgcards/scrapeList");
    const list = await ensureCardsFrListDump({
      packId: "lorcana",
      site: LORCARDS_CARD_SITE,
      indexPath: lorcardsIndexPath("fr"),
      force,
      label: "lorcards.fr",
    });
    console.log(
      `── lorcards.fr list — ${list.cards} tuiles, ${list.priced} cotes, ${list.pages} pages → ${list.file}`,
    );
    listDump = {
      listCards: list.cards,
      listPriced: list.priced,
      listPages: list.pages,
      listFile: list.file,
    };
  }

  let official: Record<string, unknown> = {};
  if (!offline) {
    const light = await runOfficialSiteOnly(force);
    official = {
      officialPages: light.officialPages,
      officialLogos: light.officialLogos,
      officialPackshots: light.officialPackshots,
      officialUpserted: light.officialUpserted,
    };
  }

  return {
    provider: "lorcanaproducts",
    ok: true,
    ...result,
    ...listDump,
    ...official,
  };
}

function isTransientNetworkError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error);
  const code =
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof (error as { code?: unknown }).code === "string"
      ? (error as { code: string }).code
      : "";
  return (
    /ENOTFOUND|EAI_AGAIN|ECONNREFUSED|ECONNRESET|ETIMEDOUT|ENETUNREACH|socket hang up|network/i.test(
      `${code} ${msg}`,
    )
  );
}

async function runCardsScrape(
  repo: string,
  force: boolean,
): Promise<Record<string, unknown>> {
  try {
    const result = await scrapeLorcanaCards({
      force,
      root: repo,
    });
    const { ok: synced, ...counts } = result;
    return { provider: "lorcanacards", ok: true, synced, ...counts };
  } catch (error) {
    if (!isTransientNetworkError(error)) throw error;
    const message = error instanceof Error ? error.message : String(error);
    console.warn(
      `── cards — skip (network unreachable, local corpus kept): ${message}`,
    );
    return {
      provider: "lorcanacards",
      ok: false,
      skipped: true,
      reason: message,
    };
  }
}

function unityInputsAvailable(
  repo: string,
  apk: string | null,
  data: string | null,
): boolean {
  if (data) return fs.existsSync(data) && fs.statSync(data).isDirectory();
  if (apk) return fs.existsSync(apk) && fs.statSync(apk).isFile();
  const persist = path.join(repo, "data/lorcana/staging/unity-data");
  if (fs.existsSync(persist) && fs.statSync(persist).isDirectory()) return true;
  const apks = path.join(repo, "data/lorcana/staging/apks");
  if (!fs.existsSync(apks)) return false;
  return fs.readdirSync(apks).some((n) => n.endsWith(".apk"));
}

async function runUnity(
  repo: string,
  apk: string | null,
  data: string | null,
): Promise<Record<string, unknown>> {
  const { extractUnityNode } = await import(
    "@/providers/lorcana/lorcanatcg/extract/unityNode"
  );
  return extractUnityNode({ repo, apk, data });
}

function parseArgs(argv: string[]) {
  const out = {
    repo: process.cwd(),
    apk: null as string | null,
    data: null as string | null,
    force: false,
    offline: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === "--repo") out.repo = path.resolve(argv[++i]!);
    else if (a === "--apk") out.apk = path.resolve(argv[++i]!);
    else if (a === "--data") out.data = path.resolve(argv[++i]!);
    else if (a === "--force") out.force = true;
    else if (a === "--offline") out.offline = true;
  }
  return out;
}

export async function runLorcanaFoilExtract(
  argv: string[] = [],
  opts: { repo?: string; signal?: AbortSignal } = {},
): Promise<Record<string, unknown>[]> {
  const args = parseArgs(argv);
  const repo = path.resolve(opts.repo || args.repo || repoRoot());
  const signal = opts.signal;
  const steps = selectLorcanaSteps(argv);

  if (signal?.aborted) throw new Error("foil extract cancelled");
  ensureEffectsLayout(repo);

  console.log(
    `── Lorcana — étapes : ${steps.join(" → ") || "(masks only)"}`,
  );

  const { installFullFoilMask } = await import(
    "@/providers/shared/cardCatalogue/curatedAssets"
  );
  const fullMask = await installFullFoilMask("lorcana");
  if (fullMask.installed) {
    console.log(`── full foil mask → ${fullMask.dest}`);
  }

  const { installAttestedArtMasks } = await import(
    "@/providers/lorcana/lorcanatcg/curated/installAttestedArtMasks"
  );
  for (const row of await installAttestedArtMasks()) {
    if (row.installed && row.dest) {
      console.log(`── attested art mask ${row.printKey} → ${row.dest}`);
    } else if (row.reason) {
      console.log(`── attested art mask ${row.printKey}: ${row.reason}`);
    }
  }

  const results: Record<string, unknown>[] = [];
  for (const step of steps) {
    if (signal?.aborted) throw new Error("foil extract cancelled");
    if (step === "web") {
      results.push(await dumpLorcanaWeb({ root: repo }));
    } else if (step === "cards") {
      results.push(await runCardsScrape(repo, args.force));
    } else if (step === "official") {
      results.push(await runOfficialSiteOnly(args.force));
    } else if (step === "products") {
      results.push(await runLorcardsProducts(args.force, args.offline));
    } else if (step === "mobile") {
      if (!unityInputsAvailable(repo, args.apk, args.data)) {
        console.log(
          "skip Unity: no APK under data/lorcana/staging/apks/ (web + cards only)",
        );
        results.push({
          provider: "lorcanamobile",
          ok: false,
          skipped: true,
          reason: "no APK / unity-data",
        });
        continue;
      }
      if (!args.data && lorcanaUnityArtifactsFresh(repo)) {
        console.log("skip Unity: shaders/manifest/back newer than APKs");
        results.push({
          provider: "lorcanamobile",
          ok: true,
          skipped: true,
          reason: "artifacts-fresh",
        });
        continue;
      }
      results.push(await runUnity(repo, args.apk, args.data));
    }
  }
  writeLastRun(repo, "lorcana", { domain: "lorcana", results });
  console.log(JSON.stringify(results, null, 2));
  return results;
}
