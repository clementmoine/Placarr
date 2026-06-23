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

## Provider migration factory (observation mode + exploitation audit)

Date: 2026-06-22

Goal: migrate **every metadata provider** to typed `observations` and run a
repeatable audit loop proving each connector is fully exploited.

### Factory loop (same for each provider)

1. Implement observation emission in the resolver:
   - set `observationSchemaVersion`,
   - emit typed title/image/fact/alias/offer observations with provenance/usage,
   - keep legacy `MetadataResult` fields during migration.
2. Add contract tests on the provider resolver:
   - legacy compatibility,
   - observation kinds/roles/provenance/evidence,
   - weak retained observations for listing/offer/user-noise when applicable.
3. Run automated audits:
   - `pnpm providers:audit:mapping` (mapping + observation mode),
   - `pnpm providers:health` (connector health),
   - targeted provider tests + full test suite.
4. Only then mark the provider as migrated.

### Automated audit surface

- `runProviderMappingAudit` now reports both:
  - mapping coverage (`status`, `mappedKeys`, `unusedKeys`, facts/attachments),
  - observation migration status (`observationMode`, `observationSchemaVersion`,
    `observationCount`, `observationKinds`).
- `pnpm providers:audit:mapping` prints one consolidated report (mapping +
  observation mode) and a prioritized migration queue (`legacy -> unknown`)
  usable in CI or manual review.
- Admin `/api/admin/provider-mapping-audit` remains the central endpoint and now
  exposes observation-mode fields too.

### Migration waves (ordered)

1. **Wave A — boardgames canonical anchors**
   - `boardgamegeek`, `screenscraper`, `thegamesdb`, `wikidata`,
     `monsieurde`, `ludifolie`, `bcdjeux`, `lepassetemps`, `archichouette`.
2. **Wave B — games**
   - `igdb`, `rawg`, `launchbox`, `steam`, `pricecharting`, `coverproject`,
     `steamgriddb`, `howlongtobeat`.
3. **Wave C — movies/books/music**
   - `tmdb`, `omdb`, `openlibrary`, `googlebooks`, `deezer`, `musicbrainz`,
     `discogs`.
4. **Wave D — marketplaces / price scrapers**
   - `achatmoinscher`, `chasseauxlivres`, `ledenicheur`, `picclick`,
     `apriloshop`, `freakxy`, `scandex`.

Current migration baseline:
- ✅ all providers with a metadata adapter are now in observation mode
  (`observationMode = enabled` in `pnpm providers:audit:mapping`).
- ⚪ remaining unknown providers are out-of-scope for migration because they are
  custom-probe-only (no metadata adapter):
  `chasseauxlivres`, `freakxy`, `ledenicheur`, `picclick`, `scandex`,
  `apriloshop`.

### Done criteria per provider

