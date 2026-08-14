/**
 * Shared foil dump/extract runner (admin API + background worker).
 * Spawns the same host scripts as the former streaming admin route.
 *
 * One target per pack (like Pokémon): internal web / Unity / cards scrapes are
 * one complete `lorcana` process — not separate admin buttons.
 */
import { spawn, type ChildProcess } from "node:child_process";
import { access } from "node:fs/promises";
import path from "node:path";

import { dataRoot } from "@/lib/runtimeData";
import { packApksDir } from "@/lib/packPaths";
import { POKEMON_LIVE_LANGS_CSV } from "@/providers/pokemontcglive/languages";
import { NARUTO_CCG_CLI_PATH } from "@/providers/narutoccg/cli";
import { DBS_CG_CLI_PATH } from "@/providers/dbscg/cli";
import { DBS_FW_CLI_PATH } from "@/providers/dbsfw/cli";
import {
  CATALOGUE_PACKS,
  cataloguePackForExtractTarget,
  type CatalogueExtractTarget,
} from "@/lib/admin/cataloguePacks";

/** Same vocabulary as Catalogue packs — adding a pack is enough. */
export type FoilExtractTarget = CatalogueExtractTarget;

export const FOIL_EXTRACT_TARGETS: readonly FoilExtractTarget[] = [
  ...new Set(CATALOGUE_PACKS.map((pack) => pack.extractTarget)),
];

/** Legacy admin targets → single pack extract. */
const LEGACY_LORCANA_TARGETS = new Set([
  "lorcana-web",
  "lorcana-mobile",
  "lorcana-cards",
]);

export function normalizeFoilExtractTarget(
  value: unknown,
): FoilExtractTarget | null {
  if (typeof value !== "string") return null;
  if ((FOIL_EXTRACT_TARGETS as readonly string[]).includes(value)) {
    return value as FoilExtractTarget;
  }
  if (LEGACY_LORCANA_TARGETS.has(value)) return "lorcana";
  if (
    value === "naruto-cacg" ||
    value === "carddass" ||
    value === "naruto/ccg"
  ) {
    return "naruto";
  }
  if (value === "dbs/cg" || value === "dbs-masters") {
    return "dbs-cg";
  }
  if (
    value === "dbs/fw" ||
    value === "fusion-world" ||
    value === "fusionworld"
  ) {
    return "dbs-fw";
  }
  return null;
}

export function isFoilExtractTarget(
  value: unknown,
): value is FoilExtractTarget {
  return normalizeFoilExtractTarget(value) != null;
}

export function foilExtractLabel(target: FoilExtractTarget): string {
  const pack = cataloguePackForExtractTarget(target);
  return pack?.labelEn ?? target;
}

/** Inventory / Lorcana — CDN scrape + extract within a dev session. */
export const FOIL_EXTRACT_TIMEOUT_MS = 40 * 60 * 1000;

/** Pokémon catalogue (~93k bundles): scrape skip-pass + extract can run hours. */
export const FOIL_EXTRACT_CATALOGUE_TIMEOUT_MS = 8 * 60 * 60 * 1000;

/** Masters first-run Deckplanet dump (~10k WebP) plus Bandai scrape. */
export const FOIL_EXTRACT_DBS_FACES_TIMEOUT_MS = 2 * 60 * 60 * 1000;

