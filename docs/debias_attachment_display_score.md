# De-bias `attachmentDisplayScore.ts` (`REAL_BOX_COVER_SOURCES`) — focused task spec

Self-contained brief so a fresh session can execute this cold. Part of the
**provider-blind core** invariant (see [provider_agnostic_architecture.md](provider_agnostic_architecture.md) §0
and [backlog.md](backlog.md) §"Provider-blind core"): outside `src/services/providers/`,
no code may name a provider. Enforced by `src/services/providerBlindnessGuard.test.ts`
(an exact, shrinking allowlist of quoted provider literals).

## Why this one is special (read first)

This is **not** a clean literal-swap like the drains already done (metadataMerge,
metadataStorage, confrontWithDatabase, metadata-enrich, metadataFetch partial,
providerRegistry). Two reasons:

1. **Client-safe lib.** `attachmentDisplayScore.ts` is a pure scoring lib imported
   **client-side** (`ItemModal`, `QuickScanModal`, `ExploreItemModal`,
   `app/shelves/[shelfId]/[itemId]/page.tsx`, and `itemMedia.ts`). It **cannot
   import `@/services/providerRegistry`** (that pulls every provider module +
   axios into the client bundle). So a provider trait can't just be read from the
   registry here — it must **travel on the attachment data** (flag-on-attachment),
   set server-side.

2. **The two "real box cover" truths DIVERGE → this is a behaviour change.**
   - `REAL_BOX_COVER_SOURCES` (in `attachmentDisplayScore.ts`):
     `{ bgg, boardgamegeek, screenscraper, thegamesdb, launchbox, coverproject, apriloshop, freakxy, philibert }`
   - Registry `isRealBoxCover` (`PROVIDER_METADATA_EXTENSIONS` in `providerRegistry.ts`):
     `{ screenscraper, thegamesdb, launchbox, coverproject, boardgamegeek, philibert, okkazeo, freakxy }`
   - Diffs: **okkazeo** is real-box in the registry but not in the set (→ would
     gain the +220 bonus); **`bgg`** (a source alias) is in the set but the
     registry is keyed by id `boardgamegeek` (→ `"bgg"`-tagged attachments would
     lose the bonus unless the source is normalised); **apriloshop** is a deleted
     provider (irrelevant).

   `REAL_BOX_COVER_SOURCES` is used **only** in `buildAttachmentDisplayScoreDetails`
   for one `+220 "real box cover source"` signal (`isRealBoxCoverSource(source)`).
   It affects **cover ranking / selection** — a memory-flagged "never confidently
   wrong" path. So unifying onto the registry trait **changes which cover wins**
   for board games (okkazeo, bgg). Must be validated, not bodged.

## Goal

Remove `REAL_BOX_COVER_SOURCES` + `isRealBoxCoverSource()` from
`attachmentDisplayScore.ts` (drain its guard allowlist entry, currently
`{ apriloshop:1, bgg:1, boardgamegeek:1, coverproject:3, freakxy:1, launchbox:1, philibert:1, screenscraper:1, thegamesdb:1 }`),
with the real-box-cover decision sourced from the **provider-declared
`isRealBoxCover` trait** (already exists on `ProviderInfo`) — without changing the
selected cover for existing items (or changing it only deliberately, validated).

## Recommended approach: flag-on-attachment

1. Add `isRealBoxCoverSource?: boolean` to `ScoredAttachmentInput` (and the
   attachment shapes that feed it). The scorer reads `attachment.isRealBoxCoverSource`
   instead of `isRealBoxCoverSource(attachment.source)`. Delete the set + helper.
2. **Set the flag server-side, at every point attachments are built before being
   scored or sent to the client** (all have registry access):
   - `metadataMerge.ts` — `allAttachments` / `providerImageCandidates` (annotate
     from `source`).
   - `metadataStorage.ts` — the extra attachments it injects (barcode cover,
     `merged` image) + `localizedAttachments` before `rankAttachmentsForDisplay`.
   - `presentItem.ts` (or `formatMetadataFromStorage`) — annotate
     `metadata.attachments` loaded from the DB before they reach the client, so
     client-side `rankCoversForDisplay`/`getHeroImage` rank identically.
   Use one shared server helper, e.g. `isRealBoxCoverSource(source)` backed by a
   registry-derived `Set` of `PROVIDERS.filter(p => p.isRealBoxCover).map(p => p.id)`.
