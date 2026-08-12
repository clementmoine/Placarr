import { mkdir, stat } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";

import { NextRequest, NextResponse } from "next/server";

import { requireAdmin } from "@/lib/auth";
import { consumeRateLimit } from "@/lib/http/rateLimit";
import { dataRoot } from "@/lib/runtimeData";
import { isAllowedAdbEndpoint } from "@/lib/webadb/adbEndpoint";

const ALL_PACKS = ["lorcana", "pokemon"] as const;
type PackId = (typeof ALL_PACKS)[number];

const PACKAGE_BY_PACK: Record<PackId, string> = {
  lorcana: "com.ravensburger.disney.lorcana",
  pokemon: "com.pokemon.pokemontcgl",
};

const STAGING_BY_PACK: Record<PackId, string> = {
  lorcana: "lorcana/staging",
  pokemon: "pokemon/staging",
};

const MUMU_DEFAULT = "127.0.0.1:7555";

function runAdb(
  args: string[],
  timeoutMs = 120_000,
): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn("adb", args, { stdio: ["ignore", "pipe", "pipe"] });
    const out: Buffer[] = [];
    const err: Buffer[] = [];
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`adb timed out: adb ${args.join(" ")}`));
    }, timeoutMs);
    child.stdout.on("data", (chunk: Buffer) => out.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => err.push(chunk));
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({
        code: code ?? 1,
        stdout: Buffer.concat(out).toString("utf8"),
        stderr: Buffer.concat(err).toString("utf8"),
      });
    });
  });
}

function parsePmPath(text: string): string[] {
  const paths: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    const match = line.trim().match(/^package:(.+)$/i);
    if (match?.[1]) paths.push(match[1].trim());
  }
  return [...new Set(paths)];
}

function parseDevices(text: string): { serial: string; state: string }[] {
  const rows: { serial: string; state: string }[] = [];
  for (const line of text.split(/\r?\n/).slice(1)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const [serial, state] = trimmed.split(/\s+/);
    if (serial && state) rows.push({ serial, state });
  }
  return rows;
}

function isPackId(value: string): value is PackId {
  return (ALL_PACKS as readonly string[]).includes(value);
}

function resolvePacks(body: {
  pack?: string;
  packs?: string[];
}): PackId[] | null {
  if (Array.isArray(body.packs) && body.packs.length > 0) {
    const packs = [...new Set(body.packs.map((p) => String(p).trim()))];
    if (!packs.every(isPackId)) return null;
    return packs;
  }
  if (body.pack) {
    const pack = String(body.pack).trim();
    if (!isPackId(pack)) return null;
    return [pack];
  }
  return [...ALL_PACKS];
}

function hintForPack(
  pack: PackId,
  saved: { name: string; path: string }[],
): string {
  if (pack === "lorcana") {
    const preferred =
      saved.find((file) => file.name.toLowerCase() === "base.apk") ??
      saved.find((file) =>
        file.name.toLowerCase().includes("unitydataassetpack"),
      ) ??
      saved[0];
    return `pnpm foil:lorcana -- --providers lorcanamobile --apk ${preferred?.path ?? "data/lorcana/staging/apks/base.apk"}  # fusionne aussi les splits du même dossier`;
  }
  return "pnpm foil:pokemon  # CDN principal ; APK = secours schéma";
}

/** List `adb devices` for the admin picker. */
export async function GET() {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  try {
    const result = await runAdb(["devices"], 15_000);
    if (result.code !== 0) {
      return NextResponse.json(
        {
          error: result.stderr || "adb devices failed",
          hint: "Install platform-tools and ensure `adb` is on PATH.",
        },
        { status: 500 },
      );
    }
    return NextResponse.json({
      devices: parseDevices(result.stdout),
      mumuDefault: MUMU_DEFAULT,
      packs: ALL_PACKS,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : String(error),
        hint: "adb not found on the machine running Next (pnpm dev host).",
      },
      { status: 500 },
    );
  }
}

type PackOutcome = {
  pack: PackId;
  packageId: string;
  status: "saved" | "missing" | "error";
  saved: { name: string; bytes: number; path: string }[];
  error?: string;
};

