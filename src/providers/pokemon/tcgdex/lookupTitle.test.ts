import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

import { describe, expect, it } from "vitest";

import {
  loadTcgdexNameLookup,
  resolveTcgdexIndexName,
  tcgdexSetCandidatesForLiveStem,
} from "./lookupTitle";

function writePrintsDb(
  rows: Array<{
    setId: string;
    localId: string;
    lang: string;
    name: string;
  }>,
): string {
  const tmp = mkdtempSync(path.join(os.tmpdir(), "placarr-tcgdex-lookup-"));
  const dbPath = path.join(tmp, "prints.sqlite");
  const db = new DatabaseSync(dbPath);
  db.exec(`
    CREATE TABLE prints (
      print_key TEXT PRIMARY KEY,
      set_id TEXT NOT NULL,
      local_id TEXT NOT NULL,
      provider_id TEXT NOT NULL,
      image_base_url TEXT
    );
    CREATE TABLE print_titles (
      print_key TEXT NOT NULL,
      lang TEXT NOT NULL,
      name TEXT NOT NULL,
      set_name TEXT,
      serie_name TEXT,
      PRIMARY KEY (print_key, lang)
    );
  `);
  const insP = db.prepare(
    `INSERT INTO prints (print_key, set_id, local_id, provider_id, image_base_url)
     VALUES (?, ?, ?, ?, NULL)`,
  );
  const insT = db.prepare(
    `INSERT INTO print_titles (print_key, lang, name, set_name, serie_name)
     VALUES (?, ?, ?, NULL, NULL)`,
  );
  for (const row of rows) {
    const pk = `${row.setId}-${row.localId}`;
    insP.run(pk, row.setId, row.localId, "tcgdex");
    insT.run(pk, row.lang, row.name);
  }
  db.close();
  return dbPath;
}

describe("tcgdexSetCandidatesForLiveStem", () => {
  it("keeps McDo year identity and adds -fr for French", () => {
    expect(tcgdexSetCandidatesForLiveStem("2011bw", "en")).toEqual(["2011bw"]);
    expect(tcgdexSetCandidatesForLiveStem("2019sm", "fr")).toEqual([
      "2019sm",
      "2019sm-fr",
    ]);
  });

  it("maps Black Star Live stems to TCGdex promo sets", () => {
    expect(tcgdexSetCandidatesForLiveStem("bwbsp", "en")).toEqual([
      "bwbsp",
      "bwp",
    ]);
    expect(tcgdexSetCandidatesForLiveStem("svbsp", "fr")).toEqual([
      "svbsp",
      "svp",
    ]);
  });
});

describe("resolveTcgdexIndexName", () => {
  it("names McDo folders via numeric local_id (001 ↔ 1)", () => {
    const lookup = loadTcgdexNameLookup(
      writePrintsDb([
        { setId: "2011bw", localId: "1", lang: "en", name: "Snivy" },
      ]),
    );
    expect(resolveTcgdexIndexName("2011bw_en_001", lookup)).toEqual({
      kind: "fallback",
      name: "Snivy",
      catalogue: "show",
      from: "tcgdex",
    });
  });

  it("resolves BSP aliases (bwbsp → bwp BW29)", () => {
    const lookup = loadTcgdexNameLookup(
      writePrintsDb([
        { setId: "bwp", localId: "BW29", lang: "en", name: "Reshiram" },
      ]),
    );
    expect(resolveTcgdexIndexName("bwbsp_en_029", lookup)).toEqual({
      kind: "fallback",
      name: "Reshiram",
      catalogue: "show",
      from: "tcgdex",
    });
  });

  it("falls back to EN when want-lang missing", () => {
    const lookup = loadTcgdexNameLookup(
      writePrintsDb([
        { setId: "2011bw", localId: "1", lang: "en", name: "Snivy" },
      ]),
    );
    expect(resolveTcgdexIndexName("2011bw_fr_001", lookup)).toEqual({
      kind: "fallback",
      name: "Snivy",
      catalogue: "show",
      from: "en",
    });
  });

  it("soft-empty when sqlite is missing", () => {
    const lookup = loadTcgdexNameLookup(
      path.join(os.tmpdir(), "placarr-no-prints.sqlite"),
    );
    expect(lookup.bySetNum.size).toBe(0);
    expect(resolveTcgdexIndexName("2011bw_en_001", lookup)).toBeNull();
  });
});
