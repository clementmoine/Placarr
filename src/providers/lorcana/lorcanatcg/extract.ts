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

function argValueFrom(
  argv: readonly string[],
  name: string,
): string | undefined {
  const idx = argv.indexOf(name);
  if (idx < 0) return undefined;
  return argv[idx + 1];
}

function argListFrom(argv: readonly string[], name: string): string[] {
  return (argValueFrom(argv, name) ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * Resolve which Lorcana extract passes to run.
 *
 * `--providers` (legacy) wins when present; otherwise `--only` / `--skip` /
 * `--offline` filter {@link LORCANA_STEPS}. Default = web + cards + mobile
 * (same as the historical default provider list).
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

  const only = argListFrom(argv, "--only");
  const skip = new Set(argListFrom(argv, "--skip"));
  const offline = argv.includes("--offline");
  const defaultSteps: LorcanaStep[] = ["web", "cards", "mobile"];
  const base = only.length
    ? LORCANA_STEPS.filter((step) => only.includes(step))
    : defaultSteps;
  return base.filter(
    (step) => !skip.has(step) && !(offline && LORCANA_ONLINE.has(step)),
  );
}

async function runOfficialSiteOnly(
  force: boolean,
): Promise<Record<string, unknown>> {
  const { harvestOfficialLorcanaSite } = await import("./scrape/officialSite");
  const { applyOfficialSiteLogos, upsertOfficialSiteProducts } =
    await import("./scrape/officialSiteApply");
  const harvested = await harvestOfficialLorcanaSite({
    force,
    onProgress: (message) => console.log(`   official — ${message}`),
  });
  console.log(
    `── official site — ${harvested.pages} pages, ${harvested.logos} logos, ${harvested.packshots} packshots, ${harvested.spoilers} spoilers`,
  );
  const logos = applyOfficialSiteLogos();
  const upserted = upsertOfficialSiteProducts({ setLogoIndex: logos.index });
  console.log(
    `── official upsert — logos +${logos.added}/${logos.updated}, produits ${upserted.written}`,
  );
  const { applyOfficialSiteSpoilerFaces } = await import(
    "./scrape/officialSiteSpoilers"
  );
  const spoilers = await applyOfficialSiteSpoilerFaces({
    pages: harvested.pagesParsed,
    onProgress: (message) => console.log(`   spoiler — ${message}`),
  });
  console.log(
    `── official spoilers — ${spoilers.written} faces, ${spoilers.matched} matchés, ${spoilers.unmatched} sans ancre`,
  );
  if (spoilers.unmatchedTitles.length) {
    console.log(
      `   (sans ancre) ${spoilers.unmatchedTitles.slice(0, 12).join(" · ")}`,
    );
  }
  const { promoteOfficialSiteAndPurgeStaging } = await import(
    "./scrape/officialSite"
  );
  if (
    promoteOfficialSiteAndPurgeStaging({
      pages: harvested.pagesParsed,
    })
  ) {
    console.log("── official site — staging purgé (ledger frais)");
  }
  return {
    provider: "lorcanaofficial",
    ok: true,
    officialPages: harvested.pages,
    officialLogos: harvested.logos,
    officialPackshots: harvested.packshots,
    officialSpoilers: harvested.spoilers,
    officialSpoilerFaces: spoilers.written,
    officialSpoilerUnmatched: spoilers.unmatched,
    officialUpserted: upserted.written,
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

async function runCardsScrape(
  repo: string,
  force: boolean,
): Promise<Record<string, unknown>> {
  const result = await scrapeLorcanaCards({
    force,
    root: repo,
  });
  const { ok: synced, ...counts } = result;
  return { provider: "lorcanacards", ok: true, synced, ...counts };
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