- Observation mode: `observationMode = enabled`.
- No regression on legacy metadata output and existing consumers.
- Mapping probe not `error`; unresolved raw keys documented (or mapped).
- Health-check green (or explicitly `blocked` by missing credentials).
- Provider checklist completed (`docs/provider_integration_checklist.md`).

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
2. Drain the allowlist: `metadataFetch.ts` (~~game-provider list~~ ✅ →
   `requiresTitleAlignment` trait; ~~`screenscraper ? 6 : 12`~~ ✅ → `rateLimited`
   trait; **remaining**: SS recheck stage + PriceCharting title fallback, both
   genuinely provider-specific stages needing a post-resolve hook capability),
   `attachmentDisplayScore.ts` (`REAL_BOX_COVER_SOURCES` →
   `isRealBoxCover` capability), ~~`metadataMerge.ts` (steam/discogs)~~ ✅,
   ~~`metadataStorage.ts` (discogs)~~ ✅, ~~`confrontWithDatabase` (named provider
   per type)~~ ✅, admin `product-teardown`/`test-provider`/
   ~~`metadata-enrich`~~ ✅`/providers` routes. (Remaining admin leaks are harder:
   `test-provider` is a handler-kind discriminator, `MetadataRefreshPanel.tsx` is a
   client component that can't import the registry.)
3. Add `info.baseUrl` so each provider declares its site once (used generically by
   health/probe/admin).

Done:

- 2026-06-22: added `src/services/providerBlindnessGuard.test.ts`, a runtime
  guard for quoted provider literals outside `src/services/providers/`, with an
  exact shrinking allowlist. First pass deliberately excludes docs/tests and does
  not yet catch unquoted object keys; broaden it as the allowlist drains.
- 2026-06-23: drained `metadataMerge.ts` (steam + discogs literals → 0).
  Replaced `providerId === "steam"` / `=== "discogs"` cover routing with two
  provider-declared `ProviderInfo` traits — `digitalStorefrontArt` (Steam: PC
  capsule art excluded from physical-game covers) and `canonicalCover` (Discogs:
  album art trusted as-is). Traits live in the provider modules (guard-allowed);
  the merge reads them via the registry. Behaviour unchanged, full suite green.
- 2026-06-23: drained `metadataStorage.ts` (discogs literals → 0) with the same
  `canonicalCover` trait via an `isCanonicalCoverSource(source)` helper that reads
  the registry at call time (no import-order hazard). Cover selection + music
  cover-sync now provider-blind.

## Observation migration & exploitation (from `providerMappingAudit`)

Date: 2026-06-22

Dashboard: `npx tsx scripts/providerMappingAudit.ts` (drives
`services/providerMappingAudit.ts`) — per provider: mapping status, observation
mode, mapped/unused keys, observation count/kinds/schema, migration queues.

State (2026-06-22): **27 providers `enabled`** (schema `metadata-observations/v1`),
0 migrating, 0 legacy. The 6 `unknown` are adapter-less barcode/listing providers
(chasseauxlivres, freakxy, ledenicheur, picclick, scandex, apriloshop) — correctly
out-of-scope for the *metadata-adapter* observation path; they come into scope when
the **barcode path** emits observations (their listings → `listing_title` /
`marketplace_listing`). Consumption: `metadataMerge.ts` ranks **titles** by
observation tier/locale/evidence; barcode resolution (`compile.ts`) still legacy
`sourceWeight`/`canonical`. To do: migrate barcode path; generalize consumption to
images + facts.

**Under-exploitation leads** (high `unused` keys = fields returned but not mapped —
checklist Phase 6):

| Provider | mapped / unused | notes |
| --- | --- | --- |
| wikidata | 12 / **97** | ~90 are noise: per-language label/description variants + obscure P-codes. Real wins: P136 genre, P178 developer, P123 publisher, P856 official site, P166 awards. Language variants belong to the per-language title work (item D), not a key-by-key map. |
| discogs | ~~17 / 17~~ **20 / 13** | ✅ 2026-06-23: `artists`→`authors`, `notes`→description (markup-stripped), `labels`→`publishers`. Music items now keep artist + edition description + record label. ❌ `lowest_price`/`num_for_sale` investigated & rejected: `lowest_price` excludes shipping and is routinely a €0.01–0.50 teaser/loss-leader (saw €0.28 for a real album), so it would surface a misleading price; the reliable `price_suggestions` endpoint needs seller OAuth we don't have. Remaining low-value: `videos`→links, `series`→fact. Rest noise. |
| googlebooks | ~~17 / 10~~ **18 / 0** | ✅ 2026-06-23: `printType`→format fact ("Livre"/"Magazine"), `maturityRating==MATURE`→content-warning. Rest were links/noise. |
| rawg | 19 / **8** | `clip`→gameplay video; rest noise (dominant_color, added_by_status…). |
| boardgamegeek | ~~23 / 4~~ **25 / 0** | ✅ 2026-06-23: raw `<poll>` top-voted results → `recommended-age` (community age, e.g. "8+") + `language-dependence` facts; `poll`/`poll-summary` now register mapped. Verified on live Catan. |
| deezer | 18 / 2 | `explicit_*` is **already exploited** (resolver → content-warning fact) but *conditionally*: the audit only credits it on an explicit sample. Aliases added; a non-explicit sample legitimately leaves it "unused". Not a real gap. |

**Audit baseline 2026-06-23**: 21/27 metadata providers already at 100% (`unused: 0`).
The "unused" count conflates real gaps with noise — chase valuable fields, not the
raw number. Wikidata's 97 is the clearest example (mostly language variants).

**Multi-sample probe (2026-06-23)**: the audit now unions raw + mapped keys across
several sample inputs per provider (`mappingProbe.additionalSamples`, opt-in;
`collectMappingRawKeys(context)` receives the probed context), via
`mergeMappingProbeSamples` — a field counts mapped/returned if *any* sample shows
it, removing the single-sample blind spot. The union never degrades the primary
sample's status. Finding: most providers' single sample already exposes their full
schema (Discogs' one release returns all 33 keys incl. videos/notes/series), and
live providers rate-limit, so extra samples are reserved for genuinely
heterogeneous-schema providers rather than enabled everywhere.

## Apriloshop — search integration broken (fix or remove)

Date: 2026-06-22

`providerMappingAudit` flagged apriloshop `error`. Diagnosis: the site is up (sells
figurines / UMD / pop-culture) but our scraper hits `https://apriloshop.fr/recherche?s=<q>`,
which now returns the PrestaShop **"no results"** page for **every** query —
including products the site clearly has (e.g. "Death Note"). So it has been dead
weight (returns nothing), not a stale-sample issue.

Root cause: apriloshop migrated search to the **IQIT Search** module
(`/module/iqitsearch/searchiqit?s=<q>`, HTML response); the native search index is
emptied. Verified: apriloshop **does** answer the native PrestaShop AJAX search
(`/recherche?controller=search&s=<q>&ajax=1` → valid `application/json`) but with
**`products: 0`** for every query — so the native path our module relies on returns
nothing.

**Compatibility with our `createPrestashopModule`**: partial. Same PrestaShop
product-page format, but the module's search is native-AJAX-JSON, which on apriloshop
is empty; the live search is IQIT (HTML). Recommended (aligned with plug-and-play /
no-duplication):

1. Add `searchStrategy: "native-ajax" | "iqit"` to `PrestashopRetailerConfig`
   (`prestashop/types.ts`); implement the IQIT HTML `product-miniature` parse once
   alongside the native JSON parse.
2. Make apriloshop a **prestashop config** (`searchStrategy: "iqit"`) and **delete
   the bespoke `apriloshop/` connector**. Any other IQIT-based PrestaShop shop is
   then supported for free.
3. Before committing: verify IQIT **indexes barcodes** (the raw GET seemed to return
   a constant set — likely needs the module's AJAX params/headers). If name-only,
   apriloshop feeds the metadata path but not barcode identification.
4. Else, if it can't be made reliable: **remove the provider** (same rule as
   LaunchBox). It feeds the barcode generic/games path today.

**Status (2026-06-22): migration DONE** (search still native = returns nothing for
now, accepted). `createPrestashopModule` is fully type- and capability-agnostic
(`types`/`barcodeTypes`/`capabilities`/`sample` from config). Apriloshop is now a
PrestaShop config (`types: ["games"]`, games-appropriate capabilities); the bespoke
`apriloshop/` connector + its `fetchFromApriloshop` dep + the `payload.aprilo` slot
are deleted. Retailer barcode hits are collected generically
(`collectRetailerBarcodeHits`, derived from the configs — removed the hardcoded
`BOARDGAME_RETAILER_BARCODE_TASKS` list, which also fixed the dropped-archichouette
bug) and routed by each shop's declared `types` (games shop → `gameSources`,
board-game shop → `boardgameSources`). Build green (579 tests).

**Remaining**: add a `searchStrategy: native | iqit` to the factory + implement the
IQIT HTML parse so apriloshop actually returns results (verify it filters + indexes
barcodes). Until then apriloshop is wired but empty.

**Platform audit of all bespoke shop connectors (2026-06-22)** — to know what else
could fold into the shared PrestaShop module: **only apriloshop is PrestaShop**
(presta markers + native ajax → JSON). The others are different platforms, so their
bespoke connectors are justified: philibert = custom (no PS markers, custom
selectors), **freakxy = Magento** (`/catalogsearch/result`), smartoys =
custom/legacy (iso-8859-1), okkazeo = custom JSON-LD DB; achatmoinscher /
ledenicheur / picclick / chasseauxlivres are comparators/aggregators, not shops. No
PrestaShop consolidation beyond apriloshop. (If more Magento shops appear later, a
shared Magento module would be worth it — same pattern as PrestaShop.)

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
  canonical `DatabaseResolver` evidence.
- **Done 2026-06-23**: removed the `confrontWithDatabase` type→named-provider
  `switch`. Each authoritative name DB declares a `nameDatabase` ProviderInfo
  trait (IGDB/games, TMDB/movies, OpenLibrary/books, Deezer/musics, BGG/
  boardgames); the function selects the highest-weight `nameDatabase` provider for
  the type and resolves by name through its registry adapter (behaviour-preserving
  — adapters resolve-by-name identically to the old direct calls). `getDatabaseSuggestions`
  still switches on type (uses suggestion fns outside the adapter interface) — a
  later step needs a provider suggestion capability.

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

- **Done 2026-06-22**: BGG's health-check no longer captures `BGG_API_TOKEN` at
  import time; it reads the token lazily when `run()` executes. The keep/delete
  decision for `scripts/providerHealth.ts` remains open.

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

Started:

- 2026-06-22: added the minimal observation-first TypeScript contract
  (`MetadataObservation` discriminated union), helper functions, and legacy
  `MetadataResult` → observations bridge. `MetadataResult` can now carry optional
  `observations` + `observationSchemaVersion` for gradual provider migration.
- 2026-06-22: Okkazeo is the first provider to emit typed observations alongside
  legacy metadata: catalog title, cover-front image, structured facts, and a weak
  retained price snapshot offer.

### H. Video-game platform catalog DRY

The app must not fetch ScreenScraper / LaunchBox platform lists during barcode
scans or metadata requests. Use provider lists as **build-time snapshots** only:

- `src/lib/videoGamePlatformSources.ts` stores the 2026-06-22 static snapshots
  from ScreenScraper `api2/systemesListe.php` and the LaunchBox public platform
  selector. Media URLs are intentionally omitted.
- `src/lib/videoGamePlatforms.ts` is the Placarr canonical catalog: typed keys,
  aliases, provider IDs/slugs, and helpers. Provider adapters import from there
  instead of owning local platform maps.
- ScreenScraper source names are used for detection only when a name maps to a
  single system in the snapshot; ambiguous aliases such as broad arcade/MAME-style
  labels stay out of decisive routing.

Future refresh: run a one-off/admin script to update the snapshot and review the
diff. Do not add live calls to `systemesListe.php`, LaunchBox pages, or
`Metadata.zip` in the user scan path.

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
