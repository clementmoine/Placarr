# Backlog

> Dernière vérification : **2026-06-27** (`pnpm test` 827+ OK,
> `pnpm providers:audit:mapping`, `pnpm providers:health`).

## État actuel (snapshot)

| Métrique | Valeur |
| -------- | ------ |
| Providers audités | 41 |
| Mapping `ok` | 38 · `empty` 3 · `error` 0 |
| Observations `enabled` | **36** · `legacy` 0 · `unknown` 5 |
| Health-check | 32 modules · **0 down** |
| Tests | 830 passent |

**Queue migration metadata** (adapter + `observationMode = unknown`) :

1. `apriloshop` — search PrestaShop native vide (IQIT requis, voir § Apriloshop)
2. `thegamesdb` — probe vide sans `THEGAMESDB_API_KEY` en env (attendu en CI/local sans clé)

**Hors scope adapter metadata** (probe custom seulement — normal) :
`freakxy`, `ledenicheur`, `scandex`

**Providers avec adapter + observations** : inclut désormais `chasseauxlivres`
(`obs:enabled`, probe listing souvent `empty` côté scrape), `bedetheque`, `booknode`,
tous les PrestaShop/Shopify, etc.

Commandes utiles :

```bash
pnpm providers:audit:mapping   # mapping + observation mode
pnpm providers:health          # health-check rapide
pnpm providers:runtime         # smoke fetch par provider
pnpm providers:live-audit      # audit live comparateurs
pnpm providers:boardgame-live  # smoke jeux de société
pnpm backfill:slugs            # slugs items (volumes sans zéros dans l'URL)
```

---

### P0 — Principes (Cursor rules)

Règles persistantes dans `.cursor/rules/` :

- `placarr-principles.mdc` — providers plug-and-play, **aucun hardcode**, data-first, KISS
- `placarr-testing.mdc` — **TDD / zéro régression**, guards, quand lancer `pnpm test`

---

## Priorités ouvertes (ordre suggéré)

### P1 — Providers / scrape

| Item | Action | Doc |
| ---- | ------ | --- |
| **Apriloshop IQIT** | Ajouter `searchStrategy: native \| iqit` au factory PrestaShop + parse HTML IQIT ; sinon retirer le provider | § Apriloshop ci-dessous |
| **Chasse aux Livres probe `empty`** | Listing ISBN souvent bloqué en scrape serveur — vérifier FlareSolverr / sample ; pas un bug mapping | `provider_integration_checklist.md` |
| **TheGamesDB audit** | ~~Marquer `blocked` quand clé absente~~ **fait** — `runMappingProbe` + `mappingProbeConfigHint` | `thegamesdb/index.ts` |

### P2 — Ranking sans biais (gros chantier)

Voir [unbiased_ranking.md](unbiased_ranking.md) et [word_list_audit.md](word_list_audit.md).

