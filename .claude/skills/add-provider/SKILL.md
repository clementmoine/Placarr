---
name: add-provider
description: Add or extend a Placarr metadata / price / retailer provider under src/providers/ (books, games, films, music, board games, marketplaces). Use when wiring a new source, mapping more fields from an existing one, or fixing a provider that under-exploits its source. For a new trading-card game line use add-tcg-line instead.
---

# Add or extend a provider

Full reference (read the phase you are in): `docs/provider_integration_checklist.md`.
Related: `docs/provider_supply_modes.md` (local catalogues), `docs/provider_external_links.md` (deep links + price refresh URL reuse).
Worked examples: `src/providers/bedetheque/` (`defineProvider` pilot), `src/providers/okkazeo/` (fiche + noisy listings in one connector).

## Golden rules

- A provider may hardcode what is specific to **its own** API/format. It never injects app-global logic (language, shelf type, provider privilege). It *declares* what it offers; the engine ranks.
- No `providerId === "<id>"` branch anywhere outside `src/providers/`. The engine reaches providers via `providersForType` / capability coverage.
- Every extracted value keeps its role and context (reference fiche vs listing vs offer vs gallery vs user photo, + language/region). Keep noisy observations, mark them weak — never drop them.
- Barcode is trusted only after a gtin/id confirmation on the page; explicit mismatch = rejection evidence. Confident false positives are the worst bug in this app.
- HTTP only via `@/lib/http` (or `ctx.http` from `defineProvider((ctx) => spec)`). Read tokens lazily at call time, never at import.
- No per-provider merge weight, no provider-level `canonical`/trust flag used to make a field win, no new app-global word lists.

## Steps

1. **Recon (before code)** — hit every live endpoint (search by name, by barcode, detail, sub-resources), save raw captures, prefer JSON-LD / OG / JSON API over HTML. Produce a field inventory: titles, aliases + their language, images + role + language, facts, prices, external ids. Anything not mapped later must be a conscious skip.
2. **Declare** `info.types`, all `info.capabilities`, `defaultLanguage`, `auth`. Prefer `defineProvider(spec)` (`src/providers/shared/defineProvider.ts`, Zod-validated manifest, default healthCheck + testHandler). Hand-roll a `ProviderModule` only for advanced cases (local TCG, multi-hook pricing, exotic auth).
3. **Implement** `fetch.ts` (pure parsers) → `resolver.ts` (`MetadataResult`: `regionalTitles` for every localized name, `aliases`, `attachments` with role + language, `facts[]`, `externalIds`, title-confidence guard). Barcode tasks gated by `BARCODE_TYPES` **including `"generic"`**. `mappingProbe`.
4. **Retailers / comparators**: `provenance.sourceUrl` = public deep link (Wayback copy if dead, never a homepage); offers pass through `sanitizePublicCitationUrl`; `refreshBarcodePriceOffers` reads `ctx.providerProductUrls` before seeking.
5. **Register** in `src/core/catalog/registry.ts` (one import + one line). If barcode-keyed, wire `BarcodeLookupPayload` in both the typed branches **and** the generic branch.
6. **Tests** — parser tests on a real captured fixture (keep fixtures < 25 MB, `tests/fixtureSize.test.ts`), barcode confirmation guard, external-link test, then update registry guards (`providerBarcode.test.ts`, `providerBootstrap.test.ts`, `providerMappingAudit.test.ts`).
7. **Verify live** — call the resolver once against the real source, diff extracted vs raw capture field by field, check health in the admin and `pnpm providers:audit:mapping` (unused keys are leads).

## Done when

- `pnpm exec tsc --noEmit`, `pnpm lint`, `pnpm test` are green.
- Every Phase-0 field is mapped or skipped with a reason; the anti-checklist at the end of `docs/provider_integration_checklist.md` has no hit.
- If title matching or barcode resolution behaviour changed, bump `BARCODE_CACHE_VERSION` in `src/core/identify/titleUtils.ts` with a comment line explaining why.
- New API key → documented in `.env.example` with its sign-up URL; missing key must leave the provider `blocked`, not crashing.
