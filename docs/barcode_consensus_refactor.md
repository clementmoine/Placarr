# Barcode title resolution → agnostic consensus refactor (handoff)

**Status (2026-06, branch `feat/foundation-postgres-tests`, cache `canonical-v38`,
all tests green):** the barcode _title_ is now chosen by **one agnostic
token-corroboration engine** instead of N hardcoded override paths. The engine is
built, proven, and **wired in**. The first redundant override (romhack markers)
is deleted.

**Update (cleanup session):** two things were learned/done since the original
handoff — read §3 before touching the overrides:

1. **All scoring magic values are now centralized** in
   `src/lib/barcode/evidence/scoring.ts` (`TYPE_SCORE`, `CLUSTER_CONFIDENCE`,
   `ALTERNATE`, `CONSENSUS`) + named provider-weight defaults in
   `services/providerEvidence.ts`. compile.ts / resolve.ts carry no bare numeric
   literals. Behaviour-preserving; all barcode tests green.
2. **The remaining "overrides" are NOT title-redundant** — measured empirically
   (see §3). They are the _confidence / platform-key / alternate-suppression_
   layer; the title engine does not replace them. Deleting them is a confidence
   change that needs the live §5 run + a cache bump, **not** a mechanical delete.

This document lets you resume the work cold. See also the memory notes:
`agnostic-consensus-title`, `barcode-canonical-can-be-wrong`,
`edition-display-model`, `barcode-cache-version-bump`.

---

## 0. The goal (user requirement)

> « Je veux rien de hardcode, je veux qu'on soit très agnostiques. »

The barcode title layer had accumulated **one special-cased override per failure
mode** (sequel number, edition subtitle, romhack markers, platform-integral title
lists, year handling, series prefix…). Each new bad barcode = a new `if`. That is
the anti-pattern being removed.

---

## 1. The single agnostic rule

Independent marketplace listings are the ground truth for what a barcode
physically is. **The displayed title is the most specific form the marketplace
consensus corroborates, token by token** — with no knowledge of the _kind_ of
difference:

- a token the **canonical** has but **no listing** echoes → **dropped**
  (Zumba "World Party", Mario Kart "CTGP Mod", Carnival "Nouvelles Attractions");
- a token the **listings overwhelmingly** carry but the canonical lacks →
  **added** (Just Dance "2019/2014" — years);
- a token both agree on → kept in the canonical's clean spelling (Gottlieb
  "Classics", "Tom Clancy's Ghost Recon" brand prefix survives because it's
  minority-corroborated, not zero).

Implementation: **`src/lib/barcode/evidence/consensusTitle.ts`**
(`selectConsensusTitle`), 10 unit cases in `consensusTitle.test.ts`. Scoring per
token: majority → `+COVER_REWARD`; zero listings → `-ZERO_CORROBORATION_PENALTY`
(> reward, so a fabrication always loses); minority → small `-MINORITY_PENALTY`
(drops a lone seller placeholder like "Inconnu" on the tie-break, but a real brand
prefix survives via `+CANONICAL_BONUS`). Pure digits are kept as tokens so
"Ghost Recon 2" ≠ "Ghost Recon". **Only 3 generic thresholds, zero per-case
lists.**

---

## 2. Wire-in (done)

In `compileResultForType` (`src/lib/barcode/evidence/compile.ts`), right after
`sourceEvidence` is built (BEFORE any promotion override), it computes:

```ts
const consensusTitleValue = selectConsensusTitle({
  canonical: sourceEvidence
    .filter((e) => e.isCanonical || e.isTrustedRetailer)
    .map((e) => e.cleanName),
  marketplace: sourceEvidence
    .filter((e) => !e.isCanonical && !e.isTrustedRetailer)
    .map((e) =>
      cleanTitleForDisplay(e.rawName, { preserveEditionTerms: true }),
    ),
});
```

