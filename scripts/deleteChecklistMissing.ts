/**
 * Supprime les items qui matchent une check-list exportée « non possédés ».
 *
 * Usage :
 *   pnpm tsx scripts/deleteChecklistMissing.ts path/to.md           # dry-run
 *   pnpm tsx scripts/deleteChecklistMissing.ts path/to.md --apply
 *
 * Ou stdin :
 *   pnpm tsx scripts/deleteChecklistMissing.ts --apply < missing.md
 */
import "dotenv/config";
import { readFileSync } from "node:fs";

import { mintNarutoPrintKey } from "@/providers/naruto/narutocarddass/identity";
import { prisma } from "@/lib/db/prisma";

const apply = process.argv.includes("--apply");
/** Args after the script path (tsx puts script at argv[1] or argv[2]). */
const pathArg = (() => {
  const scriptIdx = process.argv.findIndex((arg) =>
    arg.includes("deleteChecklistMissing"),
  );
  const rest = process.argv
    .slice(scriptIdx >= 0 ? scriptIdx + 1 : 2)
    .filter((arg) => !arg.startsWith("-"));
  return rest[0];
})();

type MissingRow = {
  setCode: string;
  printKey: string;
  /** `holo` si « (foil) », sinon toute finition (normal / null / holo). */
  foilOnly: boolean;
  label: string;
};

const SET_HEADING =
  /^##\s+(S\d+|PROMO|TEMPETE|PRERELEASE)\b/i;

function setCodeFromHeading(heading: string): string | null {
  const m = /^##\s+(\S+)/i.exec(heading);
  if (!m) return null;
  const token = m[1]!.toUpperCase();
  if (token === "PROMO") return "promo";
  if (token === "TEMPETE") return "tempete";
  if (token === "PRERELEASE") return "prerelease";
  const series = /^S(\d+)$/i.exec(token);
  if (series) return `s${Number(series[1])}`;
  return token.toLowerCase();
}

/**
 * `- [ ] NI-019 · prerelease · Naruto` / `TA-005 · … (foil)` / `TE-030-cdf · …`
 */
function parseLine(setCode: string, line: string): MissingRow | null {
  // `[ ]` / `[x]` / `[...]` (export partiel)
  const m = /^[-*]\s+\[[^\]]*\]\s+(.+)$/.exec(line.trim());
  if (!m) return null;
  const body = m[1]!.trim();
  const foilOnly = /\(foil\)\s*$/i.test(body);
  const withoutFoil = body.replace(/\s*\(foil\)\s*$/i, "").trim();
  const parts = withoutFoil.split(/\s·\s/).map((p) => p.trim());
  if (parts.length === 0) return null;
  const ref = parts[0]!;
  // `NI-019 · prerelease · Name` → grouping ; `TE-030-cdf` déjà dans ref
  const groupingHint = parts[1]?.toLowerCase() ?? "";
  const refGrouping = /^(prerelease|promo|cdf)$/i.test(groupingHint)
    ? groupingHint
    : null;
  // NI-019 → ni019 ; TE-030-cdf → te030-cdf ; N-1363 → n1363
  const dash = ref
    .toLowerCase()
    .replace(/\s+/g, "")
    .match(/^([a-z]+)-(\d+)(?:-(.+))?$/i);
  let collector: string;
  if (dash) {
    const embedded = dash[3] ?? refGrouping;
    collector = embedded
      ? `${dash[1]}${dash[2]}-${embedded}`
      : `${dash[1]}${dash[2]}`;
  } else {
    const base = ref.toLowerCase().replace(/[\s-]/g, "");
    collector = refGrouping ? `${base}-${refGrouping}` : base;
  }
  const printKey = mintNarutoPrintKey(collector);
  if (!printKey) return null;
  return { setCode, printKey, foilOnly, label: body };
}

export function parseMissingChecklist(markdown: string): MissingRow[] {
  const rows: MissingRow[] = [];
  let setCode: string | null = null;
  for (const line of markdown.split(/\r?\n/)) {
    if (SET_HEADING.test(line.trim())) {
      setCode = setCodeFromHeading(line.trim());
      continue;
    }
    if (!setCode) continue;
    const row = parseLine(setCode, line);
    if (row) rows.push(row);
  }
  return rows;
}

async function main(): Promise<void> {
  const markdown = pathArg
    ? readFileSync(pathArg, "utf8")
    : await new Promise<string>((resolve, reject) => {
        const chunks: Buffer[] = [];
        process.stdin.on("data", (c) => chunks.push(c));
        process.stdin.on("end", () =>
          resolve(Buffer.concat(chunks).toString("utf8")),
        );
        process.stdin.on("error", reject);
        if (process.stdin.isTTY) {
          reject(
            new Error(
              "Passer un fichier markdown ou piper la check-list sur stdin",
            ),
          );
        }
      });

  const rows = parseMissingChecklist(markdown);
  console.log(`lignes « manquantes » parsées : ${rows.length}`);

  const toDelete: {
    id: string;
    printKey: string;
    setCode: string | null;
    variant: string | null;
    name: string;
    label: string;
  }[] = [];
  const notFound: string[] = [];

  for (const row of rows) {
    const items = await prisma.item.findMany({
      where: {
        printKey: row.printKey,
        setCode: row.setCode,
        ...(row.foilOnly
          ? { variant: { equals: "holo", mode: "insensitive" } }
          : {
              OR: [
                { variant: null },
                { variant: "" },
                { variant: { equals: "normal", mode: "insensitive" } },
              ],
            }),
      },
      select: {
        id: true,
        printKey: true,
        setCode: true,
        variant: true,
        name: true,
      },
    });
    if (items.length === 0) {
      notFound.push(`${row.setCode} ${row.label}`);
      continue;
    }
    for (const item of items) {
      toDelete.push({ ...item, label: row.label });
    }
  }

  // Dédup ids (NI-239 listé 2×)
  const byId = new Map(toDelete.map((row) => [row.id, row]));
  const unique = [...byId.values()];

  console.log(`items à supprimer : ${unique.length}`);
  for (const row of unique.slice(0, 40)) {
    console.log(
      `  ${row.setCode} ${row.printKey} [${row.variant ?? "∅"}] — ${row.name}`,
    );
  }
  if (unique.length > 40) console.log(`  … +${unique.length - 40}`);
  console.log(`déjà absents (ok) : ${notFound.length}`);

  if (!apply) {
    console.log("\n(dry-run — relancer avec --apply)");
    return;
  }

  const result = await prisma.item.deleteMany({
    where: { id: { in: unique.map((row) => row.id) } },
  });
  console.log(`\nsupprimés : ${result.count}`);
}

void main().finally(() => prisma.$disconnect());