1. Modèle d'observations complet (déjà amorcé — généraliser ranking images + facts)
2. Migrer le **chemin barcode** (`compile.ts`) vers observations (pas seulement metadata merge)
3. Dé-bias attachment : `isRealBoxCoverSource` remplace l'ancien name-set — spec restante dans [debias_attachment_display_score.md](debias_attachment_display_score.md)
4. Titres multilingues + ordre région = préférence utilisateur ([§ D](#d-display-language-region-order))

### P3 — Provider-blind core

Guard : `src/services/providerBlindnessGuard.test.ts` — **allowlist vide** (`src/` + `scripts/`, 2026-06-27).

Prochaines cibles optionnelles :

- P1 **Apriloshop IQIT** — `searchStrategy` PrestaShop factory
- P2 barcode observations (`compile.ts`)

### P4 — Exploitation champs provider

| Provider | unused | Piste |
| -------- | ------ | ----- |
| wikidata | ~72 | Variantes langue = bruit ; cibler P136/P178/P123/P856 |
| googlebooks | 9 | Repasser mapping (régression audit ?) |
| rawg | 8 | `clip` gameplay ; reste bruit |

Ne pas chasser le compte `unused` brut — voir note audit 2026-06-23 dans l'historique.

### P5 — Qualité / tests

- **Corpus barcode multi-types** ([§ F](#f-multi-type-barcodeitem-regression-corpus)) — `pnpm test:record:all` + livre / musique / film / JdS
- Fixtures `barcodeResolver.fresh.test.ts` quasi vides

### P6 — Architecture lib (optionnel)

Réorganiser `src/lib/` en sous-dossiers thématiques (`metadata/`, `media/`, `items/`) — pas de fusion des `services/providers/*` (plug-and-play voulu).

---

## Terminé / vérifié (ne pas rouvrir sans raison)

- **Observation migration metadata** : 36/38 adapters en `enabled` (schema `metadata-observations/v1`)
- **Factory PrestaShop/Shopify** : `scrapeCatalogModuleFactory` partagé
- **Apriloshop** : migré vers config PrestaShop (connecteur bespoke supprimé) — search toujours vide
- **Game lookup timeout** : ScreenScraper / PC gated sans signal plateforme (2026-06-22)
- **`confrontWithDatabase`** : provider-blind via trait `nameDatabase` (2026-06-23)
- **Merge covers** : traits `digitalStorefrontArt` / `canonicalCover` (steam/discogs)
- **`providerRegistry.isProviderConfigured`** : special-cases retirés
- **Multi-sample mapping probe** : `additionalSamples` + union clés (2026-06-23)
- **Provider health** : `pnpm providers:health` + scripts runtime/live documentés (2026-06-27)
- **Ludifolie observations** : sample Mille Sabords ajouté → `obs:enabled` (2026-06-27)
- **Metadata adapters** : `metadataResolvers.ts` supprimé — map unique dans `providerBootstrap.ts` (**fait 2026-06-27**)
- **Game barcode enrich** : `contributeGameBarcodeEnrichment` (**fait 2026-06-27**)

---

## Références détaillées (historique)

Les sections ci-dessous gardent le contexte des décisions. Pour le travail du jour, utiliser **Priorités ouvertes** + **État actuel** ci-dessus.

### Unbiased, data-first field ranking

Date: 2026-06-22 · Design : [unbiased_ranking.md](unbiased_ranking.md)

Proof-of-concept fait : signal type dérivé, Okkazeo, ancre marketplace, ranking titres par observations dans `metadataMerge.ts`.

### Provider migration factory

Boucle : resolver observations → tests contrat → `pnpm providers:audit:mapping` → health → checklist.

Waves A–D : largement couvertes ; ajouts récents `bedetheque`, `booknode` hors liste d'origine.

### Provider-blind core

[provider_agnostic_architecture.md](provider_agnostic_architecture.md) §0 · Guard `providerBlindnessGuard.test.ts`.

### Observation migration & exploitation

Dashboard : `pnpm providers:audit:mapping`.

État 2026-06-27 : voir tableau **État actuel**. Consommation observations : titres en merge ; barcode encore `sourceWeight` legacy.

### Apriloshop

Site sur **IQIT Search** ; AJAX PrestaShop natif renvoie `products: 0`.

**Fait** : config PrestaShop, factory agnostique, `collectRetailerBarcodeHits` générique.

**Reste** : `searchStrategy: iqit` dans `PrestashopRetailerConfig` + parse `product-miniature` une fois ; vérifier index barcode IQIT. Sinon **remove provider**.

Pas d'autre boutique PrestaShop à migrer (audit plateformes 2026-06-22 : seul apriloshop = PrestaShop+IQIT).

### Open studies

#### A. Two-phase vs decide-late

**Décision : keep decide-late** pour le scan barcode sans type.

#### B. Game-DB fan-out

**Fait 2026-06-22** — `gameLookup.ts` gated.

#### C. confrontWithDatabase echo

**Fait 2026-06-22/23** — `null` on miss ; provider-blind `nameDatabase`.

#### D. Display-language region order

`LOCALE_REGION_ORDER` fr-first → à brancher sur préférence utilisateur (lié unbiased step 4).

#### E. Provider health script

**Fait 2026-06-27** — `pnpm providers:health` dans `package.json`. BGG token lu lazily au `run()`.

#### F. Multi-type barcode regression corpus

`DEFAULT_BARCODE_REGRESSION_CASES` = jeux seulement. À enrichir : JdS `3421272109517`, livre, musique, film. Voir `TESTING.md`.

#### G. Observation contract TypeScript

Amorcé : `MetadataObservation`, Okkazeo premier émetteur ; généralisé depuis à la plupart des adapters.

#### H. Video-game platform catalog DRY

**Fait** — `videoGamePlatformSources.ts` + `videoGamePlatforms.ts`, pas d'appel live au scan.

### LaunchBox

Garder seulement si index local prébuild ; pas de download/extract au scan. Décision remove si pas assez rapide — [à mesurer].

---

## Liens

- [provider_integration_checklist.md](provider_integration_checklist.md)
- [provider_agnostic_architecture.md](provider_agnostic_architecture.md)
- [barcode_consensus_refactor.md](barcode_consensus_refactor.md)
- [hardcoding_audit.md](hardcoding_audit.md)
