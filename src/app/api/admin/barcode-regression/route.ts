import { NextRequest, NextResponse } from "next/server";

import { requireAdmin } from "@/lib/auth";
import {
  DEFAULT_BARCODE_REGRESSION_CASES,
  type BarcodeRegressionCase,
  type BarcodeRegressionExpectation,
} from "@/lib/barcodeRegressionCases";

type BarcodeRegressionAssertion = {
  label: string;
  expected: unknown;
  received: unknown;
  passed: boolean;
};

type BarcodeRegressionRun = {
  case: BarcodeRegressionCase;
  passed: boolean;
  status: number;
  durationMs: number;
  received: {
    cleanName: string;
    platformKey: string | null;
    shelfType: string | null;
    provider: string | null;
    matchesCount: number;
    topConfidence: number | null;
    suggestions: string[];
  };
  assertions: BarcodeRegressionAssertion[];
  error?: string;
};

function normalizeText(value: unknown): string {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function assertEqual(
  label: string,
  expected: unknown,
  received: unknown,
): BarcodeRegressionAssertion {
  return {
    label,
    expected,
    received,
    passed: normalizeText(expected) === normalizeText(received),
  };
}

function assertIncludes(
  label: string,
  expected: string,
  received: string,
): BarcodeRegressionAssertion {
  return {
    label,
    expected,
    received,
    passed: normalizeText(received).includes(normalizeText(expected)),
  };
}

function assertNotIncludes(
  label: string,
  expected: string,
  received: string,
): BarcodeRegressionAssertion {
  return {
    label,
    expected,
    received,
    passed: !normalizeText(received).includes(normalizeText(expected)),
  };
}

function evaluateCase(
  testCase: BarcodeRegressionCase,
  data: any,
): BarcodeRegressionAssertion[] {
  const expected: BarcodeRegressionExpectation = testCase.expected || {};
  const suggestions = Array.isArray(data?.suggestions) ? data.suggestions : [];
  const suggestionsText = suggestions.join(" | ");
  const matches = Array.isArray(data?.matches) ? data.matches : [];
  const topConfidence =
    typeof matches[0]?.confidence === "number" ? matches[0].confidence : null;
  const assertions: BarcodeRegressionAssertion[] = [];

  if (expected.cleanName !== undefined) {
    assertions.push(assertEqual("cleanName", expected.cleanName, data?.cleanName));
  }

  for (const value of expected.cleanNameIncludes || []) {
    assertions.push(assertIncludes("cleanNameIncludes", value, data?.cleanName));
  }

  if (expected.platformKey !== undefined) {
    assertions.push(
      assertEqual("platformKey", expected.platformKey, data?.platformKey || null),
    );
  }

  if (expected.shelfType !== undefined) {
    assertions.push(assertEqual("shelfType", expected.shelfType, data?.shelfType));
  }

  if (expected.maxMatches !== undefined) {
    assertions.push({
      label: "maxMatches",
      expected: `<= ${expected.maxMatches}`,
      received: matches.length,
      passed: matches.length <= expected.maxMatches,
    });
  }

  if (expected.minConfidence !== undefined) {
    assertions.push({
      label: "minConfidence",
      expected: `>= ${expected.minConfidence}`,
      received: topConfidence,
      passed:
        typeof topConfidence === "number" &&
        topConfidence >= expected.minConfidence,
    });
  }

  for (const value of expected.suggestionsInclude || []) {
    assertions.push(assertIncludes("suggestionsInclude", value, suggestionsText));
  }

  for (const value of expected.suggestionsExclude || []) {
    assertions.push(assertNotIncludes("suggestionsExclude", value, suggestionsText));
  }

  const provider = String(data?.provider || "");
  for (const value of expected.providerIncludes || []) {
    assertions.push(assertIncludes("providerIncludes", value, provider));
  }

  return assertions;
}

function normalizeCases(body: any): BarcodeRegressionCase[] {
  if (Array.isArray(body?.cases) && body.cases.length > 0) {
    return body.cases;
  }

  if (Array.isArray(body?.barcodes) && body.barcodes.length > 0) {
    return body.barcodes.map((barcode: string, index: number) => ({
      id: `batch-${index + 1}`,
      label: barcode,
      barcode,
      type: body.type,
      expected: {},
    }));
  }

  return DEFAULT_BARCODE_REGRESSION_CASES;
}

async function runCase(
  req: NextRequest,
  testCase: BarcodeRegressionCase,
  refresh: boolean,
): Promise<BarcodeRegressionRun> {
  const startedAt = Date.now();
  const url = new URL("/api/barcode", req.nextUrl.origin);
  url.searchParams.set("q", testCase.barcode);
  if (testCase.type) url.searchParams.set("type", testCase.type);
  if (refresh) url.searchParams.set("refresh", "1");

  try {
    const response = await fetch(url, {
      cache: "no-store",
      headers: { Accept: "application/json" },
    });
    const data = await response.json();
    const assertions = evaluateCase(testCase, data);
    const matches = Array.isArray(data?.matches) ? data.matches : [];
    const suggestions = Array.isArray(data?.suggestions) ? data.suggestions : [];

    return {
      case: testCase,
      passed:
        response.ok &&
        (assertions.length > 0
          ? assertions.every((assertion) => assertion.passed)
          : Boolean(data?.cleanName && matches.length > 0)),
      status: response.status,
      durationMs: Date.now() - startedAt,
      received: {
        cleanName: data?.cleanName || "",
        platformKey: data?.platformKey || null,
        shelfType: data?.shelfType || null,
        provider: data?.provider || null,
        matchesCount: matches.length,
        topConfidence:
          typeof matches[0]?.confidence === "number"
            ? matches[0].confidence
            : null,
        suggestions,
      },
      assertions,
    };
  } catch (error) {
    return {
      case: testCase,
      passed: false,
      status: 0,
      durationMs: Date.now() - startedAt,
      received: {
        cleanName: "",
        platformKey: null,
        shelfType: null,
        provider: null,
        matchesCount: 0,
        topConfidence: null,
        suggestions: [],
      },
      assertions: [],
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

async function runWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = [];
  let nextIndex = 0;

  async function runWorker() {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      results[currentIndex] = await worker(items[currentIndex]);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, runWorker),
  );

  return results;
}

export async function GET() {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  return NextResponse.json({ cases: DEFAULT_BARCODE_REGRESSION_CASES });
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  try {
    const body = await req.json().catch(() => ({}));
    const cases = normalizeCases(body);
    const refresh = body.refresh !== false;
    const concurrency = Math.max(
      1,
      Math.min(4, Number(body.concurrency || 3) || 3),
    );
    const startedAt = Date.now();

    const results = await runWithConcurrency(cases, concurrency, (testCase) =>
      runCase(req, testCase, refresh),
    );
    const passedCount = results.filter((result) => result.passed).length;

    return NextResponse.json({
      passed: passedCount === results.length,
      passedCount,
      failedCount: results.length - passedCount,
      totalCount: results.length,
      durationMs: Date.now() - startedAt,
      refresh,
      results,
    });
  } catch (error) {
    console.error("[Barcode Regression] Failed to run batch:", error);
    return NextResponse.json(
      { error: "Failed to run barcode regression batch" },
      { status: 500 },
    );
  }
}
