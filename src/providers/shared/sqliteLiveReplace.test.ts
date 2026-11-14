import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";

import {
  replaceSqliteLiveFile,
  unlinkSqliteSidecars,
} from "./sqliteLiveReplace";

const dirs: string[] = [];

afterEach(() => {
  for (const dir of dirs.splice(0)) {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }
});

function tempDir(): string {
  const dir = mkdtempSync(path.join(tmpdir(), "placarr-sqlite-replace-"));
  dirs.push(dir);
  return dir;
}

describe("unlinkSqliteSidecars", () => {
  it("removes -wal -shm -journal next to the db path", () => {
    const dir = tempDir();
    const dbPath = path.join(dir, "catalog.sqlite");
    writeFileSync(dbPath, "live");
    writeFileSync(`${dbPath}-wal`, "wal");
    writeFileSync(`${dbPath}-shm`, "shm");
    writeFileSync(`${dbPath}-journal`, "j");
    unlinkSqliteSidecars(dbPath);
    expect(existsSync(dbPath)).toBe(true);
    expect(existsSync(`${dbPath}-wal`)).toBe(false);
    expect(existsSync(`${dbPath}-shm`)).toBe(false);
    expect(existsSync(`${dbPath}-journal`)).toBe(false);
  });
});

describe("replaceSqliteLiveFile", () => {
  it("swaps build over live and drops orphan WAL sidecars", () => {
    const dir = tempDir();
    const livePath = path.join(dir, "catalog.sqlite");
    const buildPath = path.join(dir, "catalog.sqlite.building");

    const live = new DatabaseSync(livePath);
    live.exec("PRAGMA journal_mode = WAL");
    live.exec("CREATE TABLE t (id INTEGER PRIMARY KEY); INSERT INTO t VALUES (1)");
    live.close();
    expect(existsSync(`${livePath}-wal`) || existsSync(livePath)).toBe(true);

    // Simulate leftover sidecars after a previous crashy replace.
    writeFileSync(`${livePath}-wal`, "stale-wal");
    writeFileSync(`${livePath}-shm`, "stale-shm");

    const build = new DatabaseSync(buildPath);
    build.exec("CREATE TABLE t (id INTEGER PRIMARY KEY); INSERT INTO t VALUES (2)");
    build.close();

    replaceSqliteLiveFile(livePath, buildPath);

    expect(existsSync(buildPath)).toBe(false);
    expect(existsSync(`${livePath}-wal`)).toBe(false);
    expect(existsSync(`${livePath}-shm`)).toBe(false);

    const check = new DatabaseSync(livePath, { readOnly: true });
    const row = check.prepare("SELECT id FROM t").get() as { id: number };
    check.close();
    expect(row.id).toBe(2);
  });

  it("works when live path did not exist yet", () => {
    const dir = tempDir();
    const livePath = path.join(dir, "catalog.sqlite");
    const buildPath = path.join(dir, "catalog.sqlite.tmp");
    writeFileSync(buildPath, "fresh");
    replaceSqliteLiveFile(livePath, buildPath);
    expect(readFileSync(livePath, "utf8")).toBe("fresh");
    expect(existsSync(buildPath)).toBe(false);
  });
});
