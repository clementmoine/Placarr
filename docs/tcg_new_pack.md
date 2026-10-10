# Ajouter une ligne TCG locale

Contrat vivant — ce qu’il faut déclarer pour qu’un nouveau jeu ouvre un
onglet catalogue, une recherche, une ownership / checklist et un sync admin
**sans** inventer de chemins core.

Companion : [card_pack_contract.md](card_pack_contract.md) (audit historique),
[catalogue_contract.md](catalogue_contract.md), [curated_data.md](curated_data.md),
[sealed_product_contents.md](sealed_product_contents.md).

## Chemin obligatoire

```
src/providers/<franchise>/<id>/
  pack.ts          # ids stables (provider, pack, effect, printGame)
  printKey.ts      # mint / parse / format / setLabel (+ catalogueSetCodes)
  index.ts         # createLocalTcgLine | createEmptyLocalTcgProvider
  extract.ts       # runLocalTcgPipeline({ seed, seedProducts? })
  curated/         # cards / products / sources (voir curated_data.md)
```

Registry : une entrée dans `core/catalog/registry.ts` — **aucun** literal de
provider id hors `providers/`.

| Factory | Quand |
| ------- | ----- |
| `createEmptyLocalTcgProvider` | Onglet avant la première moisson + hooks sync |
| `createLocalTcgLine` + `cardCatalogueHooks` | Même chose, si le pack compose les hooks lui-même (ex. Ninja Ranks) |

Les deux passent par `LocalTcgLineSpec`. Le core consomme uniquement
`ProviderModule` (`searchPrints`, `lookupPrint`, `listPrintSets`,
`listSetPrints`, `catalog.refresh` / `status`).

## `LocalTcgLineSpec` — surface générique

| Champ | Rôle |
| ----- | ---- |
| `providerId` / labels / `notes` | Identité onglet + facts |
| `packId` / `effectPackId` | Disque `data/<pack>/` + foil pack |
| `printGame` | Segment jeu du `printKey` (`game:set-number`) |
| `catalogueSetCodes` | Chapitres alphabétiques (`nr`, `uc`, `a`…) — dériver via `alphabeticCatalogueSetCodes([...])` |
| `defaultLanguage` / `listSetLanguages` / `searchPreferLanguage` | Locales |
| `catalogLifecycle` | `finished` → pas d’auto-sync Plex-like |
| `formatReference` / `setLabel` / `setSortKey` / `normalizeSearchQuery` | Affichage + recherche |
| `cardAssetUrl` / `borrowFaceAcrossLocales` | Faces disque |
| `listRemotePrintSets` | Sets annoncés hors DB locale |
| `decorateCandidate` | Post-traitement (dos, catégorie) |
| `probePrintKey` | Sonde mapping / admin (printKey réel du jeu) |

**`printGame`** : un slug par univers de checklist. Partager (`naruto` pour
Carddass / Ranks / Ultra / 疾風伝) seulement si la possession doit se croiser ;
sinon un jeu propre (`kayou`, `mythos`, `dbsjcc`, `bleachscb`).

Déjà fourni par la factory (ne pas réécrire) :

- schéma sqlite `prints` / `print_titles` / `print_assets` via `createLocalPrintsIndex`
- `searchPrints` / `lookupPrint` / `listPrintSets` / `listSetPrints`
- health-check + probe metadata
- sync admin via `cardCatalogueHooks` → `runPipeline`

Pipeline générique : `runLocalTcgPipeline` (seed cartes → export index →
dimensions faces → curated assets → seed produits).

Étapes extract multi-passes : `selectCatalogueSteps(argv, STEPS, { online,
offByDefault })` dans `catalogueSteps.ts` — même contrat `--only` / `--skip` /
`--offline` que les packs hérités.

## Identité print — règles non négociables

1. **Mint** avec `buildPrintKey({ game, set, number, grouping? })` — jamais une
   string collée à la main.
