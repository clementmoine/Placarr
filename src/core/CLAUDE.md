# src/core — source-agnostic product logic

Principles and history: `docs/core_architecture.md`. Where to look per bug: `docs/codebase_map.md`.

## Where new code goes

| Concern | Pillar |
| ------- | ------ |
| Scan / type / platform, barcode or printKey → what is it | `identify/` |
| Fetch / merge / persist metadata, covers, titles, facts, links | `enrich/` |
| Item lifecycle, polling, refresh, background jobs | `collect/` |
| Prices, retailer URLs | `commerce/` |
| Registry, bootstrap, `MatchContext` builder | `catalog/` (+ `src/providers/<id>/`) |
| UI/region preferences | `locale/` |
| Foil runtime, holo looks | `render/` |
| Logical item contract (ADR-020) | `schemas/content-types.ts` |
| Auth / DB / HTTP | `src/lib/`, not core |

Public facade `@/core`; otherwise import `@/core/<pillar>/…` directly. Stable entry points: `@/core/enrich/fetch`, `@/core/commerce/pricing/resolver`, `@/core/identify/evidence/compile`.

## Rules

- **Blind to sources**: no provider id, game name or source host as a literal here. Behaviour comes from declared capabilities, traits and per-observation provenance/roles. Guards: `src/effects/blindnessGuard.test.ts`, `src/providers/shared/sharedBlindness.test.ts`, `src/lib/guards/`. Never weaken a guard or add to an allowlist to make a change pass.
- **No app-global word lists** (language, condition, noise words) or per-product token equivalents: use consensus, corpus IDF, structured fields and provider-declared aliases / regional titles. Language preferences flow from `locale/` (`titleLanguagePreference`), never a literal `"fr"`.
- **`MatchContext` is shared**: anything one provider learns (EAN, alias, regional title, external id) is written to the context and reused by every following provider, including price seeks (`matchPriceSeekQueries`). No per-module silos.
- **Consensus, not privilege**: no per-provider weights or "canonical wins" shortcuts in merge/score; ranking of faces/covers uses criteria (pixels, provenance, stamps), not lists of source names.
- **Honest empty > confident wrong** for barcode resolution. Changing matching/resolution behaviour ⇒ bump `BARCODE_CACHE_VERSION` in `identify/titleUtils.ts` with a `// vNN:` comment.
- **Merge vs split**: merge modules that are only ever imported together; split files > ~800 lines with 2+ reasons to change. A large cohesive data file or matcher is fine.
- Visual card identification (embeddings index, re-embed not retrain): `docs/card_identify_learning.md`, ADR-023.
