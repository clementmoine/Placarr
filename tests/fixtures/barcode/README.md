# Fixtures réseau — golden-master "chemin frais"

Chaque `<case-id>.json` fige le trafic HTTP réel d'un scan code-barres
(réponses des providers), permettant de rejouer le pipeline `resolveBarcode`
de façon **déterministe**, sans réseau.

## Enregistrer / mettre à jour les fixtures

À faire **depuis un environnement où les providers répondent bien**
(ScreenScraper/IGDB authentifiés, pas de blocage d'IP type BGG 401, etc.) :

```bash
RECORD=1 pnpm vitest run src/services/barcodeResolver.fresh.test.ts
```

Cela appelle les vraies API une fois et écrit un fixture par cas. Les clés
d'API sont **expurgées** automatiquement (`__REDACTED__`) avant écriture.

Vérifie ensuite la qualité du résultat loggé (`[record …]`) avant de commiter :
on ne commite **que** des fixtures dont le résultat est correct — un fixture
dégradé verrouillerait un comportement faux.

## Rejouer (par défaut, en CI)

```bash
pnpm test
```

Les cas sans fixture sont automatiquement ignorés (skip) : la suite reste verte
tant que les fixtures n'ont pas été enregistrées.