- **Why re-clean the marketplace `rawName` with `preserveEditionTerms`:** the
  marketplace `cleanName` strips edition words ("Classics", years) as listing
  noise, which would make the consensus think they are uncorroborated. Re-cleaning
  with `preserveEditionTerms: true` keeps edition/year/number tokens while still
  dropping platform/condition/seller noise — so corroboration is measured on the
  meaningful tokens. (`preserveEditionTerms` is a new `cleanTitleForDisplay`
  option added this session; canonical titles already use it via `parseProductName`.)
- The result then overrides `matches[0].name` and the result `cleanName`, so the
  agnostic title is consistent between the leader match and the displayed name.

Live wins the old overrides could **not** do: Zumba "World Party"→"Zumba Fitness",
Carnival prefix dropped, Just Dance 2014 year added, Gottlieb kept.

---

## 3. Phase 2 — the overrides are a CONFIDENCE layer, not title hardcode

The original handoff framed the remaining overrides
(`applyMarketplaceConsensusOverride`, `applyMarketplaceEditionConsensus`,
`editionContradictionConsensus`, the `resolve.ts` sequel/franchise helpers) as
"delete the override + its test block, keep green". **That premise is wrong** and
following it mechanically would regress confidence. Measured, not assumed:

**Empirical probe (cleanup session):** the two override calls in
`compileResultForType` were gated behind an env flag and the suite re-run with
them OFF. Result: **14 / 15 of `compile.consensusOverride.test.ts` still pass.**
The consensus-title engine rewrites `matches[0].name` to the corroborated form
and clustering already de-dups the wrong-edition alternates, so the _title_ and
_alternate-suppression_ outcomes hold without the overrides. The **only** failing
test was platform-key imposition (a contradicted `… 2 / xbox` canonical forcing
the wrong platform). The 4 unit tests at the top assert flags by calling the
override directly, so they are unaffected by the gate.

So what the overrides still _uniquely_ provide is narrow:

1. **platform-key**: stop a consensus-contradicted canonical from imposing its
   `platformKey` (the one test that breaks);
2. **confidence cap** on a contradicted canonical — **untested** by the suite
   (the integration tests assert title / alternates / platform, never the
   confidence number). With the title now always corrected by the engine, a high
   confidence is often _correct_ (right title ⇒ right answer), so this cap may be
   partly obsolete — but that is exactly what cannot be verified without live data.

**Test-driven path — and what step 1 then PROVED:**

1. ✅ DONE — `compile.confidenceLock.test.ts` pins **confidence + platformKey +
   matches.length** for the contradicted-canonical cases (Ghost Recon 2 / Island
   Thunder, de Blob 2, TMNT III, TMNT II Arcade no-anchor), locking today's
   correct behaviour.
2. ⛔ MEASURED, NOT SAFE TO COLLAPSE HEADLESS. With the lock tests in place, the
   overrides were gated OFF again and the lock suite re-run: **5 / 6 fail**, and
   the deltas are confidence in _both directions_, not just platform:

   | Case                       | with           | without                                               |
   | -------------------------- | -------------- | ----------------------------------------------------- |
   | GR2 platform               | `pc`           | `xbox` (wrong platform imposed)                       |
   | GR2 dominant-volume        | "… — Classics" | "… Ghost Recon" (title shifts)                        |
   | GR Island Thunder          | **0.47**       | **0.77** (contradicted canonical leads, high conf ⚠️) |
   | de Blob 2                  | **0.98**       | **0.52** (correct ID looks uncertain)                 |
   | TMNT II Arcade (no anchor) | **0.51**       | **0.98** (over-confident)                             |

   So the earlier "14/15 pass without overrides" was an artefact of the old tests
   never checking confidence. The three overrides are a **load-bearing confidence
   model** with three differently-shaped cases (raise de Blob, cap Island Thunder,
   moderate the no-anchor edition). Collapsing them into "one consensus-derived
   rule" would have to _reproduce_ those opposite-direction effects — that is not a
   simplification, and any version that produces _different_ confidence numbers can
   only be judged correct by the live §5 run, because "barcode → item must never be
   confidently wrong" is the hard constraint.

