# Foil data — network vs APK (analyse ouverte)

Objectif : sync auto **sans téléphone**. Frida = QA seulement, jamais une source de dump produit.

**Règle :** toute dépendance APK restante doit rester **visible** (cette doc + gaps admin `apk-gated`), pas une dette silencieuse. OK de garder l’APK tant que c’est noté et qu’on pousse l’analyse.

## Pokémon (TCG Live)

| Artifact                                                | Source actuelle      | Sans APK ?      | Analyse                                                                                |
| ------------------------------------------------------- | -------------------- | --------------- | -------------------------------------------------------------------------------------- |
| `foil/shaders/*.frag`, shared textures, material sheets | CDN `shadersbundle`  | **Oui**         | —                                                                                      |
| `cards/{set}/{lang}/{card}/`                            | CDN card UnityFS     | **Oui**         | Stem list = Malie ou `--from-manifest`                                                 |
| `catalog.sqlite`                                        | Malie ∪ config-cache | **Oui** (Malie) | config-cache = `data/pokemon/staging/config-cache` only (pas de fallback hors staging) |
| `foil/card-uv-rect.json`                                | APK Card mesh        | **Non**         | Pin rect connu ou hunt mesh CDN — **analyse ouverte**                                  |
| `cards/back.webp`                                       | APK `cardBack`       | **Non**         | Hunt CDN / pin one-shot — **analyse ouverte**                                          |
| Frida / Card-Dex                                        | Device UI            | N/A             | Verify only                                                                            |

## Lorcana

| Artifact                                         | Source actuelle              | Sans APK ? | Analyse                                                                                            |
| ------------------------------------------------ | ---------------------------- | ---------- | -------------------------------------------------------------------------------------------------- |
| `foil/web/*`                                     | cards.disneylorcana.com      | **Oui**    | —                                                                                                  |
| `cards/` + `catalog.sqlite` + `cards-index.json` | LorcanaJSON                  | **Oui**    | —                                                                                                  |
| `foil/shaders/*`, textures, `foil/manifest.json` | Unity APK                    | **Non**    | Pas de CDN Unity public connu — **analyse ouverte** ; auto = web+cards ; WebGL = one-shot APK rare |
| `cards/back.webp`                                | Unity dump                   | **Non**    | Pin / site — **analyse ouverte**                                                                   |
| CSS finish/varnish coverage                      | Site + catalogue `foilTypes` | **Oui**    | Gaps `lorcana-css-*-fallback` si nouveau type → silver/hotFoil only                                |

## Sync auto

- **Store fetch sans téléphone** : première étape du job `foilExtract` (bouton Sync + auto-sync worker). Probe `versionCode`, télécharge le XAPK seulement s’il est plus récent que `apk-store-meta.json`, dépose base + splits (noms normalisés `base.apk` / `split_*.apk`) dans `data/<pack>/staging/apks/`, puis enchaîne l’extract. Auto-sync 1×/jour (`PLACARR_APK_STORE_CHECK_MS`, off via `PLACARR_APK_STORE_AUTO=0`) : nouvel APK → extract complet ; sinon → catalogue réseau (Malie / CDN / LorcanaJSON / web) **sans** Unity, graphe produits, faces papier ni audits. Un Sync manuel reste complet. Source de vérité package : `androidPackageId` (`cataloguePacks`). Pas d’ADB, pas d’upload manuel.
- **Dumps Unity sautés** quand les artifacts disque (UV + dos Pokémon ; shaders / textures / manifest / dos Lorcana) sont déjà plus récents que les APKs — un re-run ne rescane pas l’APK pour rien.
- **Pokémon CDN** : AssetManifests re-téléchargés seulement si `version` / `content_dir` / `content_base` / langs ont bougé (meta `.cdn-target.json`). Dump interrompu → reprise `skipExisting` des `manifest_*.json` déjà là. JSON compact + yield entre manifests (heartbeat). `shadersbundle` → frags / textures / material sheets skippés si déjà plus récents que le bundle.
- **Malie** : cache `malie-identities.json.gz` + fingerprint des revisions — si rien n’a bougé, pas de reparse des ~1.4k DB. Progress via `console.log` (tee admin + heartbeat). Yield pendant un reparse forcé.
- Miroirs (couverture vérifiée) : **APKPure** (Lorcana ; probe via FlareSolverr, binaire via `d.cdnpure.com` — `d.apkpure.com` 403 le TLS Node même avec cookies Flare) puis **APKCombo** (TCG Live absent d’APKPure ; URL R2 présignée sans bot wall). Uptodown écarté : token Cloudflare Turnstile requis au download.
- Garde-fous : versionCode introuvable = `unavailable` (jamais de download deviné) ; le `manifest.json` du XAPK doit nommer le bon package ; réponse non-ZIP (challenge Cloudflare) rejetée. **Analyse ouverte** : pin de la signature éditeur (apksigner) avant extract — le miroir reste un tiers.
- Provenance inconnue (pas de `versionCode` dans le meta) → le prochain passage store établit la baseline.
- Lorcana sans APK : phases web + cards seulement (CLI skip Unity déjà).
- Gaps admin taguent `apk-gated` quand WebGL / back / UV manquent faute d’APK.

Voir aussi : [foil_effects.md](foil_effects.md), [backlog.md](backlog.md) §Foil, `src/providers/pokemontcglive/sources.ts`.

**One Piece** : pas de client / APK foil connu — voir [one_piece_tcg.md](one_piece_tcg.md).

**Naruto** (pack ombrelle, CACG FR d’abord) : idem (pas de client foil) — voir [naruto_carddass_tcg.md](naruto_carddass_tcg.md).
