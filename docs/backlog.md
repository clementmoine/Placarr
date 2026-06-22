# Backlog

## Unbiased, data-first field ranking

Date: 2026-06-22

Context: field ranking (title, cover, facts, description) must stop relying on
per-provider weights / name hardcodes and rank by factual *observation*
properties + cross-source consensus. Full design in
[unbiased_ranking.md](unbiased_ranking.md).

Next steps (in order):

1. **Observation model first** — `canonicalTitle` / display cover / final facts are
   outputs, not provider promises. Add typed candidates/observations with
   source-document role (reference fiche, catalog product, listing, user input),
   field role (object title, alias, listing title, cover-front, listing photo,
   structured fact), language/region, evidence signals, and usage flags. Providers
   like Okkazeo can then emit both clean fiche data and noisy announcement data.
2. **Titles first** — rank title observations by `object/catalog + locale →
   object/catalog → provider-grouped alias/edition → locale evidence →
   listing/user evidence`, then medoid-consensus, then cleanliness. Sets the
   reusable pattern.
3. **Never discard observations** — store raw/normalized observations and compute
   ranked projections with an engine version, so future ranking changes can
   re-exploit existing data without re-querying providers.
4. **De-bias** — replace `PROVIDER_METADATA_EXTENSIONS` weights +
   `isRealBoxCover`/`isSecondary` with datum properties + consensus; delete the
   `providerId === "screenscraper" ? 6 : 12` hardcode (`metadataFetch.ts`) and the
   `REAL_BOX_COVER_SOURCES` name set (`attachmentDisplayScore.ts`).
5. **Generalize** to images (perceptual-hash consensus + objective quality) and
   facts (already `applyConsensus`).
6. **Per-language data + language-agnostic search** (see
   [unbiased_ranking.md](unbiased_ranking.md) §7): keep the best projected title
   *per language* (fr/en/ja/neutral), make display order a user preference (not
   hardcoded fr-first `LOCALE_REGION_ORDER`), and match name→item against the union
   of all variants + provider-grouped aliases (`Shingeki no Kyojin` /
   `Attack on Titan` / `L'Attaque des Titans` → same item).

Companion audit of all hardcoded word lists (can we stop naming them?) in
[word_list_audit.md](word_list_audit.md): most are replaceable by consensus +
corpus-IDF + provider-declared structured fields; `displayTitleScore.ts`
over-fit (`criquet|ravageur` boost, `+1500` accents, CJK penalty) is delete-only.

Done so far (proof-of-concept): board-game anchor parity in the generic scan path,
data-derived type signal, Okkazeo provider, and a structural display-name fix
(anchor beats marketplace, no "strip Gigamic" hardcode).

## Provider-blind core + admin (enforcement guard)

Date: 2026-06-22

Invariant + full violation inventory in
[provider_agnostic_architecture.md](provider_agnostic_architecture.md) §0. Outside
`src/services/providers/`, no code may name a provider or hardcode provider/noise
lists — core **and** admin.

Next steps:

1. Add a **guard test** (scope = everything except `src/services/providers/`) that
   fails on a provider-id literal / hardcoded provider-name set / noise list, with
   current leaks seeded as a shrinking allowlist.
2. Drain the allowlist: `metadataFetch.ts` (ScreenScraper stage, PriceCharting,
   game-provider list), `attachmentDisplayScore.ts` (`REAL_BOX_COVER_SOURCES` →
   `isRealBoxCover` capability), `metadataMerge.ts`/`metadataStorage.ts` (steam/
   discogs), `confrontWithDatabase` (named provider per type), admin
   `product-teardown`/`test-provider`/`metadata-enrich`/`providers` routes.
3. Add `info.baseUrl` so each provider declares its site once (used generically by
   health/probe/admin).

## Open studies & decisions to resume

Date: 2026-06-22

Items that were explored in design discussion but are not yet code/doc-complete.
Enough context here to resume cold.

### A. Two-phase vs. decide-late identification (ADR)

A typeless home-page scan (`/api/barcode` with no `type`) runs the **generic**
branch of `runBarcodeLookups`: it fans out to *all* providers, then
`compileAllBarcodeTypeResults` + `selectBarcodeTypeResult` decide the type from the
evidence ("decide late").

- **Alternative explored**: a cheap phase-1 identification → infer candidate
  type(s) from listing signals → phase-2 query only those types' canonical sources
  (prune the fan-out).
- **Decision: keep decide-late.** It is robust against mis-typing (every type
  competes on evidence), and "barcode→item never confidently wrong" outweighs
  latency. Multi-branch resolution already exists (we compile all 5 types and
  score); the win would only be *pruning which branches we query*.
- **Residue worth doing** (the safe middle ground): let a cheap signal *gate which
  expensive canonical DBs are queried* without changing the decide-late scoring —
  see item B.

### B. Game-DB fan-out cost on typeless scans (the original 26 s)

