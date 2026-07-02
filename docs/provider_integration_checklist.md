# Provider Integration Checklist — "The Ultimate Provider"

A followable checklist for adding a provider so it is **fully exploited, properly
tested, and verified against the live source** — never under-used, never a hidden
bias. Companion to [unbiased_ranking.md](unbiased_ranking.md),
[word_list_audit.md](word_list_audit.md),
[provider_agnostic_architecture.md](provider_agnostic_architecture.md). Worked
example: `src/services/providers/okkazeo/`.

Golden rule: a provider may hardcode what is specific to **its own** API/format;
it must never inject app-global logic (language, shelf type, provider privilege).
It _declares_ what it factually offers; the generic engine ranks the data.

Second golden rule: a provider is not globally "clean" or "noisy". It can expose
several sub-documents with different roles: a reference/product fiche, marketplace
listings, offer blocks, gallery images, reviews, user/vendor photos, aliases, and
structured facts. Each extracted value must carry its own role/context so the
engine can keep everything while deciding what each observation may influence.

---

## Phase 0 — Reconnaissance (before writing any code)

Hit the real source and inventory **everything** it exposes. Under-exploitation
starts here, by not looking.

- [ ] Enumerate **every endpoint**: search (by name), search (by barcode/EAN/id),
      detail page, sub-resources (reviews, versions/editions, images gallery).
- [ ] Enumerate **every source document role** the provider exposes: reference
      record, catalog product, marketplace listing, offer, gallery, review, user/vendor
      photo, API object, structured-data block.
- [ ] Call each endpoint **live** and capture the raw response:
  ```bash
  UA="Mozilla/5.0 … Chrome/120 Safari/537.36"
  curl -sS -A "$UA" -L "<endpoint>" -o /tmp/raw.html   # or .json
  ```
- [ ] Look for **structured data first** (most stable, richest): JSON-LD
      (`application/ld+json`), Open Graph (`og:*`), microdata, a JSON API. Prefer it
      over HTML scraping.
- [ ] Inventory **every field** the response carries: title, **aliases /
      alternate names (and their language!)**, description, image(s) **(+ type/role:
      cover-front/back/3D/background, + language/region)**, facts (players, duration,
      age, year, genre, designers/publishers, ratings, reviews), price/offers,
      **canonical identifiers** (gtin/EAN/ISBN, the source's own id, external ids:
      imdb/tmdb/bgg…), language/region markers.
- [ ] Note which fields are **per-language** (versions, regional titles, localized
      descriptions) — these feed the per-language buckets (unbiased_ranking §7).
- [ ] Confirm the **barcode→entry mapping** works and how to **verify** it
      (gtin13 on the page, id in the URL).
- [ ] Identify which values are **object-level candidates** (clean fiche title,
      structured cover, typed fact) and which are **evidence-only or weak candidates**
      (listing title, marketplace photo, free-text offer, user import).

Deliverable: a field inventory. Anything on it that you don't map later is
under-exploitation — make it a conscious decision, not an omission.

---

## Phase 1 — Declare capabilities (factual, per type)

In the registry, the provider announces only what it **factually** offers.
It does not get to declare "this value is canonical" globally; the canonical
display value is a projection chosen by the engine.

- [ ] `info.types`: the shelf types it serves (`["boardgames"]`, …).
- [ ] `info.capabilities`: every field it can supply — `identify`, `description`,
      `cover`, `price`, `players`, `duration`, `ageRating`, `releaseDate`, `rating`,
      `people`, … Declare **all** of them (capability coverage drives queries).
- [ ] Declare capabilities only at provider/type level. Fine-grained trust lives
      on observations: source-document role, field role, language/region, evidence
      signals (`barcode_match`, `structured_data`, `external_id`, `provider_grouped_alias`,
      `title_match`, ...), not on the provider name.
- [ ] `defaultLanguage` (and, where relevant, which observations carry explicit
      language/region). FR/EN/JA/neutral.
- [ ] Do **not** add a per-provider merge weight as a privilege (see
      unbiased_ranking §2 — weights are being phased out for data-quality+consensus).

---

## Phase 2 — Implement the module (`providers/<id>/`)

Map **every** inventoried field. Tag language/region/role on everything. Do not
drop a noisy observation just because today's display engine will rank it low.

- [ ] `fetch.ts` — pure parsers (no app logic), provider-internal hardcode OK:
  - [ ] search (name + barcode), detail parse, sub-resources.
  - [ ] parse structured data (JSON-LD/JSON) first; HTML only for what's missing.
  - [ ] extract the **full field inventory** from Phase 0 — incl. **aliases with
        language**, regional titles, all image roles, all facts, price, external ids.
  - [ ] preserve source-document context for each extracted value (fiche/product
        vs listing/offer vs gallery/user photo). Okkazeo-style providers can have both
        clean fiche data and noisy announcement data in the same connector.
  - [ ] **barcode confirmation**: verify gtin/id equals the scanned barcode;
        reject on explicit mismatch (never confidently wrong).
- [ ] `resolver.ts` — map to `MetadataResult`:
  - [ ] `title`, `description`, `imageUrl`, `barcode`, `releaseDate`, `authors`,
        `publishers`, `externalIds`.
  - [ ] `regionalTitles: [{region, text}]` for **every** localized name → feeds
        `pickBestRegionalTitle`.
  - [ ] `aliases` for **every** alternate name → feeds language-agnostic search.
  - [ ] `attachments` with `role` (cover-front, background…) **and** language/region
        → feeds `attachmentDisplayScore`.
  - [ ] `facts[]` with `kind/value/source` → feeds `applyConsensus`.
  - [ ] a title/name confidence guard (barcode-confirmed OR close title match).
  - [ ] where the current `MetadataResult` shape is too lossy, add/prepare typed
        candidate structures instead of overloading strings. Target model:
        discriminated observations such as `TitleObservation`, `ImageObservation`,
        `FactObservation`, `AliasObservation`, `OfferObservation`, each with provenance
        and role.
