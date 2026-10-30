#!/usr/bin/env npx tsx
/**
 * Dev supervisor for `backgroundWorker.ts`.
 *
 * `tsx watch` can leave its parent alive with no child — the process tree
 * looks fine while jobs sit `pending` ("waiting for worker…") forever. Prod
 * already guards that failure mode in `init.sh` (container dies if a worker
 * dies). Dev needs the same contract: the supervising process must keep a
 * live worker or restart it.
 *
 * - Spawn `tsx scripts/backgroundWorker.ts` with inherited stdio / env.
 * - Restart on unexpected exit (backoff, reset after a healthy run).
 * - On source changes under `scripts/` + `src/`, SIGTERM the child (so it
 *   releases locks) then respawn — same exclude set as the old `tsx watch`.
 *
 * Usage (via package.json):
 *   pnpm worker:dev
 *   pnpm worker:icollect:dev
 */

import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  nextBackoffMs,
  shouldIgnoreWatchPath,
  shouldResetFailureStreak,
} from "./superviseDevWorkerLogic";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const WORKER_ENTRY = path.join(ROOT, "scripts", "backgroundWorker.ts");
const TSX_BIN = path.join(ROOT, "node_modules", ".bin", "tsx");

const RELOAD_DEBOUNCE_MS = 400;
const WATCH_ROOTS = ["scripts", "src"] as const;

let child: ChildProcess | null = null;
let childStartedAt = 0;
let failureStreak = 0;
let stopping = false;
/** Kill-for-reload in flight — exit handler respawns without crash backoff. */
let reloadPending = false;
let reloadTimer: ReturnType<typeof setTimeout> | null = null;
let restartTimer: ReturnType<typeof setTimeout> | null = null;

function log(message: string): void {
  console.info(`[supervise-worker] ${message}`);
}

function clearRestartTimer(): void {
  if (restartTimer) {
    clearTimeout(restartTimer);
    restartTimer = null;
  }
}

function killChild(signal: NodeJS.Signals = "SIGTERM"): void {
  if (!child || child.killed) return;
  try {
    child.kill(signal);
  } catch {
    // already gone
  }
}

function scheduleSpawn(delayMs: number): void {
  clearRestartTimer();
  restartTimer = setTimeout(() => {
    restartTimer = null;
    spawnWorker();
  }, delayMs);
}

function spawnWorker(): void {
  if (stopping) return;
  if (child) return;

  log(`spawn ${path.relative(ROOT, WORKER_ENTRY)}`);
  childStartedAt = Date.now();
  const proc = spawn(TSX_BIN, [WORKER_ENTRY], {
    cwd: ROOT,
    env: process.env,
    stdio: "inherit",
  });
  child = proc;

  proc.on("exit", (code, signal) => {
    if (child === proc) child = null;
    const livedMs = Date.now() - childStartedAt;
    if (stopping) {
      log(`child stopped (code=${code ?? "null"} signal=${signal ?? "null"})`);
      return;
    }

    if (reloadPending) {
      reloadPending = false;
      failureStreak = 0;
      log(
        `child exited for reload (code=${code ?? "null"} signal=${signal ?? "null"})`,
      );
      scheduleSpawn(0);
      return;
    }

    if (shouldResetFailureStreak(livedMs)) {
      failureStreak = 0;
    }

    const delay = nextBackoffMs(failureStreak);
    failureStreak += 1;
    log(
      `child exited (code=${code ?? "null"} signal=${signal ?? "null"} lived=${Math.round(livedMs / 1000)}s) — restart in ${delay}ms`,
    );
    scheduleSpawn(delay);
  });

  proc.on("error", (error) => {
    if (child === proc) child = null;
    log(`child spawn error: ${error.message}`);
    if (!stopping) {
      const delay = nextBackoffMs(failureStreak);
      failureStreak += 1;
      scheduleSpawn(delay);
    }
  });
}

function requestReload(reason: string): void {
  if (stopping) return;
  if (reloadTimer) clearTimeout(reloadTimer);
  reloadTimer = setTimeout(() => {
    reloadTimer = null;
    log(`reload (${reason})`);
    failureStreak = 0;
    clearRestartTimer();
    if (child) {
      reloadPending = true;
      killChild("SIGTERM");
      return;
    }
    spawnWorker();
  }, RELOAD_DEBOUNCE_MS);
}

function startWatchers(): void {
  for (const rel of WATCH_ROOTS) {
    const abs = path.join(ROOT, rel);
    if (!fs.existsSync(abs)) continue;
    try {
      const watcher = fs.watch(abs, { recursive: true }, (_event, filename) => {
        if (!filename) return;
        const full = path.join(abs, filename);
        if (shouldIgnoreWatchPath(full)) return;
        requestReload(path.relative(ROOT, full));
      });
      watcher.on("error", (error) => {
        log(`watch error on ${rel}: ${error.message}`);
      });
    } catch (error) {
      log(
        `watch unavailable for ${rel}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}

async function shutdown(signal: string): Promise<void> {
  if (stopping) return;
  stopping = true;
  log(`shutting down on ${signal}`);
  if (reloadTimer) clearTimeout(reloadTimer);
  clearRestartTimer();
  const proc = child;
  if (!proc) return;
  killChild("SIGTERM");
  await new Promise<void>((resolve) => {
    const timeout = setTimeout(() => {
      killChild("SIGKILL");
      resolve();
    }, 5_000);
    proc.once("exit", () => {
      clearTimeout(timeout);
      resolve();
    });
  });
}

function main(): void {
  if (!fs.existsSync(TSX_BIN)) {
    console.error(`[supervise-worker] missing tsx binary at ${TSX_BIN}`);
    process.exit(1);
  }
  if (!fs.existsSync(WORKER_ENTRY)) {
    console.error(`[supervise-worker] missing worker entry ${WORKER_ENTRY}`);
    process.exit(1);
  }

  log("starting (restart-on-exit + source reload)");
  startWatchers();
  spawnWorker();

  const onSignal = (signal: NodeJS.Signals) => {
    void shutdown(signal).finally(() => process.exit(0));
  };
  process.on("SIGINT", () => onSignal("SIGINT"));
  process.on("SIGTERM", () => onSignal("SIGTERM"));
}

main();
