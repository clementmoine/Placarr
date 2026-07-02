import { spawnSync } from "node:child_process";

import { DEFAULT_BARCODE_REGRESSION_CASES } from "../src/lib/barcode/lookup/regressionCases";

const delayMs = 4_000;

async function main() {
  for (
    let index = 0;
    index < DEFAULT_BARCODE_REGRESSION_CASES.length;
    index++
  ) {
    const testCase = DEFAULT_BARCODE_REGRESSION_CASES[index];
    if (index > 0) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }

    console.log(
      `[record-all] ${index + 1}/${DEFAULT_BARCODE_REGRESSION_CASES.length} ${testCase.id}`,
    );

    const result = spawnSync(
      "pnpm",
      ["exec", "vitest", "run", "src/services/barcode/resolver.fresh.test.ts"],
      {
        stdio: "inherit",
        env: {
          ...process.env,
          RECORD: "1",
          BARCODE_RECORD_SLIM: "1",
          RECORD_CASE_ID: testCase.id,
        },
      },
    );

    if (result.status !== 0) {
      process.exit(result.status ?? 1);
    }
  }
}

void main();