**Recommendation:** keep the overrides (now understood + confidence-locked). The
agnostic-_title_ goal is met; magic values are centralized; provider plug-and-play
is confirmed. Pursue the unification ONLY as a deliberate, live-validated
confidence redesign (run §5 live — Zumba, Carnival, Gottlieb, Just Dance, Mario
Kart Wii, Wii Play, Skyward Sword, Modern Warfare — and bump
`BARCODE_CACHE_VERSION`), not as a "delete the hardcode" cleanup. It is not a clear
net win.

---

## 4. Known edge cases / open questions

- **Just Dance 2019 (`3307216080831`)** — only partly fixed: the year is added
  but a seller placeholder "Inconnu" leaks ("Inconnu Just Dance 2019"). Cause:
  only **2 listings**, one being "JUST DANCE 2019 FR/NL WII" whose "FR/NL WII"
  isn't fully stripped by `cleanTitleForDisplay`, so it carries more minority
  noise than "Inconnu Just Dance 2019". This is a **cleaning + thin-evidence**
  edge, not the engine. Fix ideas: better region/platform stripping of
  `FR/NL`-style tokens; or weight canonical year-presence.
- **Mario Kart Wii platform-in-title** — the consensus drops "Wii" if the
  marketplace `cleanName` strips it (platform). With the §2 input cleaning
  (`preserveEditionTerms` but NOT `preservePlatformSuffix`) Mario Kart resolves to
  "Mario Kart" (loses "Wii", which the user rated _secondary_). Deciding whether a
  platform word is integral to a title ("Wii Sports" vs "Galaxy Wii") agnostically
  still needs the canonical to confirm it — open design question. The hardcoded
  platform-integral handling in `titleUtils.ts` is the current stop-gap.
- The consensus only chooses the **title**. Type detection
  (`boardGameSignal`/`videoGameSignal`/`videoFormatSignal`), platform key, cover,
  and confidence are separate and still use their own (mostly justified) logic.

---

## 5. Real-barcode regression checklist

**RUN LIVE (cleanup session) — `runBarcodeLookups` + `compileAllBarcodeTypeResults`,
cache bypassed.** This had never actually been executed before. Result: **10/15
correct**, and it surfaced real _current-code_ issues the hand-built fixtures had
masked:

- ✅ FIXED this session: `3307210117168` returned **lowercase** "tom clancy ghost
  recon — Classics". Root cause: `selectConsensusTitle` picks the best-scoring
  existing string, and a stray lowercased listing duplicate beat the clean
  "Tom Clancy's Ghost Recon" on the _shorter-wins_ tie-break. Fix: a casing-quality
  tie-break (well-cased > ALL-CAPS > all-lower) BEFORE length. Locked by a new
  `consensusTitle.test.ts` case; verified live → "Tom Clancy's Ghost Recon —
  Classics". `BARCODE_CACHE_VERSION` bumped **v38 → v39**.
- ✅ FIXED this session (all agnostic, no per-case hardcode; locked by unit tests):
  - `083717120131` → "Teenage Mutant Ninja Turtles II: The Arcade Game". Root
    cause: `significantTokens` dropped the roman "II" (length 2, not a digit) and
    counted "ii"≠"2". Fix: normalise any sequel notation (digit/roman/word) to its
    number via `getSequelIndicators`, so "II"=="2" corroborate together.
  - `3307216080831` → "Just Dance 2019". Cleaning now strips the generic seller
    placeholder "Inconnu" (LISTING_NOISE_TERMS) and the Dutch region code "nl"
    (LISTING_REGION_TERMS, peer of the existing fr/de/es) — both generic
    vocabulary, not per-product terms.
  - `5030917070914` → "Call Of Duty Modern Warfare". The spurious "— Edition" was
    a qualifier-less generic "Edition" label; it is now NEVER surfaced (a bare
    "Edition" informs the user of nothing). NOTE: an earlier attempt added a
    "Reflex"/"Réflexes" edition term — REVERTED as per-case hardcode. "Réflexes" is
    minority-corroborated, so the agnostic title is the base game (right game).
