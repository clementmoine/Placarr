import { describe, it, expect, vi, afterEach } from "vitest";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";

import {
  DEFAULT_BARCODE_REGRESSION_CASES,
  type BarcodeRegressionCase,
  type BarcodeRegressionExpectation,
} from "@/lib/barcode/lookup/regressionCases";
import { cleanCode } from "@/lib/barcode/query";
import { HttpReplay, type Interaction } from "../../../tests/helpers/httpReplay";

/**
 * Golden-master du CHEMIN FRAIS (premier scan : cache vide → providers →
 * matching → résultat), y compris les cas "je ne sais pas".
 *
 * - REPLAY (défaut) : rejoue des fixtures réseau figées → 100% déterministe.
 *   Les cas sans fixture sont ignorés (skip), la suite reste verte.
 * - RECORD=1 : appelle les vraies API une fois et écrit les fixtures.
 *     RECORD=1 BARCODE_RECORD_SLIM=1 pnpm vitest run ...
 *     RECORD_CASE_ID=mario-kart-wii pour un seul cas.
 *
 * Prisma est neutralisé (cache toujours vide, écritures no-op) pour forcer le
 * chemin frais et garantir l'identité record == replay.
 */

vi.mock("@/lib/db/prisma", () => {
  const methodProxy = new Proxy(
    {},
    {
      get(_t, method: string) {
        return async () => {
          if (typeof method === "string" && method.startsWith("find")) {
            return method.toLowerCase().includes("many") ? [] : null;
          }
          if (method === "count") return 0;
          return {};
        };
      },
    },
  );
  const prisma = new Proxy(
    {},
    {
      get(_t, prop: string) {
        if (typeof prop === "string" && prop.startsWith("$")) {
          return async (...args: unknown[]) => {
            if (prop === "$transaction" && typeof args[0] === "function") {
              return (args[0] as (p: unknown) => unknown)(prisma);
            }
            return {};
          };
        }
        return methodProxy;
      },
    },
  );
  return { prisma };
});

import { resolveBarcode } from "./resolver";

const RECORD = !!process.env.RECORD;
const RECORD_ALL = !!process.env.RECORD_ALL;
const RECORD_CASE_ID = process.env.RECORD_CASE_ID?.trim() || "";
const FIXTURES_DIR = join(process.cwd(), "tests/fixtures/barcode");

// RECORD est borné en temps par défaut (sous-ensemble) ; RECORD_ALL=1 capture
// les 22 cas canoniques en une seule passe.
const RECORD_CASE_IDS = [
  "mario-kart-wii",
  "super-mario-galaxy-wii",
  "links-crossbow-training-wii",
  "mille-sabords-boardgame-untyped",
  "catan-boardgame",
];
const RECORD_CASES = (() => {
  if (RECORD_ALL) return DEFAULT_BARCODE_REGRESSION_CASES;
  const ids = RECORD_CASE_ID ? [RECORD_CASE_ID] : RECORD_CASE_IDS;
  return DEFAULT_BARCODE_REGRESSION_CASES.filter((c) => ids.includes(c.id));
})();
const RECORD_TIMEOUT_MS =
  RECORD_CASE_ID || RECORD_CASES.length === 1 ? 900_000 : 600_000;
// En REPLAY on parcourt TOUS les cas : chaque fixture enregistrée est
// automatiquement rejouée, les autres restent skip (suite verte).
const REPLAY_CASES = DEFAULT_BARCODE_REGRESSION_CASES;

