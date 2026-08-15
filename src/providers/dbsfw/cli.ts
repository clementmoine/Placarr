#!/usr/bin/env tsx
/**
 * Dragon Ball Super Card Game Fusion World — Bandai fw/en cardlist → local index.
 *
 *   pnpm dbs:fw
 *   pnpm dbs:fw -- --limit 2
 *   pnpm dbs:fw -- --offline
 */
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  DBSCARDS_SITES,
} from "@/providers/shared/dbscards/list";
import { scrapeDbscardsIndex } from "@/providers/shared/dbscards/scrapeList";

import {
  DBSCARDS_LIST_FOR,
  DBS_FW_FACE_LANGS,
  fetchDbsFwFaces,
} from "./fetchFaces";
import { DBS_FW_PACK_ID } from "./indexStore";

import { ensureDbsFwCuratedAssets } from "./installCurated";
import { scrapeDbsFwCardlist } from "./scrapeCardlist";

const STEPS = ["scrape", "dbscards", "faces"] as const;
type Step = (typeof STEPS)[number];
/** Everything but a local re-range needs the network. */
const ONLINE = new Set<Step>(["scrape", "dbscards", "faces"]);

function argValueFrom(
  argv: readonly string[],
  name: string,
): string | undefined {
  const idx = argv.indexOf(name);
  if (idx < 0) return undefined;
  return argv[idx + 1];
}

function argListFrom(argv: readonly string[], name: string): string[] {
  return (argValueFrom(argv, name) ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export function selectDbsFwSteps(argv: readonly string[]): Step[] {
  const only = argListFrom(argv, "--only");
  const skip = new Set(argListFrom(argv, "--skip"));
  const offline = argv.includes("--offline");
  const base = only.length
    ? STEPS.filter((step) => only.includes(step))
    : [...STEPS];
  return base.filter(
    (step) => !skip.has(step) && !(offline && ONLINE.has(step)),
  );
}

export async function runDbsFwPackPipeline(
  argv: readonly string[] = process.argv,
): Promise<void> {
  const dryRun = argv.includes("--dry-run");
  const force = argv.includes("--force");
  const steps = selectDbsFwSteps(argv);
  console.log(
    `── DBS Fusion World — étapes : ${steps.join(" → ") || "(curated only)"}`,
  );

  console.log(`── curated sync${dryRun ? " (dry run)" : ""}`);
  await ensureDbsFwCuratedAssets({ dryRun, force });

  const langs = argListFrom(argv, "--langs").filter((l) =>
    (DBS_FW_FACE_LANGS as readonly string[]).includes(l),
  );

  for (const step of steps) {
    if (step === "dbscards") {
      /*
        Fusion World lives on `fw.dbscards.fr`, same software as Masters. One
        request per thirty cards gives the real face URLs this pack has never
        had — it shipped with no local image at all.
      */
      /*
        Their list locales, not ours: dbscards files the Japanese printing under
        `ja` where we file it under `asia-en`, the locale Bandai names it in.
        `--langs` selects our locales, so it is translated here.
      */
      const listLangs = (langs.length ? langs : DBS_FW_FACE_LANGS).map(
        (l) => DBSCARDS_LIST_FOR[l] ?? l,
      );
      for (const lang of listLangs) {
        const result = await scrapeDbscardsIndex({
          packId: DBS_FW_PACK_ID,
          site: DBSCARDS_SITES.fusion,
          lang,
          delayMs: argValueFrom(argv, "--delay")
            ? Number(argValueFrom(argv, "--delay"))
            : undefined,
          onProgress: (page, total) => {
            if (page % 20 === 0) {
              console.log(`   dbscards fw ${lang} — page ${page}, ${total} cartes`);
            }
          },
        });
        console.log(
          `── dbscards fw ${lang} : ${result.cards} cartes sur ${result.pages} pages ` +
            `(${result.withBack} avec verso)`,
        );
      }
    }
    if (step === "faces") {
      const result = await fetchDbsFwFaces({
        force,
        ...(langs.length ? { langs } : {}),
        ...(argValueFrom(argv, "--limit")
          ? { limit: Number(argValueFrom(argv, "--limit")) }
          : {}),
        ...(argValueFrom(argv, "--delay")
          ? { delayMs: Number(argValueFrom(argv, "--delay")) }
          : {}),
      });
      console.log(
        `── fw faces : ok=${result.ok} skip=${result.skip} miss=${result.miss} fail=${result.fail}`,
      );
    }
    if (step === "scrape") {
      await scrapeDbsFwCardlist({
        force,
        limit: argValueFrom(argv, "--limit")
          ? Number(argValueFrom(argv, "--limit"))
          : undefined,
        delayMs: argValueFrom(argv, "--delay")
          ? Number(argValueFrom(argv, "--delay"))
          : undefined,
      });
    }
  }
}

const thisFile = fileURLToPath(import.meta.url);
export const DBS_FW_CLI_PATH = thisFile;
const invoked = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (invoked === thisFile) {
  runDbsFwPackPipeline(process.argv).catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
