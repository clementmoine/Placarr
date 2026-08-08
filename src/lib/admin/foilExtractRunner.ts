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
import { POKEMON_LIVE_LANGS_CSV } from "@/providers/pokemontcglive/languages";

export const FOIL_EXTRACT_TARGETS = ["lorcana", "pokemon"] as const;

export type FoilExtractTarget = (typeof FOIL_EXTRACT_TARGETS)[number];

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
  return null;
}

export function isFoilExtractTarget(value: unknown): value is FoilExtractTarget {
  return normalizeFoilExtractTarget(value) != null;
}

export function foilExtractLabel(target: FoilExtractTarget): string {
  switch (target) {
    case "lorcana":
      return "Lorcana";
    case "pokemon":
      return "Pokémon";
  }
}

/** CDN scrape + extract can run well past the interactive enrich budget. */
export const FOIL_EXTRACT_TIMEOUT_MS = 40 * 60 * 1000;

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
  const dir = path.join(dataRoot(), "lorcana", "apks");
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

export async function resolveFoilExtractCommand(
  target: FoilExtractTarget,
): Promise<FoilExtractCommand> {
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
        "skip Unity: no APK under data/lorcana/apks/ (web + cards only)",
      );
    }
    return {
      command: path.join(root, "scripts/lorcana/run.sh"),
      args,
      prelude,
    };
  }
  return {
    command: path.join(root, "scripts/pokemon/run.sh"),
    // APK/config ∪ Malie inventory → CDN UnityFS; misses logged for learning.
    // ``--no-job``: worker already owns the BackgroundWorkJob; child must not
    // adoptCli (that cancels the parent job → instant ── cancelled).
    args: ["--langs", POKEMON_LIVE_LANGS_CSV, "--no-job"],
    prelude: [
      "Pokémon: inventory APK/config ∪ Malie → CDN sequential (workers=1, delay=0; misses logged)",
      `langs=${POKEMON_LIVE_LANGS_CSV}`,
    ],
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
  } = {},
): Promise<void> {
  const { command, args, prelude } = await resolveFoilExtractCommand(target);
  const timeoutMs = options.timeoutMs ?? FOIL_EXTRACT_TIMEOUT_MS;
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
      });

      const killChild = () => {
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
