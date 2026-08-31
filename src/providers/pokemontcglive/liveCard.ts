/**
 * Open a card in TCG Live on the running emulator, from its name.
 *
 * ``tsx …/liveCard.ts "Tropius" --tilt``
 *
 * Why this exists: the playroom's WebGL side renders the publisher's own GLES3
 * fragments, so it should match the app pixel for pixel. Checking that by hand
 * means finding the card in a 194-card set, remembering whether the reverse or
 * the standard print carries the foil, and holding a tilt while screenshotting.
 * This does all three, and prints what our own dump believes about the card so
 * a mismatch is obvious.
 *
 * Resolution is ours (SQLite). Navigation prefers Frida uGUI (`SelectExpansion`
 * on `CollectionCarouselObjects` — see docs/handoff-live-frida-nav.md); falls
 * back to `--set-steps` + grid geometry. After capture, the shot is checked
 * against the dumped `cardTex` so a wrong card fails loudly.
 *
 * Deep links / exported intents were ruled out (OAuth-only `tpcitcgapp://`,
 * single UnityPlayerActivity). Do not re-check.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { existsSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

import { dataRoot } from "@/lib/runtimeData";

import { verifyAgainstCardTex } from "./liveCardVerify";
import {
  fridaCurrentSet,
  fridaFindLabel,
  fridaGotoCard,
  fridaNavAvailable,
  fridaSelectSet,
  liveSetIdFromBundle,
  seriesLabelFr,
} from "./liveNavFrida";

/** Where `adb` lives when it is not on PATH (Android Studio default). */
const ADB_CANDIDATES = [
  process.env.ADB_PATH,
  "adb",
  `${process.env.HOME}/Library/Android/sdk/platform-tools/adb`,
];

/*
  Grid geometry, measured on the 1080×1920 emulator.

  Three columns, and the first row sits below the set carousel. Everything is a
  ratio of the screen so a different device size still lands on the right tile —
  the layout is proportional, the pixel values are not.
*/
const GRID = {
  cols: 3,
  colX: [0.169, 0.5, 0.828],
  firstRowY: 0.404,
  rowPitch: 0.185,
  /** Rows fully visible below the carousel before a scroll is needed. */
  visibleRows: 2,
};

const CARD_DEX = { x: 0.176, y: 0.781 };
const CAROUSEL_NEXT = { x: 0.958, y: 0.203 };
/** Series dropdown bar (e.g. « MÉGA-ÉVOLUTION ▲ »). */
const SERIES_BAR = { x: 0.5, y: 0.185 };

function adb(): string {
  for (const candidate of ADB_CANDIDATES) {
    if (!candidate) continue;
    try {
      execFileSync(candidate, ["version"], { stdio: "ignore" });
      return candidate;
    } catch {
      /* try the next */
    }
  }
  throw new Error("adb not found — set ADB_PATH or add platform-tools to PATH");
}