function norm(value: unknown): string {
  return String(value ?? "")
    .replace(/[\u2018\u2019\u2032]/g, "'")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

function fixturePath(id: string): string {
  return join(FIXTURES_DIR, `${id}.json`);
}

type ResolveResult = Awaited<ReturnType<typeof resolveBarcode>>;

function assertExpectation(
  res: ResolveResult,
  expected: BarcodeRegressionExpectation,
) {
  const matches = Array.isArray(res.matches) ? res.matches : [];
  const suggestionsText = (res.suggestions || []).join(" | ");
  const topConfidence =
    typeof matches[0]?.confidence === "number" ? matches[0].confidence : null;

  if (expected.cleanName !== undefined) {
    expect(norm(res.cleanName)).toBe(norm(expected.cleanName));
  }
  for (const value of expected.cleanNameIncludes || []) {
    expect(norm(res.cleanName)).toContain(norm(value));
  }
  if (expected.platformKey !== undefined) {
    expect(res.platformKey ?? null).toBe(expected.platformKey);
  }
  if (expected.shelfType !== undefined) {
    expect(norm(res.shelfType)).toBe(norm(expected.shelfType));
  }
  if (expected.maxMatches !== undefined) {
    expect(matches.length).toBeLessThanOrEqual(expected.maxMatches);
  }
  if (expected.minConfidence !== undefined) {
    expect(topConfidence).not.toBeNull();
    expect(topConfidence as number).toBeGreaterThanOrEqual(
      expected.minConfidence,
    );
  }
  for (const value of expected.suggestionsExclude || []) {
    expect(norm(suggestionsText)).not.toContain(norm(value));
  }
  for (const value of expected.providerIncludes || []) {
    expect(norm(res.provider)).toContain(norm(value));
  }
}

if (RECORD) {
  describe("RECORD — enregistrement des fixtures réseau (live)", () => {
    mkdirSync(FIXTURES_DIR, { recursive: true });
    for (const testCase of RECORD_CASES) {
      it(
        `enregistre ${testCase.id}`,
        async () => {
          const { isBarcodeRecordSlimMode } = await import(
            "@/lib/barcode/lookup/recordMode"
          );
          expect(isBarcodeRecordSlimMode()).toBe(true);

          const replay = new HttpReplay();
          replay.startRecord();
          const started = Date.now();
          let res: ResolveResult;
          try {
            res = await resolveBarcode(
              cleanCode(testCase.barcode),
              testCase.type ?? null,
              {
                refresh: true,
                platformHint:
                  testCase.expected.platformKey &&
                  typeof testCase.expected.platformKey === "string"
                    ? testCase.expected.platformKey
                    : undefined,
              },
            );
          } finally {
            await replay.flush();
            replay.stop();
          }
          const interactions = replay.getRecorded();
          assertExpectation(res, testCase.expected);
          writeFileSync(
            fixturePath(testCase.id),
            JSON.stringify({ case: testCase, interactions }, null, 2),
          );
          // eslint-disable-next-line no-console
          console.log(
            `[record ${testCase.id}] ${Date.now() - started}ms interactions=${interactions.length} cleanName=${JSON.stringify(res.cleanName)} platform=${res.platformKey} matches=${res.matches.length} provider=${res.provider}`,
          );
        },
        RECORD_TIMEOUT_MS,
      );
    }
  });
} else {
  describe("REPLAY — chemin frais déterministe (fixtures figées)", () => {
    afterEach(() => {
      delete process.env.BARCODE_RECORD_SLIM;
    });

    for (const testCase of REPLAY_CASES) {
      const path = fixturePath(testCase.id);
      const hasFixture = existsSync(path);

      it.skipIf(!hasFixture)(`${testCase.label} (${testCase.id})`, async () => {
        process.env.BARCODE_RECORD_SLIM = "1";

        const { interactions } = JSON.parse(readFileSync(path, "utf8")) as {
          case: BarcodeRegressionCase;
          interactions: Interaction[];
        };

        const replay = new HttpReplay();
        replay.startReplay(interactions);
        let res: ResolveResult;
        try {
          res = await resolveBarcode(
            cleanCode(testCase.barcode),
            testCase.type ?? null,
            {
              refresh: true,
              platformHint:
                testCase.expected.platformKey &&
                typeof testCase.expected.platformKey === "string"
                  ? testCase.expected.platformKey
                  : undefined,
            },
          );
        } finally {
          replay.stop();
        }

        const misses = replay.getMisses();
        if (misses.length > 0) {
          // eslint-disable-next-line no-console
          console.warn(
            `[replay ${testCase.id}] requêtes non couvertes:`,
            misses,
          );
        }

        assertExpectation(res, testCase.expected);
      });
    }
  });
}
