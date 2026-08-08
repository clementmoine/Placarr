# Handoff — Live owned + craft API (2026-08-08)

Branche `feat/foundation-postgres-tests`. Compte Live sniffé : `mrtheinsane`.
Réf. technique longue : `docs/pokemon_live_rainier.md` (§6 owned, §7 purchase).

---

## 1. Verdict

- **Lire** inventaire / carddex / wallet → API Rainier OK (plus besoin de MuMu disk).
- **Craft** → API OK : `POST /commerce/v1/external/catalog/purchase` avec
  **`purchaseRequestDetails`** (pas `shopOfferingPurchaseRequests` — leurre
  d’erreur serveur).
- Playroom admin préfère les faces `liveOwned.json` et affiche un badge **Live**
  (« owned · comparables MuMu ») + effets owned en tête de grille.
- Tokens PTCS **à re-sniffer** : refresh `ory_rt_*` single-use, brûlés pendant
  les essais. Ne pas committer `.tmp-foil-audit/`.

---

## 2. Auth (rapide)

1. OAuth PTCS `access.pokemon.com` (`client_id=tpci-tcg-app`) → `ory_at_` + `ory_rt_`
2. `POST …/user/v1/external/routing/route` `{ clientTypeAccessKey }` → `apiEndpoint`
3. Guest register → `POST …/account/v1/external/token/auth` `{ authToken, authType: "PTOK" }`
4. Studio JWT pour commerce

`clientTypeAccessKey` = `421d8904-0236-4ab4-94f5-a8a84aeb3f7b`.

**Capture tokens** : mitm sur WebView OAuth (`10.0.2.2:8080`) ; Unity API
bypass souvent le proxy. Stocker sous
`.tmp-foil-audit/live-unity/mitm/tokens.json`.  
Script sync : `pnpm foil:pokemon:sync-owned` (`scripts/pokemon/syncLiveOwned.ts`)
— préfère refresh ; si 400 `invalid_grant`, relancer l’app / login et re-sniff.

---

## 3. Craft — body exact

```json
{
  "purchaseRequestDetails": [
    { "shopOfferingId": "bw6-5_2", "quantity": 1 }
  ],
  "idempotencyKey": "<uuid-v4-nouveau>"
}
```

- `shopOfferingId` = `cardId` craftable.
- Prix : `POST …/shop/offerings/active` (gzip) → `priceData.TradeCurrency`.
- **Nouvelle clé = nouvel achat / re-debit.** Même clé = retry idempotent.
- Ne pas envoyer `gameContext` (→ Malformed).
- ⚠️ Probes multi-clés sur la même offre ont brûlé des crédits (Dratini ×N).

---

## 4. État compte (fin de passe)

| | |
|---|---|
| TradeCurrency | **~535** (était ~1580 → crafts manuels + batch API) |
| HardCurrency | 150 |
| carddex | ~421 |

### Effets avec owned (playroom Live)

AceFoil, AngledPillars (`smalt_fr_001`), Cosmos, CrackedIce, FlatSilver,
Galaxy (`xy12_fr_011`), Rainbow, SunBeam (`sm1_fr_009`), SunLava, SunPillar,
SvHolo, SvUltra, SwHolo, Thatch, Tinsel (`bw6-5_fr_001` + `_002`).

### Toujours sans owned (budget / pas d’offre)

| Effet | Prix mini observé | Note |
|---|---|---|
| RadiantHolo | ~600 | pas assez de Trade |
| Squares | ~600 | idem |
| SwSecret | ~600 | idem |
| 25thConfetti | ~1250 | |
| SolidColor | ~2000 | |
| SvUltraGoldRainbow | ~2000 | |
| SvUltraScodix | ~2000 | |
| Stamped | — | **aucune** offre catalogue (pas craftable API) |

Batch artifacts : `.tmp-foil-audit/live-unity/mitm/craft_batch_missing_effects.json`.

---

## 5. Code Placarr touché (souvent **non commité**)

| Fichier | Rôle |
|---|---|
| `src/effects/pokemon/liveOwned.json` | cache carddex → stems `_fr_` par effet |
| `src/effects/pokemon/liveOwnedBundles.ts` | `ownedBundlesForShader` |
| `src/effects/pokemon/playroomArt.ts` | owned d’abord ; flag `liveOwned` ; `ec_*` après Pokémon |
| `src/components/admin/FoilPlayroom.tsx` | badge Live, tri owned en tête |
| `scripts/pokemon/syncLiveOwned.ts` | `pnpm foil:pokemon:sync-owned` |
| `docs/pokemon_live_rainier.md` | auth + commerce + purchase |

**Commit poussé** (autre sujet) : `e9c172c` vendor simeydotme CSS + NOTICE.
Le reste du working tree (foil Live, playroom owned, scripts pokemon, …) est
encore **dirty / untracked** — ne pas tout amalgamer dans un commit simey.

---

## 6. Outillage MuMu

- Emulator `emulator-5554`, package `com.pokemon.pokemontcgl` 1.40.0
- mitm + frida utiles pour OAuth ; paths commerce connus sans Frida SSL unpin
- **Ne pas** `POST …/collections/create` `{}` (crée un deck vide)

---

## 7. Prochaines étapes suggérées

1. Re-sniff OAuth → `tokens.json` frais (ne pas brûler le refresh en double).
2. `pnpm foil:pokemon:sync-owned` pour rafraîchir `liveOwned.json` / wallet.
3. Quand Trade ≥ 600 : un craft **par** effet (RadiantHolo / Squares / SwSecret)
   — **une** clé, stop au premier `PAID`.
4. Commit dédié « live owned + playroom Live badge + rainier purchase docs »
   (séparé du vendor simey).
5. Optionnel : script `foil:pokemon:craft-missing` (plan cheapest + dry-run +
   `--effect` / plafond Trade) pour ne plus probe à la main.
6. Stamped : autre voie (pack / event) si jamais craftable.

---

## 8. Pièges

- Erreur `[shopOfferingPurchaseRequests are required]` alors que le champ est
  présent → mauvais nom de champ ; utiliser **`purchaseRequestDetails`**.
- `live-cards.sqlite` souvent `lang=de` avec noms DE dans `name_fr` — stems
  normalisés `_fr_` pour le playroom.
- AngledPillars : éviter `ec_*` en face héro (énergie) ; préférer `smalt_fr_001`.
- Inventory GUID `{hi,lo}` ≠ carddex `cardId` — pour foil owned, **carddex**.
