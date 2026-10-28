# Curated data — contrat des dossiers `curated/`

Companion de [data-layout.md](data-layout.md), [ADR.md](ADR.md) (ADR-006),
[provider_supply_modes.md](provider_supply_modes.md).

## Principe

ADR-006 : ce qui est **re-dérivable par script** vit sous `data/<pack>/`
(gitignored, stubs au postinstall) ; ce qui est **assemblé à la main** — sans
source officielle rejouable — vit sous `src/providers/<id>/curated/` et est
**commité**. Le curated est installé ou lu au refresh du pack ; `data/` ne
contient jamais d'original à la main.

**Sync normal = `data/` only.** Un Catalogue Sync / harvest ne doit pas dirty
`src/providers/` sauf changement d’**identifiants attestés**. Ledgers crawlés
(avec `observed`), cotes marketplace, faces/backs/packshots récupérables par
URL → `data/<pack>/sources/`, `data/<pack>/coleka-prices.json`,
`data/<pack>/cards|products/`. Curated = digs, reconstructions, maps d’ids,
Wayback durable non rejouable.

**Garder toutes les sources (sous `data/`).** Faces et packshots : chaque hôte
attesté s'installe en `art.<source>.*` (cartes) ou `art.<source>.*` (produits).
On ne skippe que si *cette* source est déjà sur disque — jamais « on a déjà
mieux ailleurs ». `faceChoice` / `productChoice` choisissent l'affichage.
Resume ≠ suppression d'un dump concurrent. **Pas** de miroir CDN dans
`curated/cards` — seulement l’irremplaçable (`art.reconstructed.*`, verso
découpé à la main, packshot sans URL stable).

Trois sous-rôles constatés, un provider ne prend que ceux dont il a besoin :

| Provider          | `cards/`                | `products/` | `sources/` | `BACK.md` |
| ----------------- | ----------------------- | ----------- | ---------- | --------- |
| `dbscg`           | ✓ (+ `template/` foil)  | —           | —          | ✓         |
| `dbsfw`           | ✓                       | —           | —          | ✓         |
| `lorcanatcg`      | ledger à la racine\*    | —           | —          | —         |
| `narutocarddass`       | ✓ (backs + reconstruct lang-first) | ✓           | ✓          | —         |
| `narutoshippuden` | ✓                       | —           | ✓ (+ digs) | ✓         |
| `narutoranks`     | ✓ (lang-first faces)    | ✓           | ✓          | ✓         |
| `narutodatacarddass` | ✓ (lang-first faces) | —           | ✓          | ✓         |
| `narutoultra`     | —                       | ✓           | ✓          | ✓         |

\* `lorcanatcg/curated/attestedFinishes.json` : ledger plat importé en TS
(`scrapeCards.ts`) — le rôle `sources/` n'impose pas de dossier.

## `curated/cards/` — versos de cartes

**Pas un cache Sync.** Les bytes récupérables par URL (CDN Kayou, TCG Cards
common backs, Nikita DBC, LorenZone packshots, …) vivent sous
`data/<pack>/cards|products/` uniquement — **pas** de miroir git sous
`curated/cards` / `curated/products`. Curated = irremplaçable (verso découpé à
la main, `art.reconstructed.*`, packshot sans URL stable).

Installeur partagé : `src/providers/shared/curatedCardsInstall.ts`
(`installCuratedCardBacks`) — miroir curated → data. **L'arbre est le contrat** :

- **Verso de pack** : `curated/cards/back.*` → `data/<pack>/cards/back.webp`.
- **Verso de set (lang-first)** : `curated/cards/{lang}/{set}/back.{lang}.*` →
  `data/<pack>/cards/{lang}/{set}/back.{lang}.webp`. Legacy
  `curated/cards/{set}/back.{lang}.*` reste accepté et est remappé via
  `langFirstSetBackDestRel`.
- **Verso localisé pack** : `back.{lang}.*` à la racine (`back.fr.png` →
  `back.fr.webp`) ; `lang` = 2 ou 4 lettres minuscules. Le runtime les résout
  via `backFilenameCandidates`.
- Extensions source : `webp`, `png`, `jpg`, `jpeg`. Un `.webp` est copié tel
  quel ; les autres sont convertis en **WebP lossless** (sharp, effort 6). La
  destination porte toujours l'extension `.webp`.
- Collecte : racine + `{set}/` legacy + `{lang}/{set}/` lang-first.
- **Idempotent par mtime** : ne réécrit que si la source est plus récente que
  la destination (`curatedDestStale`), sauf `--force`. Les doublons legacy du
  même stem (`back.png` à côté du `back.webp` installé) sont supprimés après
  install. `--dry-run` rapporte sans écrire.
