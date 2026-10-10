/**
 * punk-records harvest revalidation (no live GitHub — mocked httpGet).
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/http/httpClient", () => ({
  httpGet: vi.fn(),
}));

import { httpGet } from "@/lib/http/httpClient";

import { harvestPunkRecords, PUNK_RECORDS_LOCALES } from "./punkRecords";

const mockedGet = vi.mocked(httpGet);

describe("harvestPunkRecords", () => {
  const dirs: string[] = [];

  afterEach(() => {
    mockedGet.mockReset();
    while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true });
  });

  it("re-GETs staging even when a file already exists, and skips write if unchanged", async () => {
    const staging = mkdtempSync(path.join(os.tmpdir(), "op-punk-"));
    dirs.push(staging);
    const payload = {
      "OP01-001": {
        card_id: "OP01-001",
        name: "Monkey D. Luffy",
        rarity: "Leader",
        img_url: "https://example.test/OP01-001.webp",
      },
    };
    const body = `${JSON.stringify(payload)}\n`;
    writeFileSync(path.join(staging, "fr.cards_by_id.json"), body, "utf8");
    writeFileSync(path.join(staging, "en.cards_by_id.json"), body, "utf8");

    mockedGet.mockResolvedValue({
      data: payload,
      status: 200,
      statusText: "OK",
      headers: {},
      config: {} as never,
    });

    const result = await harvestPunkRecords({ stagingDir: staging });
    expect(mockedGet).toHaveBeenCalled();
    // fr + en already on disk and unchanged → skip; other locales written.
    expect(result.skip).toBe(2);
    expect(result.ok).toBe(PUNK_RECORDS_LOCALES.length - 2);
    expect(result.cards).toBe(PUNK_RECORDS_LOCALES.length);
  });

  it("writes when upstream gained a card", async () => {
    const staging = mkdtempSync(path.join(os.tmpdir(), "op-punk-"));
    dirs.push(staging);
    const prior = {
      "OP01-001": {
        card_id: "OP01-001",
        name: "Monkey D. Luffy",
        rarity: "Leader",
        img_url: "https://example.test/OP01-001.webp",
      },
    };
    writeFileSync(
      path.join(staging, "fr.cards_by_id.json"),
      `${JSON.stringify(prior)}\n`,
      "utf8",
    );
    writeFileSync(
      path.join(staging, "en.cards_by_id.json"),
      `${JSON.stringify(prior)}\n`,
      "utf8",
    );

    const next = {
      ...prior,
      "OP01-002": {
        card_id: "OP01-002",
        name: "Roronoa Zoro",
        rarity: "Rare",
        img_url: "https://example.test/OP01-002.webp",
      },
    };
    mockedGet.mockResolvedValue({
      data: next,
      status: 200,
      statusText: "OK",
      headers: {},
      config: {} as never,
    });

    const result = await harvestPunkRecords({ stagingDir: staging });
    expect(result.ok).toBe(PUNK_RECORDS_LOCALES.length);
    expect(result.skip).toBe(0);
    expect(result.cards).toBe(PUNK_RECORDS_LOCALES.length * 2);
    const fr = JSON.parse(
      readFileSync(path.join(staging, "fr.cards_by_id.json"), "utf8"),
    ) as Record<string, unknown>;
    expect(Object.keys(fr)).toContain("OP01-002");
  });
});