/**
 * Browser UX → Next (same host as MuMu) → `adb connect` + pull APKs.
 * Default: both Lorcana + TCG Live — skip packs that are not installed.
 */
export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  const throttle = consumeRateLimit(`foil-apk-adb:${auth.user.id}`, {
    limit: 6,
    windowMs: 60_000,
  });
  if (!throttle.allowed) {
    return NextResponse.json({ error: "Too many pulls" }, { status: 429 });
  }

  const body = (await req.json()) as {
    pack?: string;
    packs?: string[];
    serial?: string;
    connect?: boolean;
  };
  const packs = resolvePacks(body);
  const serial = String(body.serial || MUMU_DEFAULT).trim();
  if (!packs) {
    return NextResponse.json(
      { error: "packs must be lorcana and/or pokemon" },
      { status: 400 },
    );
  }
  if (!isAllowedAdbEndpoint(serial)) {
    return NextResponse.json(
      { error: "serial/host not allowed (localhost or private LAN only)" },
      { status: 400 },
    );
  }

  const log: string[] = [];
  const outcomes: PackOutcome[] = [];

  try {
    if (body.connect !== false && serial.includes(":")) {
      log.push(`adb connect ${serial}`);
      const connected = await runAdb(["connect", serial], 20_000);
      log.push((connected.stdout || connected.stderr).trim());
    }

    for (const pack of packs) {
      const packageId = PACKAGE_BY_PACK[pack];
      log.push(`── ${pack} (${packageId})`);
      log.push(`adb -s ${serial} shell pm path ${packageId}`);
      const pathsResult = await runAdb(
        ["-s", serial, "shell", "pm", "path", packageId],
        30_000,
      );
      const remotePaths = parsePmPath(pathsResult.stdout);
      if (remotePaths.length === 0) {
        const detail = (
          pathsResult.stderr ||
          pathsResult.stdout ||
          "not installed"
        ).trim();
        log.push(`skip: ${detail}`);
        outcomes.push({
          pack,
          packageId,
          status: "missing",
          saved: [],
          error: detail || `Package not installed: ${packageId}`,
        });
        continue;
      }

      const staging = STAGING_BY_PACK[pack];
      const destDir = path.join(dataRoot(), staging, "apks");
      await mkdir(destDir, { recursive: true });

      const saved: { name: string; bytes: number; path: string }[] = [];
      let pullError: string | null = null;
      for (const remote of remotePaths) {
        const fileName = path.basename(remote) || "base.apk";
        const dest = path.join(destDir, fileName);
        log.push(`adb pull ${remote} → ${dest}`);
        const pulled = await runAdb(
          ["-s", serial, "pull", remote, dest],
          300_000,
        );
        if (pulled.code !== 0) {
          pullError = pulled.stderr || `pull failed: ${remote}`;
          log.push(`error: ${pullError}`);
          break;
        }
        const fileStat = await stat(dest);
        saved.push({
          name: fileName,
          bytes: fileStat.size,
          path: `data/${staging}/apks/${fileName}`,
        });
      }

      if (pullError) {
        outcomes.push({
          pack,
          packageId,
          status: "error",
          saved,
          error: pullError,
        });
        continue;
      }

      outcomes.push({ pack, packageId, status: "saved", saved });
    }

    const saved = outcomes.flatMap((outcome) => outcome.saved);
    const anySaved = outcomes.some((outcome) => outcome.status === "saved");
    if (!anySaved) {
      return NextResponse.json(
        {
          error: "Aucun des packs demandés n’est installé sur l’appareil",
          packs: outcomes,
          saved: [],
          log,
        },
        { status: 404 },
      );
    }

    const hints = outcomes
      .filter((outcome) => outcome.status === "saved")
      .map((outcome) => hintForPack(outcome.pack, outcome.saved));

    return NextResponse.json({
      ok: true,
      serial,
      packs: outcomes,
      saved,
      log,
      hint: hints.join("\n"),
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : String(error),
        packs: outcomes,
        log,
      },
      { status: 500 },
    );
  }
}