- Segments dangereux ignorés (`.…`, `..`, `/`, `\`).
- Option `packBackDestName` : renomme le verso de pack à l'install (ex. Naruto
  EN sleeve → `back.en.webp`, quand le pack n'a pas de `back.webp` générique).

Le **markdown n'est pas copié** (voir plus bas). Les faces reconstruites
(`art.reconstructed.*` sous `{lang}/{set}/{id}/`) ne relèvent **pas** de
l'installeur partagé : le provider les installe lui-même
(`narutocarddass/install/curated.ts`, `narutoranks/install/reconstructedFaces.ts`,
…).

## `curated/products/` — packshots faits main

Visuels de produit sans source rejouable : badges de série découpés, logo du
jeu, emballages photographiés (`narutocarddass` : `wrappers/`, `jp-boosters/`),
retouches de cadrage, packshots fournis par le propriétaire
(`narutoranks/curated/products/{slug}/en/`), PNG reconstruits
(`narutoultra/curated/products/{slug}/fr/art.reconstructed.png`).

Pas d'installeur partagé : le code du provider les lit au build du pack
(`productChoice.ts`, `sealedProducts.ts`, `inkworksOfficial.ts`). Ils vivent
ici et **pas dans `staging/`** : le staging se reconstruit par script, donc
tout ce qu'on y pose à la main disparaît à la moisson suivante.

## `curated/products-contents.json` — graine de contenu scellé

Ledger **commité** des listes garanties (starters, promos fixes, math blister).
Schéma : `version: 1`, `skus[slug].guaranteedPrints[]` (`printKey`, `qty?`,
`finish?`) ou legacy `guaranteedPrintKeys`.

Au refresh / ingest sealed : `installProviderProductsContents` copie la graine
vers `data/<pack>/curated/products-contents.json` (+ miroir legacy
`sealed-contents.json`). Les **rebuilds Sync** (JCC depuis dbzcollection,
Bleach depuis Wayback HTML, …) écrivent uniquement sous `data/` via
`writeInstalledProductsContents` — ils ne dirty pas la graine git
(`updatedAt` / `verifiedAt`). **`persistSealedProductsIndex`** (writers) et
**`loadSealedProductsIndex`** appellent `mergeCuratedSealedContents`. **Ne
jamais** écrire `products-index.json` à la main sans
`persistSealedProductsIndex`. Éditer la graine git seulement pour une
attestation manuelle nouvelle ; l'overlay Sync vit sous `data/`.

Exemple Carddass : `src/providers/naruto/narutocarddass/curated/products-contents.json`
(posters S1–S4 + catalogues qty). Lorcana :
`src/providers/lorcana/lorcanatcg/curated/products-contents.json`.

## `curated/sources/` — ledgers d'attestation

Relevés JSON faits à la main (digs, maps d’ids, rubriques Coleka figées,
Wayback durable…) attestant ce qu'un dump ne prouve plus. Importés au build du
pack : `narutocarddass` (`mergeAttestedLedgers.ts`), `narutoshippuden`
(`buildFromLedgers.ts`), `narutoranks`, `narutoultra`.

**Syncables ≠ curated.** Checklists / ledgers crawlés + `observed` (y compris
dumps historiques plus jamais réécrits) → `data/<pack>/sources/` via
`definePackSyncedSources(packId)` (`@/providers/shared/syncedSources`) :

- `*SyncedSourcePath` — **écriture** (`packSyncedSourcePath` / `dataRoot`)
- `*SourcePath` — **lecture** (`resolvePackSyncedSourcePath`, fallback
  `cwd/data` si `PLACARR_DATA_DIR` est un stub vide)

Ne pas importer ces helpers depuis un module atteint par le graphe effects
client (`pack.ts` = constantes OK ; Leclerc / Card Game séparent déjà disk
helpers). Cotes marketplace → `data/<pack>/coleka-prices.json`,
`suruga-prices.json`, `pkmcards-fr.json`, etc. Curated ne garde que digs /
maps d’ids / Wayback durable / reconstructions. Ledgers Carddass / Shippuden /
Ranks / Ultra / Cardgame / Pokémon McDo / Leclerc lus au runtime depuis
`data/` (pas d’import TS statique des syncables).

## Markdown

Le markdown **est autorisé** dans `curated/` comme documentation locale —
`BACK.md` chez dbscg, dbsfw, narutoshippuden, narutoranks, narutoultra. Il
n'est **jamais installé** vers `data/` (`curatedCardsInstall` ne copie pas le
markdown).

## Déclarer son curatedDir et brancher l'install

Le provider expose une fonction qui renvoie `path.join(providerDir, "curated")`
— lui seul sait où elle est :

- `dbsCgCuratedDir()` / `dbsFwCuratedDir()` — `dbscg|dbsfw/installCurated.ts` ;
- `narutoCuratedDir()` — `narutocarddass/curatedPaths.ts` ;
- `narutoShippudenCuratedDir()` — `narutoshippuden/assets.ts`.

L'install est branchée dans le **CLI du pack**, étape « curated sync » en tête
de run (`--dry-run` / `--force` propagés) :

- `ensureCuratedPackAssets`
  (`src/providers/shared/cardCatalogue/curatedAssets.ts`) = backs +
  `full_foil_mask.webp` (plaque blanche 64×64, `installFullFoilMask`) →
  Catalogue Sync Masters / Fusion World.
- Catalogue Sync Naruto synchronise le curated en premier à **chaque** run
  (`ensureNarutoCuratedAssets`), même pour `--only index`.
- `runLocalTcgPipeline`
  (`src/providers/shared/cardCatalogue/localTcgLinePipeline.ts`) appelle
  `installCuratedCardBacks` — `narutoranks`, `narutoultra` ;
  `narutoshippuden/pipeline.ts` fait de même.
