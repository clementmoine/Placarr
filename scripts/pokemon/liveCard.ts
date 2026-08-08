/**
 * Open a card in TCG Live on the running emulator, from its name.
 *
 * ``pnpm foil:pokemon:live-card "Tropius" --tilt``
 *
 * Why this exists: the playroom's WebGL side renders the publisher's own GLES3
 * fragments, so it should match the app pixel for pixel. Checking that by hand
 * means finding the card in a 194-card set, remembering whether the reverse or
 * the standard print carries the foil, and holding a tilt while screenshotting.
 * This does all three, and prints what our own dump believes about the card so
 * a mismatch is obvious.
 *
 * Resolution is ours (SQLite), navigation is the app's UI. There *is* a deep
 * link scheme — `tpcitcgapp://` — but the manifest declares no host or path, so
 * routing happens inside Unity and the accepted paths are not discoverable from
 * outside. UI navigation it is.
 *
 * The set carousel is the one step this cannot derive: its order is the app's,
 * not something our dump records. Pass `--set-steps` to move it, or leave the
 * Card-Dex already on the right set — the script starts from wherever it is.
 *
 * Deep links were checked first and ruled out, so nobody re-checks: the app
 * declares `tpcitcgapp://` with no host or path, and the il2cpp metadata holds
 * exactly two literals — `tpcitcgapp://callback` and
 * `tpcitcgapp://event.googleplay`. Every routing symbol
 * (`OnDeepLinkActivated`, `ListenForSimulatedDeepLink`, `deepLinkFailed`) sits
 * inside `LoginWebFlow`. The scheme exists to receive the OAuth redirect; there
 * is no route to a card.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { existsSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

import { dataRoot } from "@/lib/runtimeData";

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
  throw new Error(
    "adb not found — set ADB_PATH or add platform-tools to PATH",
  );
}

function sh(bin: string, args: string[]): string {
  return execFileSync(bin, args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
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
    path.join(dataRoot(), "pokemon", "live-cards.sqlite"),
    { readOnly: true },
  );
  /*
    Names come from whichever locale was dumped, stems get normalised after.

    The identity table is 25 763 rows of `de` against 643 of `fr` — the dump was
    taken on a German client — but `name_fr` is populated regardless. Filtering
    on `lang` therefore finds almost nothing, while the *names* are perfectly
    usable. So: match on name in any locale, then rewrite the stem to the locale
    the caller wants (`me5_de_001` → `me5_fr_001`), which is what the playroom
    already does with these rows.
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
    lang: "fr",
    tilt: false,
    setSteps: 0,
    out: "",
    dryRun: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === "--tilt") args.tilt = true;
    else if (a === "--dry-run") args.dryRun = true;
    else if (a === "--lang") args.lang = argv[++i] ?? "fr";
    else if (a === "--set-steps") args.setSteps = Number(argv[++i] ?? 0);
    else if (a === "--out") args.out = argv[++i] ?? "";
    else if (!a.startsWith("--")) args.name = args.name ? args.name : a;
  }
  return args;
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  if (!args.name) {
    console.error(
      'usage: pnpm foil:pokemon:live-card "<nom>" [--lang fr] [--set-steps N] [--tilt] [--out shot.png]',
    );
    process.exitCode = 2;
    return;
  }

  const matches = resolve(args.name, args.lang);
  if (matches.length === 0) {
    console.error(`Aucune carte « ${args.name} » en ${args.lang}.`);
    process.exitCode = 1;
    return;
  }

  console.log(`${matches.length} correspondance(s) pour « ${args.name} » :`);
  for (const m of matches.slice(0, 10)) {
    const foils = m.variants
      .map((v) => `${v.variant}=${v.shader}`)
      .join(" ");
    console.log(
      `  ${m.bundle.padEnd(18)} ${m.name.padEnd(20)} set=${m.set.padEnd(8)} n°${m.num.padStart(3)}  ${foils}`,
    );
  }

  const target = matches[0]!;
  const foil = target.variants.find((v) => v.shader && v.shader !== "NonFoil");
  console.log(
    `\nCible : ${target.name} (${target.bundle}) n°${target.num}` +
      (foil
        ? ` — foil sur la variante « ${foil.variant} » (${foil.shader})`
        : " — aucune variante foil"),
  );
  if (foil?.variant === "ph") {
    console.log(
      "  Le foil est sur le reverse : dans la grille, c'est le second exemplaire.",
    );
  }
  if (args.dryRun) return;

  const bin = adb();
  const screen = screenSize(bin);
  console.log(`\nadb: ${bin}  écran ${screen.w}×${screen.h}`);

  // Home, then the Card-Dex.
  sh(bin, ["shell", "input", "keyevent", "KEYCODE_BACK"]);
  sleep(1200);
  tap(bin, screen, CARD_DEX.x, CARD_DEX.y);
  sleep(4000);

  for (let i = 0; i < args.setSteps; i++) {
    tap(bin, screen, CAROUSEL_NEXT.x, CAROUSEL_NEXT.y);
    sleep(1200);
  }

  /*
    Grid position from the collector number.

    The dex sorts by card number by default, and a set lists its cards in that
    order — so index = number − 1, and the row beyond the visible ones needs a
    scroll. Reverse prints sit next to their standard twin, which is why the
    caller is told above which of the two carries the foil.
  */
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
  if (!existsSync(out)) process.exitCode = 1;
}

main();
