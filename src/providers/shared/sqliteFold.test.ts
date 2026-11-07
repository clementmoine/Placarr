import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";

import { ensureSqliteFold, foldedLikePattern } from "./sqliteFold";

describe("sqliteFold", () => {
  it("matches accent-stripped LIKE against accented full_name", () => {
    const db = new DatabaseSync(":memory:");
    db.exec("CREATE TABLE t (full_name TEXT)");
    db.prepare("INSERT INTO t VALUES (?)").run("7 Épées");
    ensureSqliteFold(db);

    const rows = db
      .prepare("SELECT full_name FROM t WHERE placarr_fold(full_name) LIKE ?")
      .all(foldedLikePattern("7 epees")) as { full_name: string }[];

    expect(rows).toEqual([{ full_name: "7 Épées" }]);
  });
});
