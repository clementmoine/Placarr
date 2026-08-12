# Foil data — network vs APK (analyse ouverte)

Objectif : sync auto **sans téléphone**. Frida = QA seulement, jamais une source de dump produit.

**Règle :** toute dépendance APK restante doit rester **visible** (cette doc + gaps admin `apk-gated`), pas une dette silencieuse. OK de garder l’APK tant que c’est noté et qu’on pousse l’analyse.

## Pokémon (TCG Live)

| Artifact | Source actuelle | Sans APK ? | Analyse |
|----------|-----------------|------------|---------|
| `foil/shaders/*.frag`, shared textures, material sheets | CDN `shadersbundle` | **Oui** | — |
| `cards/{set}/{lang}/{card}/` | CDN card UnityFS | **Oui** | Stem list = Malie ou `--from-manifest` |
| `catalog.sqlite` | Malie ∪ config-cache | **Oui** (Malie) | config-cache = `data/pokemon/staging/config-cache` only (pas de fallback hors staging) |
| `foil/card-uv-rect.json` | APK Card mesh | **Non** | Pin rect connu ou hunt mesh CDN — **analyse ouverte** |
| `cards/back.webp` | APK `cardBack` | **Non** | Hunt CDN / pin one-shot — **analyse ouverte** |
| Frida / Card-Dex | Device UI | N/A | Verify only |

## Lorcana

| Artifact | Source actuelle | Sans APK ? | Analyse |
|----------|-----------------|------------|---------|
| `foil/web/*` | cards.disneylorcana.com | **Oui** | — |
| `cards/` + `catalog.sqlite` + `cards-index.json` | LorcanaJSON | **Oui** | — |
| `foil/shaders/*`, textures, `foil/manifest.json` | Unity APK | **Non** | Pas de CDN Unity public connu — **analyse ouverte** ; auto = web+cards ; WebGL = one-shot APK rare |
| `cards/back.webp` | Unity dump | **Non** | Pin / site — **analyse ouverte** |
| CSS finish/varnish coverage | Site + catalogue `foilTypes` | **Oui** | Gaps `lorcana-css-*-fallback` si nouveau type → silver/hotFoil only |

## Sync auto

- Enqueue `foilExtract` sur staleness **sans** exiger un device.
- Lorcana sans APK : phases web + cards seulement (CLI skip Unity déjà).
- Gaps admin taguent `apk-gated` quand WebGL / back / UV manquent faute d’APK.

Voir aussi : [foil_effects.md](foil_effects.md), [backlog.md](backlog.md) §Foil, `src/providers/pokemontcglive/sources.ts`.
