---
name: barcode-regression
description: Fix or lock a barcode → item result (wrong title, type, platform, cover, price, or a confident false positive) and add it to the regression corpus — unit case, golden-master cache case, or recorded network fixture. Use for scan / identify / enrich bugs and whenever tests under src/core/identify or tests/fixtures/barcode are involved.
---

# Barcode → item regression

Product rule: **an honest empty result is fine, a confident false positive is forbidden.** Reference: `TESTING.md`, `tests/fixtures/barcode/README.md`, "where to look" table in `docs/codebase_map.md`.

## 1. Locate the stage

| Symptom | Start in |
| ------- | -------- |
| Wrong type at scan | `src/core/identify/evidence/compile.ts`, `src/core/identify/resolver.ts` |
| Wrong platform | `src/core/identify/platformPick.ts`, `platforms/platforms.ts` |
| Metadata / cover | `src/core/enrich/fetch.ts`, `storage.ts`, `media/attachmentDisplayScore.ts` |
| Title identity (hardware, residual words) | `src/core/enrich/titles/residualIdentity.ts`, `src/core/commerce/retailer/titleMatch.ts` |
| Price | `src/core/commerce/pricing/resolver.ts`, `pricing/itemDisplay.ts` |
| Jobs stuck / refresh | `src/core/collect/jobs/workQueue.ts`, `workRunner.ts`, `pnpm worker` |

Get the real inputs first: `rawNames` from the `BarcodeCache` table or the `/api/barcode` response.

## 2. Write the failing test first (TDD)

Pick the cheapest layer that reproduces it:

1. **Unit** (pure functions, no network) — e.g. `identify/query.test.ts`, `enrich/titles/*.test.ts`, `commerce/retailer/*.test.ts`. Add a line to an `it.each` or a named `it` describing the behaviour.
2. **Golden master, Prisma mocked** — `src/core/identify/resolver.test.ts`: `makeCache({ rawNames, platformKey })` → `resolveBarcode(barcode, type)`, assert name / platform / suggestions / confidence.
3. **Fresh path, recorded network** — `src/core/identify/resolver.fresh.test.ts` replaying `tests/fixtures/barcode/<case>.json` via `tests/helpers/httpReplay.ts`.

Never encode a provider-specific or product-specific word list to make a case pass — fix the data-driven rule (consensus, corpus IDF, structured fields, provider-declared aliases).

## 3. Fix, then re-run

```bash
pnpm vitest run src/core/identify/resolver.test.ts
pnpm test
```

If matching / resolution behaviour changed, bump `BARCODE_CACHE_VERSION` in `src/core/identify/titleUtils.ts` and add a `// vNN: …` line saying why (cached scans re-resolve on read).

## Recording fixtures (needs live providers and API keys)

```bash
pnpm test:record          # subset, slim mode
pnpm test:record:one      # RECORD_CASE_ID=<case-id> to pick the case
pnpm test:record:all      # all canonical cases, one process each
```

Recording hits real APIs; only do it when asked or clearly needed. Keys are redacted automatically, the expectation is asserted before writing, bodies > 128 KB are truncated. Still read the `[record …]` log before committing — a degraded fixture locks in wrong behaviour. Fixtures stay < 25 MB (`tests/fixtureSize.test.ts`).

Live canary (manual, outside CI): admin route `src/app/api/admin/barcode-regression/route.ts`.
