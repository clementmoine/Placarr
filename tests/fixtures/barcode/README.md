# Fixtures réseau — golden-master "chemin frais"

Chaque `<case-id>.json` fige le trafic HTTP réel d'un scan code-barres
(réponses des providers), permettant de rejouer le pipeline `resolveBarcode`
de façon **déterministe**, sans réseau.

## Enregistrer / mettre à jour les fixtures

À faire **depuis un environnement où les providers répondent bien**
(ScreenScraper/IGDB authentifiés, pas de blocage d'IP type BGG 401, etc.) :

```bash
# Sous-ensemble (5 cas) — slim mode activé par défaut :
pnpm test:record

# Un seul cas (smoke, ~15 min max) :
pnpm test:record:one

# Les 21 cas canoniques — scripts/record-all-barcode-fixtures.ts lance
# un process vitest par cas (isolation des caches module entre providers) :
pnpm test:record:all
```

(`BARCODE_RECORD_SLIM=1` saute les lookups `slowBarcodeLookup` — LeDénicheur,
Chasse aux Livres, Freakxy — et l'enrichissement post-scan PriceCharting +
ScreenScraper ; PriceCharting reste l'ancre catalogue pour les jeux.)

(équivalent à `RECORD=1 BARCODE_RECORD_SLIM=1` devant la commande vitest,
avec `RECORD_CASE_ID=<case-id>` pour cibler un cas.)

Cela appelle les vraies API une fois et écrit un fixture par cas. Les clés
d'API sont **expurgées** automatiquement (`__REDACTED__`) avant écriture.

Le test RECORD appelle `assertExpectation` **avant** d'écrire le fichier : un
résultat incorrect n'est pas sauvegardé. Vérifie quand même le log `[record …]`
avant de commiter — un fixture dégradé verrouillerait un comportement faux.

**État 2026-07-02** : **21/21** fixtures enregistrées (slim mode). Les corps de
réponse > 128 ko sont tronqués à l'enregistrement et les sitemaps ignorés
(`httpReplay.ts`) ; les redirections conservent leur header `location`. Le
rejeu utilise un intercepteur réseau **partagé et jamais disposé** : toute
requête émise hors session (fuite asynchrone d'un cas précédent) reçoit un 504
déterministe au lieu d'atteindre le vrai réseau.

## Rejouer (par défaut, en CI)

```bash
pnpm test
```

Le REPLAY parcourt **tous** les cas canoniques : chaque fixture enregistrée est
rejouée automatiquement, les cas sans fixture sont ignorés (skip). La suite
reste donc verte tant que les fixtures n'ont pas été enregistrées, et chaque
fixture ajoutée s'active sans modifier le test.