3. **Source normalisation.** Attachment `source` can be an alias (`"bgg"`) or
   carry a `· region` / `/ variant` suffix (already normalised in
   `normalizeAttachmentSource`). Map the source to a canonical provider id before
   the registry lookup so `"bgg"` → `boardgamegeek`. Check whether any pipeline
   still emits `source: "bgg"` (BGG attachments were seen with `source: "bgg"`).
4. **okkazeo decision.** Unifying gives okkazeo the +220 bonus. That's arguably
   correct (real board-game box source) — confirm it doesn't regress a board-game
   cover (re-fetch e.g. Mille Sabords `3421272109517`).

### Alternative (simpler, rejected): inject a predicate
Pass an optional `isRealBoxCoverSource` predicate into the rank/score fns; server
passes a registry-backed one, client passes a no-op. **Rejected**: causes
client/server ranking divergence (the gallery picker would order covers
differently than the server-computed cover). Only acceptable if the client stops
re-ranking and consumes a server-ordered list.

## Validation (do not skip — critical path)
- Full suite green (`npx vitest run`, currently 625 passing).
- Guard test green after removing the `attachmentDisplayScore.ts` allowlist entry.
- Re-fetch a board game (okkazeo/bgg covers), a video game (screenscraper), and a
  music item; confirm `item.imageUrl` / `metadata.imageUrl` don't regress vs the
  pre-change cover. Script pattern used this session: a throwaway
  `scripts/_x.ts` calling `fetchAndStoreMetadata(...)` then reading
  `item.imageUrl` + attachments from Postgres (`docker exec placarr-db-1 psql -U placarr -d placarr`).
- Add a unit test: an attachment with `isRealBoxCoverSource: true` outranks an
  identical one without it (covering the +220 signal at the data level).

## Sibling targets (same client-trait-propagation pattern — do after, or together)
- `attachmentDisplayLabels.ts` `PROVIDER_LABELS` (≈20 literals, the biggest single
  allowlist entry): provider id → display label ("SS", "BoardGameGeek"). Providers
  already have `info.label`. Same client constraint → propagate the label on the
  attachment (`attachment.providerLabel`) server-side, or generate a client-safe
  label snapshot. Solving flag-on-attachment here unlocks the same mechanism.
- `metadataDiscogs.ts` (`source === "discogs"`, client-reachable via `[itemId]/page.tsx`):
  same constraint; reuses the `canonicalCover` trait once it can travel client-side.

## State of the provider-blind drain (2026-06-23, this session)
Done (clean, behaviour-preserving, full suite green): `metadataMerge.ts` (steam/
discogs → `digitalStorefrontArt`/`canonicalCover` traits), `metadataStorage.ts`
(discogs → `isCanonicalCoverSource`), `confrontWithDatabase` (type→provider switch
→ `nameDatabase` trait), admin `metadata-enrich` (→ derive primary game cover
source), `metadataFetch.ts` partial (`requiresTitleAlignment` + `rateLimited`
traits), `providerRegistry.ts` `isProviderConfigured` (redundant special-cases
removed). New `ProviderInfo` traits added: `digitalStorefrontArt`, `canonicalCover`,
`nameDatabase`, `rateLimited`, `requiresTitleAlignment` (declared in the provider
modules).

Remaining leaks needing design (not literal swaps): **this doc** (attachmentDisplayScore),
`attachmentDisplayLabels`, `metadataDiscogs`, `[itemId]/page.tsx`,
`MetadataRefreshPanel.tsx` (client components); `barcodeResolver.ts` /
`sourceAssembly.ts` / `playerFacts.ts` (per-provider payload/fact shapes →
provider-declared shaping); `metadataFetch.ts` SS-recheck + PC-title (provider
post-resolve hooks); `cachePayload.ts` (`url.includes("screenscraper")` URL
pattern); `providerMappingAudit.ts` + `scripts/*` (tooling; retry list + blocked
hints — could become `flakyProbe` / `auth.hint` traits, low priority).
