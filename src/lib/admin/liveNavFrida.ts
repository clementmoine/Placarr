/**
 * Thin bridge from liveCard.ts → Frida uGUI scratch host.
 *
 * The il2cpp-bridge lives outside the repo (~/.cache/placarr-frida-ugui).
 * This module only shells out; missing scratch / Frida → null (caller falls back).
 */
import { execFileSync, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

const SCRATCH =
  process.env.FRIDA_UGUI_SCRATCH ||
  path.join(process.env.HOME || "", ".cache/placarr-frida-ugui");

const NAV_PY = path.join(SCRATCH, "nav.py");
const NAVD_PY = path.join(SCRATCH, "navd.py");
const NAVD_PORT = Number(process.env.FRIDA_NAVD_PORT || "8765");

export function fridaNavAvailable(): boolean {
  return (
    existsSync(NAV_PY) && existsSync(path.join(SCRATCH, "agent.bundle.js"))
  );
}

function navdHealthUrl(): string {
  return `http://127.0.0.1:${NAVD_PORT}/health`;
}

/** True when navd is up and Live attach looks ready. */
export function fridaNavdReady(): boolean {
  try {
    const out = execFileSync("curl", ["-sf", "-m", "1", navdHealthUrl()], {
      encoding: "utf8",
      timeout: 2_000,
    }).trim();
    const body = JSON.parse(out) as { ok?: boolean };
    return body.ok === true;
  } catch {
    return false;
  }
}

/**
 * Spawn navd if missing. Safe to call from playroom mount (fire-and-forget).
 * Do not race a cold `nav.py` attach in the same moment — wait for ready first.
 */
export function ensureFridaNavd(): { ready: boolean; started: boolean } {
  if (fridaNavdReady()) return { ready: true, started: false };
  if (!existsSync(NAVD_PY) || !fridaNavAvailable()) {
    return { ready: false, started: false };
  }
  try {
    const child = spawn("python3", [NAVD_PY, "--port", String(NAVD_PORT)], {
      detached: true,
      stdio: "ignore",
      cwd: SCRATCH,
    });
    child.unref();
  } catch {
    return { ready: false, started: false };
  }
  return { ready: false, started: true };
}

/** Spawn if needed and wait until health is green (or timeout). */
export function ensureFridaNavdReady(waitMs = 20_000): boolean {
  if (fridaNavdReady()) return true;
  ensureFridaNavd();
  const deadline = Date.now() + waitMs;
  while (Date.now() < deadline) {
    if (fridaNavdReady()) return true;
    try {
      execFileSync("sleep", ["0.35"], { timeout: 1_000 });
    } catch {
      /* ignore */
    }
  }
  return fridaNavdReady();
}

function formatNavSpawnError(error: unknown): string {
  const msg = String(error);
  if (/ETIMEDOUT|timed out/i.test(msg)) {
    return "timeout Frida (attach bloqué). Relance Live ou `python3 ~/.cache/placarr-frida-ugui/navd.py &` puis réessaie.";
  }
  return msg;
}

type NavdGotoBody = {
  ok?: boolean;
  bundle?: string;
  series?: string;
  setId?: string;
  error?: string;
  ms?: number;
  opened?: {
    owned?: number;
    error?: string;
    bundle?: string;
    name?: string;
    via?: string;
    cardId?: string;
  };
  name?: string;
};

/** Warm-path RPC — no python3 spawn, reuses navd attach. */
function navdGoto(
  bundleId: string,
  prefer: "" | "ph" | "holo" | "maxOwned",
): FridaGotoResult {
  const payload = JSON.stringify({
    method: "goto",
    args: [bundleId, prefer || ""],
  });
  const out = execFileSync(
    "curl",
    [
      "-sf",
      "-m",
      "45",
      "-H",
      "Content-Type: application/json",
      "-d",
      payload,
      `http://127.0.0.1:${NAVD_PORT}/rpc`,
    ],
    { encoding: "utf8", timeout: 50_000 },
  ).trim();
  const envelope = JSON.parse(out) as {
    ok?: boolean;
    error?: string;
    result?: NavdGotoBody;
  };
  if (!envelope.ok) {
    return { ok: false, error: envelope.error || "navd rpc failed" };
  }
  const j = envelope.result ?? {};
  return {
    ok: !!j.ok,
    bundle: j.opened?.bundle ?? j.bundle ?? bundleId,
    series: j.series,
    setId: j.setId,
    owned: j.opened?.owned,
    error: j.error ?? j.opened?.error,
    ms: j.ms,
    via: "daemon",
    name: j.name ?? j.opened?.name,
    cardId: j.opened?.cardId,
  };
}

function runNav(args: string[]): unknown {
  const out = execFileSync("python3", [NAV_PY, ...args], {
    encoding: "utf8",
    maxBuffer: 8 * 1024 * 1024,
    timeout: 60_000,
  });
  // nav.py may print multiple JSON lines (select → result + now)
  const lines = out
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  const last = lines[lines.length - 1]!;
  return JSON.parse(last);
}

/** Live set id as the carousel stores it (`ME5`, `SWSH10-5`). */
export function liveSetIdFromBundle(bundle: string, liveSet: string): string {
  const raw = (liveSet || bundle.split("_")[0] || "").trim();
  return raw.toUpperCase();
}

/**
 * Series UI label (FR) from a Live set id — for the series drawer.
 * Prefix rules from Card-Dex; outliers named explicitly.
 */
export function seriesLabelFr(setId: string): string {
  const id = setId.toUpperCase();
  if (id === "GUM") return "Écarlate et Violet"; // verify visually if needed
  if (id.startsWith("RSV") || id.startsWith("ZSV")) return "Écarlate et Violet";
  if (id.startsWith("ME")) return "Méga-Évolution";
  if (id.startsWith("SV") || id.startsWith("SVE") || id === "EC")
    return "Écarlate et Violet";
  if (id.startsWith("SWSH")) return "Épée et Bouclier";
  if (id.startsWith("SM")) return "Soleil et Lune";
  if (id.startsWith("XY")) return "XY";
  if (id.startsWith("BW")) return "Noir et Blanc";
  return "";
}

export function fridaCurrentSet(): {
  setId: string;
  loadedSetId: string;
} | null {
  if (!fridaNavAvailable()) return null;
  try {
    const v = runNav(["current"]) as {
      setId?: string;
      loadedSetId?: string;
    } | null;
    if (!v?.setId && !v?.loadedSetId) return null;
    return {
      setId: String(v.setId ?? ""),
      loadedSetId: String(v.loadedSetId ?? ""),
    };
  } catch {
    return null;
  }
}

export function fridaSelectSet(setId: string): {
  ok: boolean;
  setId?: string;
  error?: string;
  pool?: string[];
} {
  if (!fridaNavAvailable())
    return { ok: false, error: "frida scratch missing" };
  try {
    // First line is the select result; runNav returns last line (now) — parse carefully.
    const out = execFileSync("python3", [NAV_PY, "select", setId], {
      encoding: "utf8",
      maxBuffer: 8 * 1024 * 1024,
      timeout: 60_000,
    });
    const lines = out
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    const first = JSON.parse(lines[0]!) as {
      ok?: boolean;
      setId?: string;
      error?: string;
      pool?: string[];
    };
    return {
      ok: !!first.ok,
      setId: first.setId,
      error: first.error,
      pool: first.pool,
    };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

export function fridaFindLabel(substr: string): {
  text: string;
  x: number;
  y: number;
} | null {
  if (!fridaNavAvailable()) return null;
  try {
    const v = runNav(["find", substr]) as {
      text?: string;
      x?: number;
      y?: number;
    } | null;
    if (!v || v.x == null || v.y == null || v.x < 0 || v.y < 0) return null;
    return { text: String(v.text ?? ""), x: v.x, y: v.y };
  } catch {
    return null;
  }
}

/**
 * Open a Card-Dex cell by Live asset-bundle id (`me5_fr_001`).
 * Uses CardDexStackParts._assetBundleToUse + InvokeClickDelegate.
 */
export function fridaOpenCard(
  bundleId: string,
  prefer: "" | "ph" | "holo" | "maxOwned" = "",
): { ok: boolean; bundle?: string; owned?: number; error?: string } {
  if (!fridaNavAvailable())
    return { ok: false, error: "frida scratch missing" };
  try {
    const args = ["open", bundleId];
    if (prefer) {
      args.push("--prefer", prefer);
    }
    const out = execFileSync("python3", [NAV_PY, ...args], {
      encoding: "utf8",
      maxBuffer: 8 * 1024 * 1024,
      timeout: 90_000,
    });
    const lines = out
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    // Last JSON with ok field wins (after optional jump retry).
    let best: {
      ok?: boolean;
      bundle?: string;
      owned?: number;
      error?: string;
    } = {
      ok: false,
    };
    for (const line of lines) {
      try {
        const j = JSON.parse(line) as typeof best;
        if (typeof j.ok === "boolean") best = j;
      } catch {
        /* skip */
      }
    }
    return {
      ok: !!best.ok,
      bundle: best.bundle,
      owned: best.owned,
      error: best.error,
    };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

/**
 * Instant open: CardDatabase → SetupLargeCard → OpenOverlay (any screen).
 * Prefers warm navd HTTP; falls back to cold `nav.py` attach.
 */
export function fridaGotoCard(
  bundleId: string,
  prefer: "" | "ph" | "holo" | "maxOwned" = "",
): FridaGotoResult {
  if (!fridaNavAvailable())
    return { ok: false, error: "frida scratch missing" };

  // Warm path only — never cold-attach while navd is warming (Frida race).
  ensureFridaNavd();
  if (ensureFridaNavdReady(15_000)) {
    try {
      return navdGoto(bundleId, prefer);
    } catch (e) {
      return { ok: false, error: formatNavSpawnError(e) };
    }
  }
  if (fridaNavdReady() === false && ensureFridaNavd().started) {
    return {
      ok: false,
      error: "navd encore en warm attach — réessaie dans quelques secondes",
    };
  }

  try {
    const args = ["goto", bundleId];
    if (prefer) {
      args.push("--prefer", prefer);
    }
    const out = execFileSync("python3", [NAV_PY, ...args], {
      encoding: "utf8",
      maxBuffer: 8 * 1024 * 1024,
      timeout: 60_000,
    });
    const j = JSON.parse(out.trim()) as NavdGotoBody & { daemon?: boolean };
    return {
      ok: !!j.ok,
      bundle: j.opened?.bundle ?? j.bundle ?? bundleId,
      series: j.series,
      setId: j.setId,
      owned: j.opened?.owned,
      error: j.error ?? j.opened?.error,
      ms: j.ms,
      via: j.opened?.via ?? (j.daemon ? "daemon" : "cold"),
      name: j.name ?? j.opened?.name,
      cardId: j.opened?.cardId,
    };
  } catch (e) {
    const msg = formatNavSpawnError(e);
    try {
      const any = e as { stdout?: string };
      if (any.stdout) {
        const j = JSON.parse(String(any.stdout).trim()) as FridaGotoResult & {
          opened?: {
            owned?: number;
            error?: string;
            name?: string;
            via?: string;
            cardId?: string;
          };
          ms?: number;
        };
        return {
          ok: !!j.ok,
          bundle: j.bundle,
          series: j.series,
          setId: j.setId,
          owned: j.owned ?? j.opened?.owned,
          error: j.error ?? j.opened?.error ?? msg,
          ms: j.ms,
          via: j.via ?? j.opened?.via,
          name: j.name ?? j.opened?.name,
          cardId: j.cardId ?? j.opened?.cardId,
        };
      }
    } catch {
      /* fall through */
    }
    return { ok: false, error: msg };
  }
}

export type FridaGotoResult = {
  ok: boolean;
  bundle?: string;
  series?: string;
  setId?: string;
  owned?: number;
  error?: string;
  ms?: number;
  via?: string;
  name?: string;
  cardId?: string;
};