- ⚖️ WORKING-AS-INTENDED (not fixed by design): `045496365226` "Mario Kart" (not
  "Mario Kart Wii"). Marketplace says "Mario Kart" in 12+ listings vs "Wii" in 2;
  the engine correctly follows the majority, platformKey captured separately as
  `wii`. Restoring "Wii" needs platform-integral hardcoding the project forbids.
- **NOTE the fixtures can lie:** the `compile.consensusOverride` / `confidenceLock`
  tests use _sanitized_ hand-built fixtures that live data never produces — trust a
  fresh live run over them.

Expected titles:

| Barcode         | Expected title                                               |
| --------------- | ------------------------------------------------------------ |
| `083717120032`  | Teenage Mutant Ninja Turtles                                 |
| `083717120131`  | Teenage Mutant … II … Arcade                                 |
| `3307210117168` | Tom Clancy's Ghost Recon (no "2", not music)                 |
| `3307210196804` | Tom Clancy's Ghost Recon 2 — Classics                        |
| `5060057025413` | Gottlieb Pinball Classics                                    |
| `5026555042079` | Carnival Fete Foraine (no "Nouvelles Attractions")           |
| `8023171024790` | Zumba Fitness (no "World Party")                             |
| `3307215734384` | Just Dance 2014                                              |
| `3307216080831` | Just Dance 2019 (currently "Inconnu Just Dance 2019" — edge) |
| `045496365226`  | Mario Kart Wii (currently "Mario Kart" — platform edge)      |
| `045496362317`  | Wii Play                                                     |
| `045496363895`  | Super Paper Mario — Nintendo Selects                         |
| `045496400705`  | Skyward Sword — Édition Limitée                              |
| `5030917070914` | Modern Warfare — Édition Réflexes (resolves to right game)   |
| `4005209105378` | de Blob (no "de Blob 2", no spurious "Edition")              |

---

## 6. Also shipped this session (not part of the refactor)

- **Provider additions (clean, config/factory-driven):** 5 PrestaShop board-game
  shops (`prestashop/configs.ts`: lesgentlemendujeu, didacto, fairplayjeux,
  cestlejeu, ludocortex) + a **new generic Shopify factory**
  (`src/services/providers/shopify/`, first shop latelierdesjeux). Adding a shop
  = one config. See `barcode-extra-sources-evaluated` memory for the sites
  evaluated + rejected (Cloudflare-blocked / not barcode-addressable).
- **Image download validation** (`metadataStorage.ts`, `looksLikeImageBuffer`):
  rejects non-image HTTP-200 bodies (ScreenScraper "Erreur de login" text saved
  as `.jpg`). Corrupted files were cleaned; backup in
  `scratch/corrupted_uploads_backup/` (+ `scratch/clean_bad.ts` re-runnable).
- **Two metadata flows** confirmed clean: `resolveBarcode` (identify) → item →
  `getMetadata`/`fetchMetadata` (enrich by name). DRY smell flagged: PriceCharting
  title special-casing is scattered ~4× in `metadataFetch.ts` — consolidate.

---

## 7. How to resume in one line

The agnostic _title_ refactor is DONE and magic values are centralized
(`scoring.ts`). The remaining work is the confidence-layer unification in §3:
**first** add confidence + platformKey fixture tests (safe), **then** replace the
three overrides with the one consensus-derived rule, **then** run §5 live and bump
`BARCODE_CACHE_VERSION`. Do not mechanically delete the overrides — they are not
title-redundant (proven in §3).