export function foilExtractTimeoutMs(
  target: FoilExtractTarget,
  scope: FoilExtractScope = "inventory",
): number {
  if (target === "pokemon" && scope === "catalogue") {
    return FOIL_EXTRACT_CATALOGUE_TIMEOUT_MS;
  }
  if (target === "dbs-cg") {
    return FOIL_EXTRACT_DBS_FACES_TIMEOUT_MS;
  }
  return FOIL_EXTRACT_TIMEOUT_MS;
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

export type FoilExtractCommand = {
  command: string;
  args: string[];
  prelude: string[];
};

/**
 * ``inventory`` (default) scrapes the derived APK ∪ Malie stem list.
 * ``catalogue`` re-dumps the CDN AssetManifests and scrapes everything they
 * list — authoritative and phantom-free, but that is the full ~93k bundles.
 */
export const FOIL_EXTRACT_SCOPES = ["inventory", "catalogue"] as const;
export type FoilExtractScope = (typeof FOIL_EXTRACT_SCOPES)[number];

export function normalizeFoilExtractScope(value: unknown): FoilExtractScope {
  const raw = String(value ?? "")
    .trim()
    .toLowerCase();
  return (FOIL_EXTRACT_SCOPES as readonly string[]).includes(raw)
    ? (raw as FoilExtractScope)
    : "inventory";
}

export async function resolveFoilExtractCommand(
  target: FoilExtractTarget,
  opts: { scope?: FoilExtractScope } = {},
): Promise<FoilExtractCommand> {
  const scope = opts.scope ?? "inventory";
  const root = repoRoot();
  if (target === "lorcana") {
    const apk = await preferredLorcanaApk();
    // Always scrape CSS + catalogue cards; Unity when an APK is present.
    const providers = apk
      ? ["lorcanaweb", "lorcanacards", "lorcanamobile"]
      : ["lorcanaweb", "lorcanacards"];
    const args = ["--providers", ...providers, "--no-job"];
    const prelude: string[] = [];
    if (apk) {
      args.push("--apk", apk);
      prelude.push(`apk=${apk}`);
    } else {
      prelude.push(
        "skip Unity: no APK under data/lorcana/staging/apks/ (web + cards only)",
      );
    }
    return {
      command: path.join(root, "node_modules/.bin/tsx"),
      args: [path.join(root, "src/providers/lorcanatcg/cli.ts"), ...args],
      prelude,
    };
  }
  if (target === "naruto") {
    return {
      command: path.join(root, "node_modules/.bin/tsx"),
      args: [NARUTO_CCG_CLI_PATH],
      prelude: ["Naruto CCG: Wayback → data/naruto/ccg (catalogue fermé)"],
    };
  }
  if (target === "dbs-cg") {
    return {
      command: path.join(root, "node_modules/.bin/tsx"),
      args: [DBS_CG_CLI_PATH],
      prelude: [
        "Dragon Ball Masters: cardlist Bandai + clone TCG Arena (EN) → data/dbs/cg",
        "faces HTTP (FR dbscards / Bandai) séquentielles ; dump EN déjà rangé ignoré — --force pour écraser",
      ],
    };
  }
  if (target === "dbs-fw") {
    return {
      command: path.join(root, "node_modules/.bin/tsx"),
      args: [DBS_FW_CLI_PATH],
      prelude: [
        "Dragon Ball Fusion World: Bandai fw/en cardlist → data/dbs/fw",
      ],
    };
  }
  // ``--no-job``: worker already owns the BackgroundWorkJob; child must not
  // adoptCli (that cancels the parent job → instant ── cancelled).
  const args = ["--langs", POKEMON_LIVE_LANGS_CSV, "--no-job"];
  const prelude =
    scope === "catalogue"
      ? [
          "Pokémon: catalogue CDN (AssetManifests, 14 buckets) → tous les bundles listés",
          "chaque bundle porte son bucket : aucune sonde de dossiers",
        ]
      : [
          "Pokémon: inventory APK/config ∪ Malie → CDN sequential (workers=1, delay=0; misses logged)",
        ];
  if (scope === "catalogue") args.push("--refresh-manifests");
  prelude.push(`langs=${POKEMON_LIVE_LANGS_CSV}`, `scope=${scope}`);
  return {
    command: path.join(root, "node_modules/.bin/tsx"),
    args: [path.join(root, "src/providers/pokemontcglive/cli.ts"), ...args],
    prelude,
  };
}

function pipeLines(
  stream: NodeJS.ReadableStream,
  onLine: (line: string) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    let buffer = "";
    stream.on("data", (chunk: Buffer | string) => {
      buffer += typeof chunk === "string" ? chunk : chunk.toString("utf8");
      let newline = buffer.indexOf("\n");
      while (newline >= 0) {
        const line = buffer.slice(0, newline).replace(/\r$/, "");
        buffer = buffer.slice(newline + 1);
        if (line.length > 0) onLine(line);
        newline = buffer.indexOf("\n");
      }
    });
    stream.on("error", reject);
    stream.on("end", () => {
      const rest = buffer.replace(/\r$/, "").trimEnd();
      if (rest) onLine(rest);
      resolve();
    });
  });
}

