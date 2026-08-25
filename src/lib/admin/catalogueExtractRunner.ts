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
  // Pack ids and aliases share one resolver — `resolveCataloguePackId`.
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

export type CatalogueExtractCommand = {
  command: string;
  args: string[];
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

export async function resolveCatalogueExtractCommand(
  target: CatalogueExtractTarget,
  opts: { scope?: CatalogueExtractScope } = {},
): Promise<CatalogueExtractCommand> {
  const scope = opts.scope ?? "inventory";
  const root = repoRoot();
  const pack = cataloguePackForExtractTarget(target);
  if (!pack) {
    throw new Error(`No extract command for catalogue target ${target}`);
  }
  const tsx = path.join(root, "node_modules/.bin/tsx");
  const cli = path.join(root, pack.extract.cliPath);
  if (target === "lorcana") {
    const apk = await preferredLorcanaApk();
    // Always scrape CSS + catalogue cards; Unity when an APK is present.
    const providers = apk
      ? ["lorcanaweb", "lorcanacards", "lorcanaproducts", "lorcanamobile"]
      : ["lorcanaweb", "lorcanacards", "lorcanaproducts"];
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
    prelude.push(
      "produits scellés lorcards.fr (famille TCG Cards) — HTML déjà là = reprise",
    );
    return { command: tsx, args: [cli, ...args], prelude };
  }
  if (target !== "pokemon") {
    return {
      command: tsx,
      args: [cli],
      prelude: [...(pack.extract.prelude ?? [])],
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
  args.push("--products");
  prelude.push(
    "produits papier scellés pkmcards.fr (famille dbscards) — HTML déjà là = reprise",
  );
  if (scope === "catalogue") args.push("--refresh-manifests");
  prelude.push(`langs=${POKEMON_LIVE_LANGS_CSV}`, `scope=${scope}`);
  return { command: tsx, args: [cli, ...args], prelude };
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
export async function runCatalogueExtractCommand(
  target: CatalogueExtractTarget,
  options: {
    signal?: AbortSignal;
    onLog?: (line: string) => void;
    timeoutMs?: number;
    /** Extra header lines when (re)starting the pack log file. */
    logHeader?: readonly string[];
    scope?: CatalogueExtractScope;
  } = {},
): Promise<void> {
  const { command, args, prelude } = await resolveCatalogueExtractCommand(
    target,
    {
      scope: options.scope,
    },
  );
  const timeoutMs =
    options.timeoutMs ??
    catalogueExtractTimeoutMs(target, options.scope ?? "inventory");
  const root = repoRoot();

  const { appendCatalogueExtractLog, beginCatalogueExtractLog } =
    await import("@/lib/admin/catalogueExtractLog");
  await beginCatalogueExtractLog(target, options.logHeader ?? []);

  // Serialize disk writes so rapid lines are not interleaved / dropped.
  let logChain: Promise<void> = Promise.resolve();
  const onLog = (line: string) => {
    options.onLog?.(line);
    logChain = logChain
      .then(() => appendCatalogueExtractLog(target, line))
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
    await logChain.catch(() => undefined);
  }
}
