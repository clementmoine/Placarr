# Fixtures réseau — golden-master "chemin frais"

Chaque `<case-id>.json` fige le trafic HTTP réel d'un scan code-barres
(réponses des providers), permettant de rejouer le pipeline `resolveBarcode`
de façon **déterministe**, sans réseau.

## Enregistrer / mettre à jour les fixtures

À faire **depuis un environnement où les providers répondent bien**
(ScreenScraper/IGDB authentifiés, pas de blocage d'IP type BGG 401, etc.) :

```bash
# Sous-ensemble borné en temps (4 cas, ~5 min/cas si réseau lent) :
pnpm test:record

# Les 18 cas canoniques en une seule passe :
pnpm test:record:all
```

(équivalent à `RECORD=1` / `RECORD=1 RECORD_ALL=1` devant la commande vitest.)

Cela appelle les vraies API une fois et écrit un fixture par cas. Les clés
d'API sont **expurgées** automatiquement (`__REDACTED__`) avant écriture.

Le test RECORD appelle `assertExpectation` **avant** d'écrire le fichier : un
résultat incorrect n'est pas sauvegardé. Vérifie quand même le log `[record …]`
avant de commiter — un fixture dégradé verrouillerait un comportement faux.

**État 2026-06-29** : dossier vide sauf ce README. `RECORD=1` sur le sous-ensemble
par défaut (5 cas) a expiré à 300s/cas (timeouts ScreenScraper / PicClick depuis
cet environnement). Relancer quand le réseau et les credentials providers sont OK ;
voir aussi [backlog.md § Roadmap](../backlog.md#roadmap-prochaines-étapes).

## Rejouer (par défaut, en CI)

```bash
pnpm test
```

Le REPLAY parcourt **tous** les cas canoniques : chaque fixture enregistrée est
rejouée automatiquement, les cas sans fixture sont ignorés (skip). La suite
reste donc verte tant que les fixtures n'ont pas été enregistrées, et chaque
fixture ajoutée s'active sans modifier le test.
