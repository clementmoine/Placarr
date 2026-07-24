# Tests — Placarr

Runner : **Vitest**.

```bash
pnpm test           # suite complète
pnpm test:watch     # watch
pnpm test:coverage  # couverture
```

Règle d’or produit : **barcode → item** — vide honnête OK, **faux positif confiant interdit**.
Voir aussi `.cursor/rules/placarr-testing.mdc`.

## 3 couches

### 1. Unit — fonctions pures (déterministe, sans réseau)

Exemples sous `src/core/` :

- `identify/query.test.ts`, `identify/titleUtils.test.ts` — plateforme, nettoyage barcode
- `enrich/titles/*.test.ts`, `enrich/titleMatching.test.ts` — titres / residual
- `commerce/retailer/*.test.ts` — gates prix / fiches

Ajouter un cas = une ligne `it.each` (ou un `it` nommé sur le comportement).

### 2. Golden-master — barcode → item (Prisma mocké)

- [src/core/identify/resolver.test.ts](src/core/identify/resolver.test.ts) — cache-hit via `makeCache` + `resolveBarcode`
- Compile / confiance : `src/core/identify/evidence/compile.*.test.ts`

**Ajouter un scénario réel** :

1. Récupérer les `rawNames` (table `BarcodeCache` / réponse `/api/barcode`)
2. `it(...)` avec `makeCache({ rawNames, platformKey })` → `resolveBarcode(barcode, type)`
3. Assert nom / plateforme / suggestions / confiance

### 3. Fresh path — record/replay réseau

- [src/core/identify/resolver.fresh.test.ts](src/core/identify/resolver.fresh.test.ts)
- Fixtures : [tests/fixtures/barcode/](tests/fixtures/barcode/) + [tests/helpers/httpReplay.ts](tests/helpers/httpReplay.ts)

```bash
pnpm test:record       # sous-ensemble
pnpm test:record:one   # RECORD_CASE_ID=…
pnpm test:record:all   # 21 cas, un process par cas
```

### 4. Canary live (manuel, hors CI)

Route admin `src/app/api/admin/barcode-regression/route.ts` — rejoue contre les vraies API.