`enrichGameBarcodeLookups` (`lib/barcode/gameLookup.ts`) calls ScreenScraper
**unconditionally** in the games/generic branches, even with no platform signal.
For a board game / book / CD this means several 8 s timeouts (~24 s of the original
26 s scan). PriceCharting name-fallback adds more.

- **Fix**: gate ScreenScraper (and the PriceCharting name-fallback) behind
  `detectedPlatform || contextPlatformKey` — only query the video-game DBs when
  there is an actual game/platform signal. Kills the timeout cascade for
  non-games; classification already protects correctness.
- **Done 2026-06-22**: `enrichGameBarcodeLookups` now skips ScreenScraper and the
  PriceCharting name fallback when no platform signal exists, with regression
  coverage in `src/lib/barcode/gameLookup.test.ts`.

### C. `confrontWithDatabase` echo → fake canonical (follow-up)

Already mitigated (compile.ts now skips the DB fallback when any anchor exists; and
`pickPreferredClusterDisplayName` drops noisy non-anchor supersets). Deeper root
remains: `confrontWithDatabase` (`services/metadataDatabase.ts`) returns the **input
unchanged** on no DB match (`return name`), so `buildDatabaseEvidence` can promote
an unconfirmed marketplace name to *canonical*. Cleaner fix: have it signal
no-match (return `null`) instead of echoing, and update the 3 callers
(`buildDatabaseEvidence`, admin `test-provider`, `metadata.ts`). Guard against
regression. Note: `confrontWithDatabase` is itself a provider-blindness leak (it
`switch`es on type to call a named provider) — folds into the §0 cleanup.
- **Done 2026-06-22**: no-match now returns `null` instead of echoing the input,
  and `buildDatabaseEvidence` has regression coverage proving a DB miss creates no
  canonical `DatabaseResolver` evidence. Remaining work: remove the type→named
  provider switch as part of the provider-blind cleanup.

### D. Display-language region order = user preference

`LOCALE_REGION_ORDER` is hardcoded fr-first. For a truly unbiased multi-locale app
it must be driven by the user's display-language preference (ties into the
per-language work, unbiased-ranking step 4). Today fr-first happens to match the
"mostly French" product, which is why it's not yet a bug — but it is a latent bias.

### E. Provider health script — keep or delete?

`scripts/providerHealth.ts` (one-off built this session) runs every module's
`healthCheck` and reports up/down — reuses existing infra, lighter than
`providerLiveAudit`/`providerRuntimeCheck` (which do real fetches). Decide: wire it
as `pnpm providers:health` (handy pre-scan check) or delete it to avoid a third
audit script. Undecided.

### F. Multi-type barcode→item regression corpus

`DEFAULT_BARCODE_REGRESSION_CASES` is 100% video games — a test-side bias. The
fresh-path golden master (`barcodeResolver.fresh.test.ts`) has **0 committed
fixtures**. Now that the BGG token works, record fixtures from a healthy-provider
env (`pnpm test:record:all`) and add representative cases per type — at minimum a
board game (Mille Sabords `3421272109517` → boardgames, clean name via
Philibert/Okkazeo), plus book / music / movie cases (user supplies trusted
barcodes). See `placarr-testing-architecture` memory + TESTING.md.

### G. Provider observation contract + TypeScript guardrails

Before widening the ranking refactor, design the TypeScript contract that forces
providers to emit exploitable observations instead of loose strings:

- discriminated unions for `TitleObservation`, `ImageObservation`,
  `FactObservation`, `AliasObservation`, `OfferObservation`;
- required provenance: provider id, source URL/stable source id when available,
  source-document role, field role, language/region when relevant, evidence
  signals, observed/cache context;
- usage metadata: display candidate, search alias strength/exclusion, evidence
  strength, debug/raw retention;
- exhaustive switches in the ranking engine so new observation kinds cannot be
  ignored silently;
- shared provider contract tests: object-level fiche data and noisy listing data
  must not be collapsed, explicit mismatches must reject, and low-ranked
  marketplace/user observations must still be retained for future reprojection.

## LaunchBox provider decision

Date: 2026-06-20

Context: LaunchBox looks like a valuable game metadata source, but the provider
currently depends on a large `Metadata.zip` dataset. It must not download,
extract, or build that index during a normal scan or metadata request.

Decision to revisit after the current reliability/performance cleanup:

- Keep LaunchBox only if we can make it genuinely fast and useful.
- Optimize it around a local/prebuilt index, not request-time work.
- Measure lookup latency, memory usage, disk footprint, and metadata value
  compared with ScreenScraper, IGDB, TheGamesDB, RAWG, and CoverProject.
- Consider a compact generated index keyed by normalized title/platform,
  optional admin/background index build, and clear UI/status for whether the
  provider is ready.
- If it cannot be made fast and reliable enough, remove the provider fully
  instead of keeping unused code around.

Current guardrail: implicit request-time download/build is disabled. A cached
index can still be used, and explicit configuration can still build one.
