/**
 * One-off: rename `_crop` derivatives to `_edited`, on disk and in the database.
 *
 * The suffix used to say how the derivative was made. It now carries a crop
 * *and* a rotation, so it says what it is instead. Both sides have to move
 * together — a file renamed without its URLs is a broken cover, and a URL
 * renamed without its file is a 404.
 *
 *   pnpm tsx scripts/media/crop-to-edited.ts --dry-run
 *   pnpm tsx scripts/media/crop-to-edited.ts
 *
 * Writes a rollback manifest next to the uploads root: every file rename and
 * every column it touched, with the value it replaced.
 */

import { existsSync, readdirSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";

import { prisma } from "@/lib/db/prisma";
import { uploadsDir } from "@/lib/runtimeData";

/**
 * The derivative suffix, anchored at the end of a filename. Not a bare
 * `_crop` replace: an upload is content-hashed, but a manifest URL or a query
 * string must not be rewritten by accident.
 */
const DERIVATIVE_SUFFIX = /_crop(-[a-z0-9]+)?(\.[^.]+)$/i;

function renamed(value: string): string | null {
  const [pathPart, ...rest] = value.split(/([?#])/);
  if (!DERIVATIVE_SUFFIX.test(pathPart)) return null;
  const next = pathPart.replace(DERIVATIVE_SUFFIX, "_edited$1$2");
  return next + rest.join("");
}

type FileMove = { from: string; to: string };
type ColumnEdit = {
  model: string;
  key: string;
  id: string;
  field: string;
  from: string;
  to: string;
};

function planFileMoves(root: string): FileMove[] {
  if (!existsSync(root)) return [];
  const moves: FileMove[] = [];
  for (const name of readdirSync(root)) {
    const next = renamed(name);
    if (!next) continue;
    moves.push({ from: path.join(root, name), to: path.join(root, next) });
  }
  return moves;
}

/**
 * Every column that can hold an uploads URL. Missing one leaves a dead link.
 * `key` is the model's primary key — Author and Publisher are keyed by `name`,
 * not by an `id`.
 */
const COLUMNS = [
  { model: "item", key: "id", fields: ["imageUrl", "backgroundImageUrl"] },
  { model: "metadata", key: "id", fields: ["imageUrl", "heroImageUrl"] },
  { model: "attachment", key: "id", fields: ["url"] },
  { model: "shelf", key: "id", fields: ["imageUrl"] },
  { model: "author", key: "name", fields: ["imageUrl"] },
  { model: "publisher", key: "name", fields: ["imageUrl"] },
] as const;

async function planColumnEdits(): Promise<ColumnEdit[]> {
  const edits: ColumnEdit[] = [];
  for (const { model, key, fields } of COLUMNS) {
    for (const field of fields) {
      const delegate = (
        prisma as unknown as Record<
          string,
          {
            findMany: (args: unknown) => Promise<Record<string, unknown>[]>;
          }
        >
      )[model]!;
      const rows = await delegate.findMany({
        where: { [field]: { contains: "_crop" } },
        select: { [key]: true, [field]: true },
      });
      for (const row of rows) {
        const from = row[field];
        if (typeof from !== "string") continue;
        const to = renamed(from);
        if (!to) continue;
        edits.push({ model, key, id: String(row[key]), field, from, to });
      }
    }
  }
  return edits;
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const root = uploadsDir();

  const moves = planFileMoves(root);
  const edits = await planColumnEdits();

  console.log(
    `crop→edited — ${moves.length} file(s), ${edits.length} column value(s)` +
      `${dryRun ? " (dry-run)" : ""}`,
  );
  for (const { model, field } of COLUMNS.flatMap((c) =>
    c.fields.map((field) => ({ model: c.model, field })),
  )) {
    const n = edits.filter(
      (e) => e.model === model && e.field === field,
    ).length;
    if (n) console.log(`  ${model}.${field}: ${n}`);
  }

  if (dryRun) {
    console.log("dry-run: nothing written");
    return;
  }

  // Written before anything moves: a run that dies halfway still leaves a
  // complete plan to reverse, which a manifest written at the end would not.
  const manifest = path.join(root, "..", "crop-to-edited.rollback.json");
  writeFileSync(
    manifest,
    JSON.stringify({ at: new Date().toISOString(), moves, edits }, null, 1),
    "utf8",
  );
  console.log(`rollback manifest: ${path.resolve(manifest)}`);

  // Files first: a URL pointing at a file that is already there is momentarily
  // stale, which the extension fallback survives. The reverse is a 404.
  let renamedCount = 0;
  for (const move of moves) {
    if (existsSync(move.to)) {
      console.warn(`  skip ${path.basename(move.from)}: target already exists`);
      continue;
    }
    renameSync(move.from, move.to);
    renamedCount += 1;
  }

  for (const edit of edits) {
    const delegate = (
      prisma as unknown as Record<
        string,
        { update: (args: unknown) => Promise<unknown> }
      >
    )[edit.model]!;
    await delegate.update({
      where: { [edit.key]: edit.id },
      data: { [edit.field]: edit.to },
    });
  }

  console.log(
    `done: ${renamedCount} file(s) renamed, ${edits.length} value(s) rewritten`,
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
