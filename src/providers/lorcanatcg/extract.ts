/**
 * Lorcana foil extract — Catalogue Sync / worker (in-process).
 */

import fs from "node:fs";
import path from "node:path";

import {
  ensureEffectsLayout,
  repoRoot,
  writeLastRun,
} from "@/providers/shared/foilPaths";
import { scrapeLorcardsProducts } from "@/providers/lorcanatcg/lorcards";
import { scrapeLorcanaCards } from "@/providers/lorcanatcg/scrapeCards";
import { dumpLorcanaWeb } from "@/providers/lorcanatcg/dumpWeb";

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

  let official: Record<string, unknown> = {};
  if (!offline) {
    const { harvestOfficialLorcanaSite } = await import("./officialSite");
    const { applyOfficialSiteLogos, upsertOfficialSiteProducts } =
      await import("./officialSiteApply");
    const harvested = await harvestOfficialLorcanaSite({
      force,
      onProgress: (message) => console.log(`   official — ${message}`),
    });
    console.log(
      `── official site — ${harvested.pages} pages, ${harvested.logos} logos, ${harvested.packshots} packshots`,
    );
    const logos = applyOfficialSiteLogos();
    const upserted = upsertOfficialSiteProducts({ setLogoIndex: logos.index });
    console.log(
      `── official upsert — logos +${logos.added}/${logos.updated}, produits ${upserted.written}`,
    );
    official = {
      officialPages: harvested.pages,
      officialLogos: harvested.logos,
      officialPackshots: harvested.packshots,
      officialUpserted: upserted.written,
    };
  }

  return { provider: "lorcanaproducts", ok: true, ...result, ...official };
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
    "@/providers/lorcanatcg/extractUnityNode"
  );
  return extractUnityNode({ repo, apk, data });
}

function parseArgs(argv: string[]) {
  const out = {
    repo: process.cwd(),
    providers: ["lorcanaweb", "lorcanacards", "lorcanamobile"] as string[],
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
    else if (a === "--providers") {
      out.providers = [];
      while (argv[i + 1] && !argv[i + 1]!.startsWith("--")) {
        out.providers.push(argv[++i]!);
      }
    }
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

  if (signal?.aborted) throw new Error("foil extract cancelled");
  ensureEffectsLayout(repo);

  const results: Record<string, unknown>[] = [];
  for (const pid of args.providers) {
    if (signal?.aborted) throw new Error("foil extract cancelled");
    if (pid === "lorcanaweb") {
      results.push(await dumpLorcanaWeb({ root: repo }));
    } else if (pid === "lorcanacards") {
      results.push(await runCardsScrape(repo, args.force));
    } else if (pid === "lorcanaproducts") {
      results.push(await runLorcardsProducts(args.force, args.offline));
    } else if (pid === "lorcanamobile") {
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
      results.push(await runUnity(repo, args.apk, args.data));
    }
  }
  writeLastRun(repo, "lorcana", { domain: "lorcana", results });
  console.log(JSON.stringify(results, null, 2));
  return results;
}
