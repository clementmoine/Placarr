import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { describe, expect, it } from "vitest";

import { loadCuratedDocumentsJson } from "./loadCuratedDocumentsJson";

describe("loadCuratedDocumentsJson", () => {
  it("loads documents.json next to the module URL", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "placarr-curated-"));
    writeFileSync(
      path.join(dir, "documents.json"),
      JSON.stringify([
        { id: "a", title: "A", url: "https://example.test/a.pdf" },
      ]),
    );
    const moduleUrl = pathToFileURL(path.join(dir, "documents.ts")).href;
    expect(loadCuratedDocumentsJson(moduleUrl)).toEqual([
      { id: "a", title: "A", url: "https://example.test/a.pdf" },
    ]);
  });

  it("concatenates multiple files and skips missing ones", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "placarr-curated-"));
    writeFileSync(
      path.join(dir, "documents.json"),
      JSON.stringify([{ id: "a" }]),
    );
    writeFileSync(
      path.join(dir, "documents-checklists.json"),
      JSON.stringify([{ id: "b" }]),
    );
    const moduleUrl = pathToFileURL(path.join(dir, "documents.ts")).href;
    expect(
      loadCuratedDocumentsJson(moduleUrl, [
        "documents.json",
        "documents-checklists.json",
        "missing.json",
      ]),
    ).toEqual([{ id: "a" }, { id: "b" }]);
  });

  it("returns [] when nothing is on disk", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "placarr-curated-"));
    const moduleUrl = pathToFileURL(path.join(dir, "documents.ts")).href;
    expect(loadCuratedDocumentsJson(moduleUrl)).toEqual([]);
  });

  it("ignores non-array JSON roots", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "placarr-curated-"));
    writeFileSync(path.join(dir, "documents.json"), JSON.stringify({ no: 1 }));
    const moduleUrl = pathToFileURL(path.join(dir, "documents.ts")).href;
    expect(loadCuratedDocumentsJson(moduleUrl)).toEqual([]);
  });
});
