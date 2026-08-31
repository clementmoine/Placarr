# Curated data — contrat des dossiers `curated/`

Companion de [data-layout.md](data-layout.md), [ADR.md](ADR.md) (ADR-006),
[provider_supply_modes.md](provider_supply_modes.md).

## Principe

ADR-006 : ce qui est **re-dérivable par script** vit sous `data/<pack>/`
(gitignored, stubs au postinstall) ; ce qui est **assemblé à la main** — sans
source officielle rejouable — vit sous `src/providers/<id>/curated/` et est
**commité**. Le curated est installé ou lu au refresh du pack ; `data/` ne
contient jamais d'original à la main.

Trois sous-rôles constatés, un provider ne prend que ceux dont il a besoin :

| Provider          | `cards/`                | `products/` | `sources/` | `BACK.md` |
| ----------------- | ----------------------- | ----------- | ---------- | --------- |
| `dbscg`           | ✓ (+ `template/` foil)  | —           | —          | ✓         |
| `dbsfw`           | ✓                       | —           | —          | ✓         |
| `lorcanatcg`      | ledger à la racine\*    | —           | —          | —         |
| `narutocarddass`       | ✓ (backs + reconstruct) | ✓           | ✓          | —         |
| `narutoshippuden` | ✓                       | —           | ✓          | ✓         |
| `narutoranks`     | ✓                       | ✓           | ✓          | ✓         |
| `narutoultra`     | —                       | ✓           | ✓          | ✓         |

\* `lorcanatcg/curated/attestedFinishes.json` : ledger plat importé en TS
(`scrapeCards.ts`) — le rôle `sources/` n'impose pas de dossier.

## `curated/cards/` — versos de cartes

Installeur partagé : `src/providers/shared/curatedCardsInstall.ts`
(`installCuratedCardBacks`). **L'arbre est le contrat** :

- **Verso de pack** : `curated/cards/back.*` → `data/<pack>/cards/back.webp`.
- **Verso de set** : `curated/cards/{set}/back.*` →
  `data/<pack>/cards/{set}/back.webp` — **voisin** des dossiers de langue
  (`en/`, `fr/`), jamais dedans. Un `back.*` sous `{set}/{lang}/` est ignoré
  avec un warning (un verso est partagé par toutes les langues du set).
- **Verso localisé** : `back.{lang}.*` au même niveau (`back.fr.png` →
  `back.fr.webp`) ; `lang` = 2 ou 4 lettres minuscules. Le runtime les résout
  via `backFilenameCandidates`.
- Extensions source : `webp`, `png`, `jpg`, `jpeg`. Un `.webp` est copié tel
  quel ; les autres sont convertis en **WebP lossless** (sharp, effort 6). La
  destination porte toujours l'extension `.webp`.
- Un seul niveau de set : la collecte lit la racine de `cards/` et ses
  sous-dossiers directs — pas de récursion plus profonde.
- **Idempotent par mtime** : ne réécrit que si la source est plus récente que
  la destination (`curatedDestStale`), sauf `--force`. Les doublons legacy du
  même stem (`back.png` à côté du `back.webp` installé) sont supprimés après
  install. `--dry-run` rapporte sans écrire.
- Segments dangereux ignorés (`.…`, `..`, `/`, `\`).
- Option `packBackDestName` : renomme le verso de pack à l'install (ex. Naruto
  EN sleeve → `back.en.webp`, quand le pack n'a pas de `back.webp` générique).

Le **markdown n'est pas copié** (voir plus bas). Les faces reconstruites
(`art.reconstructed.*` sous `{family}/{id}/{lang}/`) ne relèvent **pas** de
l'installeur partagé : le provider les installe lui-même
(`narutocarddass/install/installReconstructed.ts`).

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

Au refresh / ingest sealed : `installProviderProductsContents` copie vers
`data/<pack>/curated/products-contents.json` (+ miroir legacy
`sealed-contents.json`) ; `mergeCuratedSealedContents` applique sur
`products-index.json`. **Ne jamais** éditer uniquement sous `data/` — la
graine git est la source de vérité.

Exemple Carddass : `src/providers/narutocarddass/curated/products-contents.json`
(posters S1–S4 + catalogues qty).

## `curated/sources/` — ledgers d'attestation

Relevés JSON faits à la main (checklists, names, sets, coleka, mercari,
yahoo-auctions…) attestant ce qu'un dump ne prouve plus. Importés au build du
pack : `narutocarddass` (`mergeAttestedLedgers.ts`), `narutoshippuden`
(`buildFromLedgers.ts`), `narutoranks`, `narutoultra`. Certains exports vont
ensuite vers `data/` (ex. `apache-index` → `data/naruto/carddass/logs/`).

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
