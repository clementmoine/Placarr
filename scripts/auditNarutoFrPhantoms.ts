/**
 * FR Carddass numbers that are site-HTML only (never paper) but still surface.
 *
 *   pnpm exec tsx scripts/auditNarutoFrPhantoms.ts
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { dataRoot } from "@/lib/runtimeData";
import {
  narutoCuratedSourcesDir,
  officialFrChecklistSetsForNumber,
} from "@/providers/naruto/narutocarddass/identity";
import { listNarutoSetPrints } from "@/providers/naruto/narutocarddass/search";

function padCollector(raw: string): string {
  const m = /^(ni|te|ta|cl)(\d+)$/i.exec(raw.trim());
  if (!m) return raw.toLowerCase();
  return `${m[1]!.toLowerCase()}${String(Number(m[2])).padStart(4, "0")}`;
}

function hasFrArt(disk: string): boolean {
  const cardsRoot = path.join(dataRoot(), "naruto/carddass/cards");
  const short = disk.replace(/^(ni|te|ta|cl)0+(\d)/, "$1$2");
  for (const set of ["s1", "s2", "s3", "s4", "s5", "s6", "promo"]) {
    for (const id of [disk, short]) {
      const d = path.join(cardsRoot, "fr", set, id);
      if (!existsSync(d)) continue;
      if (
        readdirSync(d).some((f) => /^art\./i.test(f) || /^thumb\./i.test(f))
      ) {
        return true;
      }
    }
  }
  return false;
}

function main(): void {
  const dir = narutoCuratedSourcesDir();
  const html = JSON.parse(
    readFileSync(path.join(dir, "carddass-html-refs.json"), "utf8"),
  ) as { refs?: Record<string, string[]> };
  const checklist = JSON.parse(
    readFileSync(path.join(dir, "carddass-fr-checklist.json"), "utf8"),
  ) as { absentFromPrintedChecklists?: { cards?: string[] } };
  const absent = new Set(
    (checklist.absentFromPrintedChecklists?.cards ?? []).map(padCollector),
  );

  const phantoms: string[] = [];
  for (const raw of Object.keys(html.refs ?? {})) {
    const disk = padCollector(raw);
    if (officialFrChecklistSetsForNumber(disk).length) continue;
    if (absent.has(disk)) continue;
    if (hasFrArt(disk)) continue;
    phantoms.push(disk);
  }
  phantoms.sort();

  console.log(
    `FR phantoms (html-ref, not paper checklist, no FR art): ${phantoms.length}`,
  );
  console.log(phantoms.join(", "));

  const phantomSet = new Set(phantoms);
  const leaking: string[] = [];
  for (const setId of ["s1", "s2", "s3", "s4", "s5", "s6"]) {
    for (const row of listNarutoSetPrints({ setId, language: "fr" })) {
      const m = /^naruto:s\d+-([a-z]+\d+)$/i.exec(row.printKey);
      if (!m) continue;
      const disk = padCollector(m[1]!);
      if (!phantomSet.has(disk)) continue;
      leaking.push(
        `${row.printKey} ${row.reference} «${row.title}» printed=${row.printed}`,
      );
    }
  }
  console.log(`\nLeaking into FR checklists: ${leaking.length}`);
  for (const line of leaking) console.log(`  ${line}`);
  if (leaking.length) process.exitCode = 1;
}

main();
