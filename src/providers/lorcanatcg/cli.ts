#!/usr/bin/env tsx
/**
 * Lorcana foil dump: web (Node) + cards (Node) + Unity (Python/UnityPy).
 *
 *   pnpm foil:lorcana
 *   tsx src/providers/lorcanatcg/cli.ts --providers lorcanaweb lorcanacards lorcanaproducts
 */

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  ensureEffectsLayout,
  repoRoot,
  writeLastRun,
} from "@/providers/shared/foilPaths";
import { withCliFoilExtractJob } from "@/lib/admin/foilExtractCliJob";
import { scrapeLorcardsProducts } from "@/providers/lorcanatcg/lorcards";
import { scrapeLorcanaCards } from "@/providers/lorcanatcg/scrapeCards";
import { dumpLorcanaWeb } from "@/providers/lorcanatcg/dumpWeb";

function packPython(repo: string): string {
  const candidates = [
    path.join(repo, "src/providers/lorcanatcg/unity/.venv/bin/python"),
    path.join(repo, "scripts/lorcana/.venv/bin/python"),
  ];
  for (const venv of candidates) {
    if (fs.existsSync(venv)) return venv;
  }
  return "python3";
}

async function runLorcardsProducts(): Promise<Record<string, unknown>> {
  const result = await scrapeLorcardsProducts({
    force: process.argv.includes("--force"),
    offline: process.argv.includes("--offline"),
    onProgress: (message) => console.log(`   products — ${message}`),
  });
  console.log(
    `── products : ${result.listed} SKU, ${result.detail} fiches, ` +
      `${result.printsLinked} liens carte (${result.fetched} GET)`,
  );
  return { provider: "lorcanaproducts", ok: true, ...result };
}

async function runCardsScrape(repo: string): Promise<Record<string, unknown>> {
  const result = await scrapeLorcanaCards({
    force: process.argv.includes("--force"),
    root: repo,
  });
  /*
    `result.ok` est un *compteur* de cartes rangées, `ok` ici le statut booléen
    de l'étape — comme `lorcanamobile` juste en dessous. Étalé tel quel, le
    compteur écrasait silencieusement le statut : la convention disait `true`,
    l'objet portait un nombre.
  */
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

function runUnity(
  repo: string,
  apk: string | null,
  data: string | null,
): Record<string, unknown> {
  const args = [
    path.join(repo, "src/providers/lorcanatcg/unity/mobile.py"),
    "--repo",
    repo,
  ];
  if (apk) args.push("--apk", apk);
  if (data) args.push("--data", data);
  const r = spawnSync(packPython(repo), args, {
    cwd: repo,
    encoding: "utf8",
    env: {
      ...process.env,
      PYTHONPATH: [
        path.join(repo, "src/providers/lorcanatcg/unity/lib"),
        path.join(repo, "src/providers/lorcanatcg/unity"),
      ].join(path.delimiter),
    },
  });
  if (r.stdout) process.stdout.write(r.stdout);
  if (r.stderr) process.stderr.write(r.stderr);
  if (r.status !== 0) process.exit(r.status ?? 1);
  const lines = (r.stdout || "").trim().split("\n").filter(Boolean);
  const last = lines[lines.length - 1] || "{}";
  try {
    return JSON.parse(last) as Record<string, unknown>;
  } catch {
    return { provider: "lorcanamobile", ok: true };
  }
}

function parseArgs(argv: string[]) {
  const out = {
    repo: process.cwd(),
    providers: ["lorcanaweb", "lorcanacards", "lorcanamobile"] as string[],
    apk: null as string | null,
    data: null as string | null,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === "--repo") out.repo = path.resolve(argv[++i]!);
    else if (a === "--apk") out.apk = path.resolve(argv[++i]!);
    else if (a === "--data") out.data = path.resolve(argv[++i]!);
    else if (a === "--providers") {
      out.providers = [];
      while (argv[i + 1] && !argv[i + 1]!.startsWith("--")) {
        out.providers.push(argv[++i]!);
      }
    }
  }
  return out;
}

export async function main(argv = process.argv.slice(2)): Promise<number> {
  const args = parseArgs(argv);
  const repo = path.resolve(args.repo || repoRoot());
  const noJob = argv.includes("--no-job");

  return withCliFoilExtractJob(
    "lorcana",
    async ({ signal }) => {
      if (signal.aborted) throw new Error("foil extract cancelled");
      ensureEffectsLayout(repo);

      const results: Record<string, unknown>[] = [];
      for (const pid of args.providers) {
        if (signal.aborted) throw new Error("foil extract cancelled");
        if (pid === "lorcanaweb") {
          results.push(await dumpLorcanaWeb({ root: repo }));
        } else if (pid === "lorcanacards") {
          results.push(await runCardsScrape(repo));
        } else if (pid === "lorcanaproducts") {
          results.push(await runLorcardsProducts());
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
          results.push(runUnity(repo, args.apk, args.data));
        }
      }
      writeLastRun(repo, "lorcana", { domain: "lorcana", results });
      console.log(JSON.stringify(results, null, 2));
      return 0;
    },
    { disabled: noJob },
  );
}

const entry = process.argv[1]
  ? pathToFileURL(path.resolve(process.argv[1])).href
  : "";
if (import.meta.url === entry) {
  main().then((code) => process.exit(code));
}