2. **Set-scoped** : le set du printKey est le **chapitre catalogue** (série /
   extension), pas la famille de numéro (`ni` / `ta` legacy Carddass).
3. Numéros **game-unique** (`d0123`, `shi0043`) → `catalogueSetFromPrintKey`
   lit le set sans déclaration.
4. Numéros **nus** (`001`, `47`) + set alphabétique (1–6 lettres) →
   `catalogueSetCodes: alphabeticCatalogueSetCodes(Object.keys(SET_LABELS))`.
   Sinon ownership / checklist voient `null`. Codes avec chiffre (`s11`, `h1`),
   `promo` / `prerelease`, ou >6 lettres se résolvent seuls.
5. Langue **hors** clé (`printKey` identique FR/EN/JA).

## Ce qui reste pack-spécifique (volontaire)

| Zone | Où | Pourquoi |
| ---- | -- | -------- |
| Parse des refs imprimées | `printKey.ts` / `parse/*` | Format éditeur |
| Harvest / ledgers | `harvest/`, `install/` | Sources hétérogènes |
| Faces & dos | curated + install | CDN / scrape / dump |
| Scellé + contenus | `sealed.ts` + `products-contents.json` | SKU réels |
| Prix | `sources/prices.ts` ou market provider | Retailer |
| Foil | `effects/<id>` + finish pack | Rendu |
| Orientation paysage | `cardsIndex` / faceOrient | Maquette |

Ne **pas** ajouter de `if (providerId === …)` dans `core/` pour ces écarts :
étendre `LocalTcgLineSpec` ou un hook `ProviderModule` si le besoin est
récurrent (≥2 packs).

## Checklist nouveau pack (vide → vivant)

1. [ ] `pack.ts` — ids + `*CuratedDir()`
2. [ ] `printKey.ts` — mint/parse/format + `CATALOGUE_SET_CODES` si sets alpha
3. [ ] `index.ts` — `createEmptyLocalTcgProvider({ lineSpec, runPipeline })`
4. [ ] Registry + test module (`info.id`, `printGames`, `catalog.dataPack`)
5. [ ] `extract.ts` — `runLocalTcgPipeline` (seed peut écrire 0 cartes)
6. [ ] Curated minimal (`cards/back.*`, éventuellement `products/`)
7. [ ] Quand les données arrivent : ledgers → install → faces → sealed →
      `products-contents.json` (conseil d’achat)
8. [ ] Test : `catalogueSetFromPrintKey` sur un printKey réel du jeu
9. [ ] Ajouter l’id provider à `FACTORY_LOCAL_TCG_IDS` dans
      `localTcgContract.test.ts` (garde search / lookup / sets / catalog)
10. [ ] `pnpm test` vert ; pas de literal provider hors `providers/`

## Packs hors factory (héritage)

`narutocarddass`, `lorcanatcg`, `pokemon/live`, `dbscg`, `dbsfw` ont leur
propre index / pipeline. Ils doivent **converger** vers le même contrat app
(`PrintCandidate`, set-scoped keys, `catalogueSetFromPrintKey`) mais ne sont
pas le modèle pour un **nouveau** jeu — partir de
`createEmptyLocalTcgProvider`.

**Dual owners** (corpus local + API) : le module `dataPack` expose quand même
`searchPrints` / `lookupPrint` / `listPrintSets` / `listSetPrints` (Lorcana
local, Pokémon Live). Le sibling API garde le repli distant — ne pas laisser
le picker dépendre uniquement de l’API.

## Exemples de référence

| Pack | Fabrique | Notes |
| ---- | -------- | ----- |
| `bleach/bleachscb` | empty | Sets alpha + FR/JA |
| `naruto/narutoranks` | localTcgLine | `catalogueSetCodes` + borrow faces |
| `naruto/narutoultra` | localTcgLine | Un seul set `uc` |
| `onepiece` | empty | `listRemotePrintSets` + decorate back |
| `mtg` / `yugioh` | empty | Onglets avant moisson |
