/**
 * Sync must not redo work: an unchanged pack costs zero face decodes and
 * leaves the index file untouched; a face rewritten in place is re-hashed.
 */
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import {
  buildCardVisualIndex,
  cardVisualIndexPath,
  visualEntryKey,
} from "@/core/identify/cardVisualIndex";
import { extractCardVisualSignals } from "@/core/identify/cardVisualSignals";

import { runDataPackCardVisualIndex } from "./visualIndexStep";

vi.mock("@/core/identify/cardVisualSignals", async (importOriginal) => {
  const mod =
    await importOriginal<typeof import("@/core/identify/cardVisualSignals")>();
  return {
    ...mod,
    extractCardVisualSignals: vi.fn(mod.extractCardVisualSignals),
  };
});
const decodeSpy = vi.mocked(extractCardVisualSignals);

const PACK = "demo-incremental";
let root: string;
let prevDataDir: string | undefined;

async function face(seed: number): Promise<Buffer> {
  return sharp({
    create: {
      width: 120,
      height: 168,
      channels: 3,
      background: { r: (seed * 37) % 255, g: (seed * 91) % 255, b: 90 },
    },
  })
    .composite([
      {
        input: await sharp({
          create: {
            width: 40,
            height: 40,
            channels: 3,
            background: { r: 250 - seed * 20, g: 20, b: seed * 40 },
          },
        })
          .png()
          .toBuffer(),
        left: 20 + seed * 10,
        top: 30,
      },
    ])
    .jpeg()
    .toBuffer();
}

beforeAll(async () => {
  root = mkdtempSync(path.join(os.tmpdir(), "placarr-visual-"));
  prevDataDir = process.env.PLACARR_DATA_DIR;
  process.env.PLACARR_DATA_DIR = root;

  const packDir = path.join(root, PACK);
  mkdirSync(packDir, { recursive: true });
  const db = new DatabaseSync(path.join(packDir, "catalog.sqlite"));
  db.exec(`CREATE TABLE print_assets (print_key TEXT, lang TEXT, art TEXT)`);
  const insert = db.prepare(
    `INSERT INTO print_assets (print_key, lang, art) VALUES (?, ?, ?)`,
  );
  for (const n of [1, 2, 3]) {
    const dir = path.join(packDir, "cards", "fr", "s1", String(n));
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, "art.jpg"), await face(n));
    insert.run(`demo:s1-${n}`, "fr", "art.jpg");
  }
  db.close();
});

afterAll(() => {
  if (prevDataDir === undefined) delete process.env.PLACARR_DATA_DIR;
  else process.env.PLACARR_DATA_DIR = prevDataDir;
  rmSync(root, { recursive: true, force: true });
});

describe("runDataPackCardVisualIndex (incremental)", () => {
  it("hashes every face once, then a no-op Sync decodes nothing and rewrites nothing", async () => {
    const spy = decodeSpy;
    spy.mockClear();
    const logs: string[] = [];

    const first = await runDataPackCardVisualIndex(PACK, {
      onLog: (l) => logs.push(l),
    });
    expect(first.entries).toHaveLength(3);
    expect(first.entries.every((e) => e.fp && e.aHash && e.color)).toBe(true);
    expect(spy).toHaveBeenCalledTimes(3);
    const indexPath = cardVisualIndexPath(PACK);
    const mtime1 = statSync(indexPath).mtimeMs;
    const bytes1 = readFileSync(indexPath, "utf8");

    // Simulate a Sync that touched the catalogue without changing faces.
    const past = new Date(Date.now() - 60_000);
    utimesSync(indexPath, past, past);
    const mtimeOld = statSync(indexPath).mtimeMs;

    spy.mockClear();
    const second = await runDataPackCardVisualIndex(PACK, {
      onLog: (l) => logs.push(l),
    });
    expect(spy).not.toHaveBeenCalled();
    expect(second.entries).toEqual(first.entries);
    expect(second.builtAt).toBe(first.builtAt);
    expect(statSync(indexPath).mtimeMs).toBe(mtimeOld);
    expect(readFileSync(indexPath, "utf8")).toBe(bytes1);
    expect(logs.at(-1)).toMatch(/3 reused, 0 hashed — unchanged/);
    expect(mtime1).toBeGreaterThan(0);
  });

  it("re-hashes only a face rewritten in place under the same name", async () => {
    const spy = decodeSpy;
    const before = await runDataPackCardVisualIndex(PACK);
    spy.mockClear();

    const target = path.join(root, PACK, "cards", "fr", "s1", "2", "art.jpg");
    writeFileSync(target, await face(7));
    // Catalogue "moved" so the fast mtime gate does not short-circuit.
    const now = new Date();
    utimesSync(path.join(root, PACK, "catalog.sqlite"), now, now);
    const idx = cardVisualIndexPath(PACK);
    const past = new Date(Date.now() - 60_000);
    utimesSync(idx, past, past);

    const after = await runDataPackCardVisualIndex(PACK);
    expect(spy).toHaveBeenCalledTimes(1);
    const prev = before.entries.find((e) => e.printKey === "demo:s1-2")!;
    const next = after.entries.find((e) => e.printKey === "demo:s1-2")!;
    expect(next.fp).not.toBe(prev.fp);
    expect(next.hash === prev.hash && next.color === prev.color).toBe(false);
    for (const key of ["demo:s1-1", "demo:s1-3"]) {
      expect(after.entries.find((e) => e.printKey === key)).toEqual(
        before.entries.find((e) => e.printKey === key),
      );
    }
    expect(after.builtAt).not.toBe(before.builtAt);
  });

  it("disk walk skips faces another layout pass already indexed — before decoding", async () => {
    decodeSpy.mockClear();
    const built = await buildCardVisualIndex({
      packId: PACK,
      printGame: "demo",
      lang: "fr",
      write: false,
      prior: null,
      exclude: new Set([visualEntryKey("demo:s1-1", "fr")]),
    });
    expect(built.entries.map((e) => e.printKey).sort()).toEqual([
      "demo:s1-2",
      "demo:s1-3",
    ]);
    expect(decodeSpy).toHaveBeenCalledTimes(2);
  });

  it("indexes an attested verso beside the recto (unique back → same printKey)", async () => {
    const dir = path.join(root, PACK, "cards", "fr", "s1", "1");
    writeFileSync(path.join(dir, "back.jpg"), await face(11));
    decodeSpy.mockClear();
    const built = await buildCardVisualIndex({
      packId: PACK,
      printGame: "demo",
      lang: "fr",
      write: false,
      prior: null,
    });
    const faces = built.entries.filter((e) => e.printKey === "demo:s1-1");
    expect(faces.map((e) => e.artRel.split("/").pop()).sort()).toEqual([
      "art.jpg",
      "back.jpg",
    ]);
    expect(new Set(faces.map((e) => e.printKey))).toEqual(
      new Set(["demo:s1-1"]),
    );
  });
});