/**
 * Run the extract process. Honours AbortSignal (kills the child).
 * Throws when the script exits non-zero or times out.
 *
 * Always tees stdout/stderr to ``data/<pack>/logs/foil-extract.log`` so the
 * admin Logs dialog works even when the worker was started without an
 * explicit onLog hook.
 */
export async function runFoilExtractCommand(
  target: FoilExtractTarget,
  options: {
    signal?: AbortSignal;
    onLog?: (line: string) => void;
    timeoutMs?: number;
    /** Extra header lines when (re)starting the pack log file. */
    logHeader?: readonly string[];
    scope?: FoilExtractScope;
  } = {},
): Promise<void> {
  const { command, args, prelude } = await resolveFoilExtractCommand(target, {
    scope: options.scope,
  });
  const timeoutMs =
    options.timeoutMs ??
    foilExtractTimeoutMs(target, options.scope ?? "inventory");
  const root = repoRoot();

  const { appendFoilExtractLog, beginFoilExtractLog } = await import(
    "@/lib/admin/foilExtractLog"
  );
  await beginFoilExtractLog(target, options.logHeader ?? []);

  // Serialize disk writes so rapid lines are not interleaved / dropped.
  let logChain: Promise<void> = Promise.resolve();
  const onLog = (line: string) => {
    options.onLog?.(line);
    logChain = logChain
      .then(() => appendFoilExtractLog(target, line))
      .catch(() => {
        /* best-effort */
      });
  };

  for (const line of prelude) onLog(line);
  onLog(`$ ${command} ${args.join(" ")}`);

  if (options.signal?.aborted) {
    throw new Error("foil extract aborted");
  }

  try {
    await new Promise<void>((resolve, reject) => {
      const child: ChildProcess = spawn(command, args, {
        cwd: root,
        env: { ...process.env, PYTHONUNBUFFERED: "1" },
        stdio: ["ignore", "pipe", "pipe"],
        /*
          Own process group, so cancelling kills the whole tree.
          We spawn `tsx`, which forks the real node process, and the extract
          itself may fork python. SIGKILL on the direct child only reaped the
          wrapper: the grandchild kept downloading and kept writing to the
          inherited pipes, so the log showed `── cancelled` followed by two
          hundred more cards.
        */
        detached: process.platform !== "win32",
      });

      const killChild = () => {
        // Negative pid = the whole group. Falls back to the lone child when
        // there is no group (Windows, or spawn failed before it had a pid).
        try {
          if (child.pid && process.platform !== "win32") {
            process.kill(-child.pid, "SIGKILL");
            return;
          }
        } catch {
          /* group already gone, or never existed — try the child below */
        }
        try {
          child.kill("SIGKILL");
        } catch {
          /* already gone */
        }
      };

      const timer = setTimeout(() => {
        killChild();
        reject(
          new Error(
            `foil extract timed out after ${Math.round(timeoutMs / 1000)}s`,
          ),
        );
      }, timeoutMs);
      if (typeof timer.unref === "function") timer.unref();

      const onAbort = () => {
        killChild();
        reject(new Error("foil extract aborted"));
      };
      options.signal?.addEventListener("abort", onAbort);

      if (!child.stdout || !child.stderr) {
        clearTimeout(timer);
        options.signal?.removeEventListener("abort", onAbort);
        reject(new Error("foil extract missing stdio pipes"));
        return;
      }

      const stdoutDone = pipeLines(child.stdout, onLog);
      const stderrDone = pipeLines(child.stderr, onLog);

      child.on("error", (error) => {
        clearTimeout(timer);
        options.signal?.removeEventListener("abort", onAbort);
        reject(error);
      });

      child.on("close", (code) => {
        clearTimeout(timer);
        options.signal?.removeEventListener("abort", onAbort);
        void Promise.all([stdoutDone, stderrDone])
          .then(() => {
            if (code === 0) resolve();
            else reject(new Error(`extract failed (exit ${code ?? 1})`));
          })
          .catch(reject);
      });
    });
    if (target === "pokemon") {
      const { invalidatePokemonFoilNamesCache } = await import(
        "@/effects/pokemon/foilNames"
      );
      invalidatePokemonFoilNamesCache();
    }
    onLog("── done");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/aborted/i.test(message)) onLog("── cancelled");
    else onLog(`── failed: ${message}`);
    throw error;
  } finally {
    await logChain.catch(() => undefined);
  }
}
