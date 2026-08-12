# Pokémon TCG Live — Rainier / API (notes opérables)

Réfs. externes (catalogue / tooling Rainier — **pas** inventaire joueur) :

| Repo | Intérêt |
|---|---|
| [zwolsman/ptcgl.dev @ `7415f015`](https://github.com/zwolsman/ptcgl.dev/tree/7415f01582dc7af86e93bf38bbd5b45b2d136236) | Miroir CDN + auth + `DataTableCodec` + [`DESIGN.md`](https://github.com/zwolsman/ptcgl.dev/blob/7415f01582dc7af86e93bf38bbd5b45b2d136236/DESIGN.md) (faits prod vérifiés) |
| [Hastwell/Omukade.ProcedualAssemblyRewriter](https://github.com/Hastwell/Omukade.ProcedualAssemblyRewriter) | `RainierFetcher` — updater `Manifest.json` / release notes (AGPL) |
| [Hastwell/Omukade.RainierCardDefinitionFetcher](https://github.com/Hastwell/Omukade.RainierCardDefinitionFetcher) | Fetch config-docs via login PTC + assemblies client (AGPL) — carddb / rules / defs ; **pas** collection owned |
| Homebrew cask `pokemon-tcg-live` | `installer.studio-prod…` + livecheck sur `…/updater/StandaloneOSX/ReleaseNotes/notes_en.json` |

Recherche code utile : [`cdn.studio-prod.pokemon.com` sur GitHub](https://github.com/search?q=cdn.studio-prod.pokemon.com&type=code)
(~28 hits ; le reste = forks cask / listes bugbounty / dumps d’URLs OSX).

### Autres endpoints (code search, 2026-08-08)

| Query | Hits utiles | Bruit |
|---|---|---|
| `api.studio-prod.pokemon.com` | **ptcgl.dev** seulement | listes bugbounty |
| `api.us-east-1.studio-prod…` | **ptcgl.dev** `DESIGN.md` | idem |
| `configdocument/getMultiple` | **ptcgl.dev** seul | — |
| `tpci-tcg-app` / `421d8904-…` | **ptcgl.dev** + **Omukade CardDefinitionFetcher** | — |
| `studio-preprod.pokemon.biz` | **ptcgl.dev** `DESIGN.md` | — |
| `installer.studio-prod…` | Homebrew cask (+ forks) | — |
| `access.pokemon.com` | Omukade `AccessHelper` (OAuth PKCE) ; sinon GO/MAD/etc. | beaucoup de faux positifs PTC |
| `me.pokemon.com` | rien TCGL (HOME / GO / DNS lists) | — |
| `clientTypeAccessKey` | **ptcgl.dev** seul (4 fichiers) | — |
| `external/token/register` | **ptcgl.dev** | faux positif `Rayllanderson/raybank` |
| `tpcitcgapp/callback` / `routing/route` / `getMultiple` | **ptcgl.dev** + forks Omukade (`Hastwell`, `Hill-98`, `mrzapa`) | — |
| `PTOK` + studio/ptcgl | **ptcgl.dev** + Omukade forks | bruit datasets / PoGo |

*(Relancé via UI GitHub connectée — pas de rate-limit API.)*

Conclusion : hors **ptcgl.dev** + famille **Omukade**, GitHub n’a quasiment
pas d’implémentation des endpoints studio / config-docs. Pas de repo public
d’inventaire owned trouvé via ces strings.

Omukade `AccessHelper` (bonus) : login PTC browser-like —
`access.pokemon.com/oauth2/auth` + PKCE, `client_id=tpci-tcg-app`,
`redirectURI=https://tpcitcgapp/callback`, scopes
`offline screen_name openid friends`, audience
`op-core.pokemon.com` + `api.friends.pokemon.com`, puis
`POST …/oauth2/token` avec `code` + `code_verifier`.

Placarr a déjà le chemin **CDN public** + decode partiel des `card-database-*`
(`src/providers/pokemontcglive/*`, `pnpm foil:pokemon`). Ce doc consolide
ptcgl.dev / DESIGN + sniffs MuMu.

---

## 1. Ce que c’est / n’est pas

| | |
|---|---|
| **Oui** | Auth studio → config-docs → CDN UnityFS **et** commerce owned (carddex / inventory) |
| **Disque app** | Pas d’inventaire joueur dans les fichiers MuMu (prefs / UnityCache seulement) |
| **Miroirs publics** | ptcgl.dev / Omukade = catalogue ; **pas** les routes commerce owned |

Pour l’owned playroom : `pnpm foil:pokemon:sync-owned` →
`data/pokemon/liveOwned.json` + `pnpm foil:pokemon:inventory-faces`.

---

## 2. Chaîne auth (ptcgl.dev `AuthClient` / `PtcsTokenClient`)

Ordre figé :

1. **PTCS refresh** — `POST https://access.pokemon.com/oauth2/token`  
   `grant_type=refresh_token`, `client_id=tpci-tcg-app`  
   Refresh = `ory_rt_*` (scope `offline_access`), **single-use** : persister le
   nouveau `refresh_token` dès HTTP 200.
2. **Route** — `POST https://api.studio-prod.pokemon.com/user/v1/external/routing/route`  
   body `{ clientTypeAccessKey }` → `apiEndpoint` régional.
3. **Guest** — `POST {apiEndpoint}/account/v1/external/token/register`  
   `{ clientTypeAccessKey, clientId }` → guest bearer.
4. **Studio JWT** — `POST {apiEndpoint}/account/v1/external/token/auth`  
   `{ authToken: <ptcs access>, authType: "PTOK" }` + `Authorization: Bearer <guest>`  
   → studio token.
5. **Config docs** — `POST {apiEndpoint}/config/v1/external/configdocument/getMultiple`  
   `{ requests: [{ id }, …] }` + `Authorization: Bearer <studio>`  
   → `{ documents: { <id>: { id, revision, data: { … contentBinary|contentString } } } }`.

Identifiants client (publics dans `sync/.../application.yaml` du miroir) :

| Clé | Valeur |
|---|---|
| `rainier.client-id` | `tpci-tcg-app` |
| `rainier.client-type-access-key` | `421d8904-0236-4ab4-94f5-a8a84aeb3f7b` |
| `rainier.app-version` (ex.) | `1.40.0` |
| `rainier.platform` | `android` / `osxplayer` / … |

Studio 424 = access PTCS invalidé côté serveur → forcer un refresh puis retry
(une fois), comme `AuthService` du miroir.

**Guest seul insuffisant** (`DESIGN.md`) : config-docs → `10102 User access denied`
sans upgrade PTOK. Refresh PTCS **single-use** (rotation obligatoire).

Docs de contrôle utiles via `getMultiple` : `asset-bundle-manifest_0.0`,
`card-databases-manifest_0.0`, `set-manifest_0.0` (+ les `card-database-*` /
compendiums).

---

## 3. CDN — sans auth

| Ressource | URL |
|---|---|
| GameSettings | `https://cdn.studio-prod.pokemon.com/rainier/GameSettings/{ver}/GameSettings.json` |
| Content root | clé `{platform}_contentpath` (+ évent. `{platform}_env_redirect_contentpath`) |
| Bundle | `{contentPath}{dir}/{bundle}` — miss souvent **403** S3, pas 404 |
| Manifest | `{contentPath}{bucket}/manifest_{locale}_{bucket}` (UnityFS → `AssetManifest`) |
| Updater (desktop) | `…/rainier/updater/Standalone{OSX\|Windows64}/Manifest.json` + `ReleaseNotes/notes_*.json` |
| Installer Mac | `https://installer.studio-prod.pokemon.com/installer/PokemonTCGLiveInstaller_Mac.dmg` |

**Host contentpath non stable** — ex. migration `cdn.studio-prod.pokemon.com` →
`cdn.studio-preprod.pokemon.biz` entre clients 1.38→1.39. Toujours lire
GameSettings au runtime (Placarr : `gameSettings.ts`).

Buckets : `10101_0000` (base ~40k) + drops datés `YYYYMMDD_1700` ; les plus
récents **override** par hash. Noms carte : `{set}_{locale}_{num}` (+ `_t`
thumbnail). Liste des dirs : config-doc `asset-bundle-manifest_0.0` →
`directories[]`.

Placarr : `gameSettings.ts` / `cdn.ts` / `pnpm foil:pokemon:sources`.

---

## 4. Decode `card-database` (ptcgl.dev `DataTableCodec`)

Pipeline documenté (plus propre que le parse « voisinage longForm » actuel) :

1. base64 (`contentBinary` ou `contentString`)
2. octet moteur `BufferedRealtimeCompressionEngine` : `0x00` = raw dès offset 1 ;
   sinon QuickLZ level-1 sur le reste
3. DataTable .NET LE : tableName, colCount, colonnes `(name, typeName)`, rowCount,
   cellules = marqueur (`0` = valeur, `1|2` = null) + typed read

Réf. Kotlin : `rainier/.../codec/{DataTableCodec,QuickLz,DotNetBinaryReader}.kt`  
Fixtures : `rainier/src/test/resources/fixtures/card-db-sv1-{en,fr}.*`

Chez nous : `cardDatabase.ts` extrait l’identité via regex / voisinage — suffisant
pour `live-cards.sqlite` ; un port typé du codec reste optionnel si on veut
toutes les colonnes (Craftable, HiddenUntilOwned, quantity catalogue, …).

`quantity` dans le schéma table = **colonne catalogue**, pas l’inventaire joueur
(les JSON device = mêmes bytes que le dump local).

---

## 5. Sniff MuMu (2026-08-08) — hôtes

Relance app, tcpdump : **uniquement HTTPS**, zéro HTTP clair.

SNI vus : `cdn.studio-prod.pokemon.com`, `api.us-east-1.studio-prod.pokemon.com`,
`api.studio-prod.pokemon.com`, `access.pokemon.com`, `me.pokemon.com` (+ Datadog /
Crashlytics / Google / MuMu).

PCAP : `.tmp-foil-audit/live-unity/launch_sniff.pcap`.

---

## 6. Commerce owned (2026-08-08 — vérifié compte live)

Chaîne auth §2 inchangée (PTCS → route → guest → PTOK studio JWT). Ensuite,
contre `{apiEndpoint}` (ex. `https://api.us-east-1.studio-prod.pokemon.com`) :

| Méthode | Path | Body | Réponse utile |
|---|---|---|---|
| POST | `/commerce/v1/external/carddex/getCardDexData` | `{}` | `{ cardRecords: [{ cardId, timestamp, isNew }] }` — **cardId** type `me5_45`, `sv4_177` |
| POST | `/commerce/v1/external/inventory/get` | `{}` | `{ items: [{ hi, lo, count }], version, currencies }` — GUID .NET en deux int64 ; **mixte** cartes / avatars / items |
| POST | `/commerce/v1/external/wallet/get` | `{}` | `{ currencyStacks: [{ name, quantity }], version }` |
| POST | `/commerce/v1/external/collections/list` / `all` | `{}` | Decks (items aussi en hi/lo) |

Chemins tirés de `global-metadata.dat` (`/commerce/v1/external/…`). Les guesses
`/account/v1/external/inventory/get` → **403** (route gate, pas la bonne famille).

**Owned playroom** : joindre `cardId` → `live-cards.sqlite.card_id` →
`foil_effect` + stem normalisé `_fr_` → `data/pokemon/liveOwned.json`.
Snapshot compte (ex.) : 412 carddex / 1269 inventory items / foil leaves
AceFoil, FlatSilver, Rainbow, SunPillar, SvHolo, SvUltra (+ Thatch manuel).

Tokens PTCS (`ory_at_*` / `ory_rt_*`) : **ne pas committer** — garder sous
`.tmp-foil-audit/` (gitignored). Refresh `ory_rt_*` **single-use**.

⚠️ `POST …/collections/create` avec `{}` crée un deck vide — ne pas probe en
écriture sur un compte réel.

---

## 7. Craft / purchase catalogue (2026-08-08 — vérifié)

`POST /commerce/v1/external/catalog/purchase` — body JSON (pas FlatBuffer wire) :

```json
{
  "purchaseRequestDetails": [
    { "shopOfferingId": "bw6-5_2", "quantity": 1 }
  ],
  "idempotencyKey": "<uuid-v4>"
}
```

- `shopOfferingId` = id catalogue (= `cardId` craftable, ex. `bw6-5_2`). Prix dans
  `shop/offerings/active` → `priceData` (`TradeCurrency`).
- Le nom d’erreur serveur `shopOfferingPurchaseRequests` est un **leurre** : le
  champ client / wire utile est **`purchaseRequestDetails`**.
- Réponse succès : `{ invoiceId, status: "PAID", message: "succeeded", … }`.
- Nouvel `idempotencyKey` = **nouvel achat** (re-debit possible). Réutiliser la même clé pour un retry idempotent.
- Ne pas envoyer `gameContext` en JSON (→ `Malformed request`).

Offres actives : `POST …/shop/offerings/active` (souvent gzip) →
`shopOfferingInfos[]` avec `shopOfferingId`, `priceData`, `offeringData.items`.

Exemple live : craft `bw6-5_2` (Dratini / Tinsel, Common, 40) → wallet
1500→1460 sur le 1er hit ; probes suivants ont re-debit (−40 / clé).

---

## 8. Interception locale (état outillage)

| Élément | État |
|---|---|
| CA mitmproxy | Installé user (`/data/misc/user/0/cacerts-added/c8750f0d.0`, fingerprint = `~/.mitmproxy`) |
| Proxy | `settings http_proxy` → `10.0.2.2:8080` (quand armé) |
| mitmdump | CDN + WebView OAuth en clair ; **0** hit `api.*.studio-prod` (Unity TLS hors proxy) |
| frida-server | Présent — unpin non requis une fois les paths commerce connus |

Inutile de vider les caches app pour l’owned si on a un refresh PTCS valide :
appeler carddex/inventory directement.

---

## 9. Conséquences Placarr

1. **Catalogue / foil** — CDN + config-cache (+ getMultiple auth-driven optionnel).
2. **Owned** — sync carddex → `liveOwned.json` (plus de saisie manuelle set-par-set).
3. **Ne pas** confondre miroir catalogue, inventory GUID brut, et carddex `cardId`.