function sh(bin: string, args: string[]): string {
  return execFileSync(bin, args, {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
}

type Screen = { w: number; h: number };

function screenSize(bin: string): Screen {
  const out = sh(bin, ["shell", "wm", "size"]);
  const m = /(\d+)x(\d+)/.exec(out);
  if (!m) throw new Error(`cannot read screen size: ${out.trim()}`);
  return { w: Number(m[1]), h: Number(m[2]) };
}

function tap(bin: string, s: Screen, fx: number, fy: number): void {
  sh(bin, [
    "shell",
    "input",
    "tap",
    String(Math.round(fx * s.w)),
    String(Math.round(fy * s.h)),
  ]);
}

function tapPx(bin: string, x: number, y: number): void {
  sh(bin, [
    "shell",
    "input",
    "tap",
    String(Math.round(x)),
    String(Math.round(y)),
  ]);
}

function sleep(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

type Match = {
  bundle: string;
  set: string;
  num: string;
  lang: string;
  name: string;
  variants: { variant: string; shader: string }[];
};

function resolve(name: string, lang: string): Match[] {
  const db = new DatabaseSync(
    path.join(dataRoot(), "pokemon", "catalog.sqlite"),
    { readOnly: true },
  );
  /*
    Names come from whichever locale was dumped, stems get normalised after.

    The identity table is 25 773 rows of `de` against 643 of `fr` — the dump was
    taken on a German client — so filtering on `lang` finds almost nothing, and
    the stem is rewritten to the locale the caller wants afterwards
    (`me5_de_001` → `me5_fr_001`), which is what the playroom does too.

    `name_fr` is **not** French on those rows. It holds the localised name of
    the dump's own locale: `bw10_de_001` reads `Gehweiher`, the German for
    Surskit, where French would be `Arakdo` — a string that appears nowhere in
    the table. Only the 643 `fr` rows carry real French. `name_en` is genuinely
    English throughout, so an English name matches everywhere and a French one
    matches only the 40 sets dumped in French. Re-dumping on a French client is
    what would close that.
  */
  const like = `%${name.trim()}%`;
  const rows = db
    .prepare(
      `SELECT DISTINCT bundle_stem AS bundle, live_set AS liveSet, num,
              lang, name_fr AS nameFr, name_en AS nameEn, collector_num AS num2
         FROM live_cards
        WHERE name_fr LIKE ? COLLATE NOCASE OR name_en LIKE ? COLLATE NOCASE
        ORDER BY live_set, num
        LIMIT 40`,
    )
    .all(like, like) as Record<string, unknown>[];

  const out: Match[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    const raw = String(row.bundle ?? "");
    if (!raw) continue;
    const bundle = raw.replace(/_[a-z]{2}_(\d+)$/i, `_${lang}_$1`);
    if (seen.has(bundle)) continue;
    seen.add(bundle);
    const variants = db
      .prepare(
        `SELECT variant, shader FROM card_foil WHERE bundle_id = ?
          ORDER BY CASE variant WHEN 'ph' THEN 0 ELSE 1 END`,
      )
      .all(bundle) as Record<string, unknown>[];
    out.push({
      bundle,
      set: String(row.liveSet ?? ""),
      num: String(row.num2 ?? row.num ?? ""),
      lang: String(row.lang ?? ""),
      name: String(row.nameFr || row.nameEn || "?"),
      variants: variants.map((v) => ({
        variant: String(v.variant ?? ""),
        shader: String(v.shader ?? ""),
      })),
    });
  }
  db.close();
  return out;
}

function parseArgs(argv: string[]) {
  const args = {
    name: "",
    /** Direct Live asset-bundle id (`me5_fr_001`) — skips name lookup. */
    bundle: "",
    lang: "fr",
    /** Prefer this Live set id (`me5` / `ME5`) when several name hits exist. */
    set: "",
    tilt: false,
    setSteps: 0,
    out: "",
    dryRun: false,
    noFrida: false,
    noVerify: false,
    prefer: "" as "" | "ph",
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === "--tilt") args.tilt = true;
    else if (a === "--dry-run") args.dryRun = true;
    else if (a === "--no-frida") args.noFrida = true;
    else if (a === "--no-verify") args.noVerify = true;
    else if (a === "--lang") args.lang = argv[++i] ?? "fr";
    else if (a === "--set") args.set = argv[++i] ?? "";
    else if (a === "--bundle") args.bundle = argv[++i] ?? "";
    else if (a === "--prefer") {
      const v = argv[++i] ?? "";
      args.prefer = v === "ph" ? "ph" : "";
    } else if (a === "--set-steps") args.setSteps = Number(argv[++i] ?? 0);
    else if (a === "--out") args.out = argv[++i] ?? "";
    else if (!a.startsWith("--")) args.name = args.name ? args.name : a;
  }
  return args;
}

/** Pick the best name hit: explicit --set, else Frida current/pool, else first. */
function pickTarget(
  matches: Match[],
  preferSet: string,
  fridaHint: { setId?: string; pool?: string[] } | null,
): Match {
  const norm = (s: string) => s.replace(/_/g, "-").toUpperCase();
  if (preferSet) {
    const want = norm(preferSet);
    const hit = matches.find(
      (m) => norm(m.set) === want || norm(m.bundle.split("_")[0]!) === want,
    );
    if (hit) return hit;
    console.log(
      `  --set ${preferSet} : aucun hit, repli sur ${matches[0]!.bundle}`,
    );
  }
  if (fridaHint?.setId) {
    const cur = norm(fridaHint.setId);
    const hit = matches.find((m) => norm(m.set) === cur);
    if (hit) return hit;
  }
  if (fridaHint?.pool?.length) {
    const pool = new Set(fridaHint.pool.map(norm));
    const hit = matches.find((m) => pool.has(norm(m.set)));
    if (hit) return hit;
  }
  return matches[0]!;
}

/** Open the right set: Frida SelectExpansion, else carousel taps. */
function navigateToSet(
  bin: string,
  screen: Screen,
  setId: string,
  setSteps: number,
  useFrida: boolean,
): void {
  if (useFrida && fridaNavAvailable()) {
    let result = fridaSelectSet(setId);
    if (!result.ok) {
      const series = seriesLabelFr(setId);
      console.log(
        `  Frida select ${setId} manqué (${result.error ?? "pool"}) — série « ${series || "?"} »…`,
      );
      if (series) {
        tap(bin, screen, SERIES_BAR.x, SERIES_BAR.y);
        sleep(1500);
        const hit = fridaFindLabel(series);
        if (hit) {
          console.log(`  Tap série [${hit.x},${hit.y}] « ${hit.text} »`);
          tapPx(bin, hit.x, hit.y);
          sleep(2500);
          result = fridaSelectSet(setId);
        }
      }
    }
    if (result.ok) {
      console.log(`  Frida → set ${result.setId}`);
      sleep(2500);
      return;
    }
    console.log(
      `  Frida toujours KO (${result.error ?? "?"})${
        result.pool?.length ? ` pool=[${result.pool.join(",")}]` : ""
      } — repli --set-steps`,
    );
  }

  for (let i = 0; i < setSteps; i++) {
    tap(bin, screen, CAROUSEL_NEXT.x, CAROUSEL_NEXT.y);
    sleep(1200);
  }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (!args.name && !args.bundle) {
    console.error(
      'usage: tsx src/providers/pokemontcglive/liveCard.ts "<nom>" | --bundle me5_fr_001 [--prefer ph] [--set me5] [--lang fr] [--tilt] [--out shot.png]',
    );
    process.exitCode = 2;
    return;
  }

  let target: Match;
  if (args.bundle) {
    const stem = args.bundle;
    const set = stem.split("_")[0] ?? "";
    const num = stem.split("_")[2] ?? "";
    target = {
      bundle: stem,
      set,
      num,
      lang: args.lang,
      name: stem,
      variants: args.prefer === "ph" ? [{ variant: "ph", shader: "?" }] : [],
    };
    console.log(`Cible bundle : ${stem}`);
  } else {
    const matches = resolve(args.name, args.lang);
    if (matches.length === 0) {
      console.error(`Aucune carte « ${args.name} » en ${args.lang}.`);
      process.exitCode = 1;
      return;
    }

    console.log(`${matches.length} correspondance(s) pour « ${args.name} » :`);
    for (const m of matches.slice(0, 10)) {
      const foils = m.variants.map((v) => `${v.variant}=${v.shader}`).join(" ");
      console.log(
        `  ${m.bundle.padEnd(18)} ${m.name.padEnd(20)} set=${m.set.padEnd(8)} n°${m.num.padStart(3)}  ${foils}`,
      );
    }

    const useFridaHint = !args.noFrida && fridaNavAvailable() && !args.set;
    const cur = useFridaHint ? fridaCurrentSet() : null;
    target = pickTarget(
      matches,
      args.set,
      cur ? { setId: cur.loadedSetId || cur.setId } : null,
    );
  }

  const foil = target.variants.find((v) => v.shader && v.shader !== "NonFoil");
  const setId = liveSetIdFromBundle(target.bundle, target.set);
  const prefer: "" | "ph" =
    args.prefer === "ph" || foil?.variant === "ph" ? "ph" : "";
  console.log(
    `\nCible : ${target.name} (${target.bundle}) set=${setId} n°${target.num}` +
      (prefer === "ph" ? " — prefer ph" : "") +
      (foil && prefer !== "ph"
        ? ` — foil « ${foil.variant} » (${foil.shader})`
        : ""),
  );
  if (args.dryRun) return;

  const useFrida = !args.noFrida && fridaNavAvailable();
  const bin = adb();
  const screen = screenSize(bin);
  console.log(
    `\nadb: ${bin}  écran ${screen.w}×${screen.h}` +
      (useFrida ? "  frida: oui" : "  frida: non"),
  );

  /*
    Instant path: openFast (CardDatabase → SetupLargeCard → OpenOverlay).
    No Card-Dex navigation when Frida scratch + Live are up.
  */
  let opened = false;
  if (useFrida) {
    const t0 = Date.now();
    const goto = fridaGotoCard(target.bundle, prefer);
    const ms = goto.ms ?? Date.now() - t0;
    if (goto.ok) {
      console.log(
        `  Frida ${goto.via ?? "goto"} ${goto.bundle}` +
          (goto.name ? ` « ${goto.name} »` : "") +
          (goto.cardId ? ` [${goto.cardId}]` : "") +
          ` (${ms} ms)`,
      );
      opened = true;
      sleep(800);
    } else {
      console.log(`  Frida goto KO (${goto.error ?? "?"}) — repli…`);
    }
  }

  if (!opened && !useFrida) {
    tap(bin, screen, CARD_DEX.x, CARD_DEX.y);
    sleep(4000);
    navigateToSet(bin, screen, setId, args.setSteps, false);
  }

  if (!opened) {
    const index = Math.max(0, Number(target.num.replace(/\D/g, "")) - 1);
    const row = Math.floor(index / GRID.cols);
    const col = index % GRID.cols;
    for (let i = 0; i < Math.max(0, row - GRID.visibleRows); i++) {
      sh(bin, [
        "shell",
        "input",
        "swipe",
        String(Math.round(0.5 * screen.w)),
        String(Math.round(0.7 * screen.h)),
        String(Math.round(0.5 * screen.w)),
        String(Math.round(0.7 * screen.h - GRID.rowPitch * screen.h)),
        "300",
      ]);
      sleep(500);
    }

    const y = GRID.firstRowY + Math.min(row, GRID.visibleRows) * GRID.rowPitch;
    tap(bin, screen, GRID.colX[col]!, y);
    sleep(3500);
  }

  if (args.tilt) {
    /*
      Hold the tilt while the screenshot is taken.

      `input swipe` releases before the capture, and the card springs back — the
      foil is only visible mid-gesture. DOWN / MOVE / capture / UP freezes it.
    */
    const cx = Math.round(0.5 * screen.w);
    const cy = Math.round(0.42 * screen.h);
    sh(bin, ["shell", "input", "motionevent", "DOWN", String(cx), String(cy)]);
    sleep(600);
    sh(bin, [
      "shell",
      "input",
      "motionevent",
      "MOVE",
      String(Math.round(cx * 1.35)),
      String(Math.round(cy * 0.75)),
    ]);
    sleep(800);
  }

  const out =
    args.out ||
    path.join(process.cwd(), "data", "logs", `live-${target.bundle}.png`);
  const png = execFileSync(bin, ["exec-out", "screencap", "-p"], {
    maxBuffer: 64 * 1024 * 1024,
  });
  if (args.tilt) {
    const cx = Math.round(0.5 * screen.w);
    const cy = Math.round(0.42 * screen.h);
    sh(bin, [
      "shell",
      "input",
      "motionevent",
      "UP",
      String(Math.round(cx * 1.35)),
      String(Math.round(cy * 0.75)),
    ]);
  }
  mkdirSync(path.dirname(out), { recursive: true });
  writeFileSync(out, png);
  console.log(`Capture → ${out}`);

  if (!args.noVerify) {
    const verdict = await verifyAgainstCardTex(png, target.bundle);
    console.log(`Vérif cardTex : ${verdict.detail}`);
    if (!verdict.ok) process.exitCode = 1;
  }
  if (!existsSync(out)) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
