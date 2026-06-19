# Tests — Placarr

Runner : **Vitest**.

```bash
pnpm test           # lance toute la suite une fois
pnpm test:watch     # mode watch pendant le dev
pnpm test:coverage   # avec couverture
```

La primitive de l'app est **code-barres → item**. La règle d'or : on accepte de
dire *« je ne sais pas »* (résultat vide + suggestions), mais on ne renvoie
**jamais** une réponse confiante fausse. Les tests encodent cette exigence.

## 3 couches

### 1. Unit — le cerveau (déterministe, sans réseau)

Fonctions pures qui décident de la justesse.
Ex. [src/lib/barcode/query.test.ts](src/lib/barcode/query.test.ts) et
[src/lib/barcode/titleUtils.test.ts](src/lib/barcode/titleUtils.test.ts) :
détection de plateforme (Wii vs Wii U, GBA vs GB, PS3/PS2…), nettoyage du
code-barres, routage d'étagère — avec les cas « null honnête » quand on ne sait
pas. Ajoute un cas = ajoute une ligne dans le `it.each`.

### 2. Golden-master — barcode → item (déterministe, Prisma mocké)

[src/services/barcodeResolver.test.ts](src/services/barcodeResolver.test.ts)
fait passer de vrais `rawNames` (bruités) par le **vrai** `resolveBarcode`
(extrait dans [src/services/barcodeResolver.ts](src/services/barcodeResolver.ts)).
Sur un cache-hit, aucun appel réseau externe n'a lieu → 100% reproductible.

**Ajouter un scénario** (cas réel rencontré) :

1. Récupère les `rawNames` réels du cache pour ce code-barres
   (table `BarcodeCache` / `RawName`, ou la réponse de `/api/barcode`).
2. Ajoute un `it(...)` qui construit le cache via `makeCache({ rawNames, platformKey })`
   et appelle `resolveBarcode(barcode, type)`.
3. Vérifie le résultat attendu (nom propre, plateforme, suggestions exclues,
   nombre de matches, confiance). Lance le test : il **verrouille** le
   comportement courant. Toute régression future le fera échouer.

Les fonctions pures de précision de `barcodeResolver.ts` (nettoyage de titre,
détection « même produit », providers canoniques) sont aussi testées en unitaire
dans [src/services/barcodeResolver.pure.test.ts](src/services/barcodeResolver.pure.test.ts).

### 3. Golden-master du chemin frais — record/replay réseau

[src/services/barcodeResolver.fresh.test.ts](src/services/barcodeResolver.fresh.test.ts)
rejoue le **premier scan** (cache vide → providers → matching) sur des fixtures
réseau figées ([tests/helpers/httpReplay.ts](tests/helpers/httpReplay.ts), via
`@mswjs/interceptors` : couvre axios **et** fetch). Déterministe, couvre aussi
les cas « je ne sais pas ». Les cas sans fixture sont ignorés (skip).

Enregistrer les fixtures (depuis un environnement aux providers sains) :

```bash
RECORD=1 pnpm vitest run src/services/barcodeResolver.fresh.test.ts
```

Voir [tests/fixtures/barcode/README.md](tests/fixtures/barcode/README.md). Les
clés d'API sont expurgées automatiquement avant écriture.

### 4. Canary live (non bloquant)

La route admin `src/app/api/admin/barcode-regression/route.ts` rejoue les cas
contre les **vraies** API (depuis l'écran admin). Sert à détecter quand un
fournisseur tiers change ses données — à lancer manuellement, jamais en CI.