- [ ] `index.ts` — the `ProviderModule`:
  - [ ] `evidence` (legacy bridge only while migrating; do not use
        `sourceWeight`, `canonical`, or `trustedRetailer` as field-winning privilege).
  - [ ] `createMetadataAdapter` (parameter-less, resolves `{name, barcode}`).
  - [ ] `healthCheck` (`createMetadataHealthCheck` + `pingUrl`) — read any token
        **lazily at call time**, never eagerly at import (see the BGG bug).
  - [ ] `testHandlers` (metadata + metadata-barcode).
  - [ ] `buildBarcodeTasks` gated by `BARCODE_TYPES` — **include `"generic"`** so
        typeless home-page scans get this anchor (parity).
  - [ ] `mappingProbe` + `runMappingProbe` (`metadataProbe`).

---

## Phase 3 — Wire into the generic engine (by type, never by name)

- [ ] Register: `PROVIDER_MODULES` + registry extensions (language, capability).
- [ ] If barcode-keyed: add the field to `BarcodeLookupPayload` +
      `createEmptyBarcodeLookupPayload`; read it in the relevant `runBarcodeLookups`
      branches **and the generic branch** (parity); feed it into the type bucket(s)
      in `compileAllBarcodeTypeResults`.
- [ ] Confirm the engine reaches it via `providersForType` / `capabilityCoverage`
      — **no `providerId === "<id>"` branch anywhere**.

---

## Phase 4 — Tests

- [ ] **Unit** parser tests with a **real captured fixture** (from Phase 0):
      structured-data parse, field extraction, **gtin/barcode confirmation guard**,
      title-match guard, search-hit parse.
- [ ] **Contract tests** shared by all providers:
  - [ ] every emitted candidate/observation has provider id, source URL or stable
        source id when available, source-document role, field role, observed-at/cache
        context, and language/region when textual/localized.
  - [ ] object-level values and listing/evidence values are not collapsed into one
        flat title/image.
  - [ ] noisy marketplace/user observations are retained, but marked weak or
        excluded from display/search where appropriate.
  - [ ] explicit mismatches (barcode/platform/type) become rejection evidence.
- [ ] **TypeScript contract**: prefer discriminated unions and exhaustive switches
      for observation kinds. A provider should fail to compile if it emits an untyped
      title/image/fact or forgets required provenance fields.
- [ ] Update the registry-guard tests that enumerate providers
      (`providerBarcode.test.ts`, `providerBootstrap.test.ts`,
      `providerMappingAudit.test.ts`).
- [ ] `npx tsc --noEmit` clean, `npx vitest run` green.
- [ ] (When source is healthy) record a golden-master fixture for the
      barcode→item regression corpus (one case per type — see TESTING).

---

## Phase 5 — Verify against the live source (catch what you missed)

Don't trust the fixture alone — confront the **live** source and your extraction.

- [ ] One-off live call of the resolver and **every** webservice:
  ```ts
  process.loadEnvFile(".env");
  const { create<X>Resolver } = await import("@/services/providers/<id>/resolver");
  console.log(await create<X>Resolver()("", "<barcode>"));
  ```
- [ ] **Diff extracted vs raw**: re-open the raw Phase-0 capture and check, field
      by field, that everything present is now mapped. Anything still on the page but
      not in `MetadataResult` = under-exploitation → fix or consciously skip.
- [ ] Health check is **green** (`scripts/providerHealth.ts` or admin).
- [ ] Mapping probe reports mapped vs unused keys — **unused keys are leads**, not
      noise.

---

## Phase 6 — Exploitation completeness audit ("never under-exploited")

Final pass, the point of this whole checklist:

- [ ] Every Phase-0 field is mapped, or skipped on purpose with a reason.
- [ ] Raw/normalized observations are retained for future reprojection; the current
      ranking output is not the only stored representation.
- [ ] **All aliases retained** (per language) — search recall, not just display.
- [ ] **All localized titles** emitted as `regionalTitles` (not collapsed to one).
- [ ] **All image roles/languages** tagged (not just one cover).
- [ ] **All facts** emitted (they feed consensus even if not shown yet).
- [ ] **External ids** emitted (enable cross-provider propagation).
- [ ] Queried in **every** path it's relevant to (its type **and** the generic
      typeless scan).
- [ ] **Resilience**: if the provider breaks/times out, the engine degrades to the
      next best _datum_ — never hard-depends on this provider.

---

## Anti-checklist (reject the PR if any is true)

- [ ] A `providerId === "<id>"` branch in core fetch/merge/score.
- [ ] A per-provider merge weight used as a privilege.
- [ ] A provider-level `canonical`/trust flag is used to make a field win instead
      of per-observation roles and evidence signals.
- [ ] App-global word lists added for this provider (language/condition/noise) —
      use consensus / corpus-IDF / structured fields instead (word_list_audit).
- [ ] A title collapsed to one language, or aliases dropped.
- [ ] Marketplace/listing/user observations are thrown away because they are noisy.
- [ ] A token/secret read at import time instead of call time.
- [ ] Barcode trusted without a gtin/id confirmation.
