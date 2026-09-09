# Foil CSS — Pokémon : Simey choreography × Live paint

Contrat commun CSS+WebGL : [foil_effects.md](foil_effects.md).

Dernière passe 2026-09-06 — staging simey via `syncSimeyCss.ts`.

**Règle licence.** Placarr = GPL-3.0-or-later. Arbres simey =
`data/pokemon/staging/simey/{poke-holo,poke-151}/` pour **lire** recettes —
pas de dépendance runtime, pas de rasters EN upstream.

---

## 0. Contrat (lire d’abord)

Comme **Lorcana Web CSS** : on porte une adaptation CSS amont, on ne
réinvente pas. Différence critique — **Simey est EN** ; Placarr est
**multilingue**.

| Couche | Source | Interdit |
| ------ | ------ | -------- |
| **Compositing** (ordre shine / `:after` / `:before`, mixes, glare, pointer `adjust`) | Simey poke-holo / poke-151 (staging) | Inventer un leaf sans amont Simey |
| **Face** carte | Dump Live locale du print (FR/DE/…) | CDN `poke-holo.simey.me` / foils EN |
| **Masks / etch** (`--foil-etch`, white-plate) | Live `_CardEtch`, `_CardWhitePlateMask`, … **même locale** | Scans foil EN Simey en runtime |
| **FX partagés** (spectrum, noise) | `data/pokemon/foil/textures` (extract Live) | CDN Simey pour art locale |
| **Glitter / grain partagés** | vendored `simey_glitter`, `simey_grain` | inventer / dimmer Live noise |
| **Cosmos stack** | vendored `simey_cosmos-{bottom,middle-trans,top-trans}` | scans foil EN par carte |
| **Motifs finish** (illusion, pokeball, iri, …) | vendored `simey_*` (syncSimeyCss) | CDN Simey en runtime |
| **Pas d’amont Simey** | house **`flare`** | « CSS Live-fidèle » inventé |

**Intégration = matériaux d’abord.** Les recettes staging restent la cible.
On ne fork pas les blends pour « corriger » un paint Live brut — on
**projette** Live/Malie vers l’espace d’entrée Simey (`--foil` clair/noir,
mask alpha). Glitter / grain / cosmos stack = textures Simey vendored
(`simey_*`). Motifs finish 151/holo aussi sur disque. Checklist code :
`simeyPaintContract.ts`.

**Polarité etch.** Live `_CardEtch` ≈ traits sombres sur clair ; Simey
`--foil` ≈ clair sur noir. `useInvertedPaintBlob` = premier adaptateur ;
généraliser (contraste foil) avant de retirer les forks CSS.

```
┌──────────────────────┐
│ Simey staging CSS    │  compositing only (mixes, layers, pointer ranges)
└──────────┬───────────┘
           │ adapt → HoloShader + HoloCardImage
           ▼
┌──────────────────────┐
│ Live dump multi-loc  │  face + etch + wp + shared FX (/assets/pokemon/…)
└──────────────────────┘
           │
           ▼
     CSS produit (ou flare si pas d’amont Simey)

WebGL = chemin séparé (frags Live) — pas cette doc.
```

---

## 0b. Compositing Simey → Placarr

Simey (DOM) :

```
.card
  art
  .card__shine          ← motif / foil paint   (→ HoloShader finish)
    :after              ← coat / 2e pass       (→ overlay)
    :before             ← glitter / 3e         (→ overlay.overlay)
  .card__glare          ← spot pointeur        (→ glare layer)
  .card__glare2         ← wash foil (option)   (→ glare2)
```

Placarr (`HoloCardImage`) :

1. Art = face Live (ou seed playroom), locale du bundle.
2. Chaîne `shader.overlay` (max 4) = shine → :after → :before.
3. `--foil-etch` = etch Live (évent. inverted) — rôle de Simey `var(--foil)`.
4. Mask shine = white-plate Live, ou etch invert (Radiant), ou full-card.
5. `pointerCss` = mêmes compressions motif que poke-151 (`37–63` / `33–67`).

**Checklist par look Simey porté :**

- [ ] Recette lue dans staging (pas inventée).
- [ ] Aucune URL `simey.me` / foil EN dans le `HoloShader`.
- [ ] Face + etch + wp = dump locale (playroom : plusieurs faces / leaf).
- [ ] FX = `/assets/pokemon/textures/…` (Live) + `simey_{glitter,grain,cosmos-*}` partagés.
- [ ] Ordre / blends = Simey sauf contrainte plaque Live (doc Radiant / Ultra…).
- [ ] Idle + hover = même stack, dose glare seule change.

---

## 1. Couverture Live leaf → CSS (inventaire Simey)

Tout leaf foiled Live a une entrée dans `LIVE_FINISH_CSS`. On branche la
recette Simey la plus proche (tels quels quand l’id staging existe).

| Leaf Live | CSS Placarr | Amont Simey |
| --------- | ----------- | ----------- |
| `RadiantHolo` | `radiantHolo` | `radiant-holo` |
| `Rainbow` / `Rainbow02` | `rainbowHolo` / `rainbowAlt` | `rainbow-holo` / `rainbow-alt` |
| `SwSecret` / `SwSecreT02` | `secretRare` | `secret-rare` |
| `Cosmos` | `cosmosHolo` | `cosmos-holo` |
| `Galaxy` | `amazingRare` | `amazing-rare` |
| `FlatSilver` (+ masks) | `flatSilver` (+ Cc / Mb) | `reverse-holo` |
| `FlatSilver_CC` | `pokeBallHolo` | `poke-ball-holo` |
| `SvUltra` / `SvHolo` / `SwHolo` | `vFullArt` / `vStar` / `vRegular` | V-family |
| `AceFoil` | `vMax` | `v-max` |
| `AngledPillars` | `exFullArt` (stack `ex-full-art.css` : mask/foil/sunpillar/ribs) | `ex-full-art` |
| `SunPillar` (+ CastAndCure) | `sunPillar` (+ Cc) | `ex-regular` |
| `CrackedIce` | `illustrationRare` | `illustration-rare` |
| `SvUltraScodix` / `SvUltraGoldRainbow` | `hyperRare` | `hyper-rare` |
| `SunBeam` | `regularHolo` | `regular-holo` |
| `SunLava` / `Squares` | `shinyV` | `shiny-v` |
| `Tinsel` / `Stamped` | `shinyRare` | `shiny-rare` |
| `Thatch` / `25thConfetti` | `trainerGalleryHolo` | `trainer-gallery-holo` |
| `SolidColor` | `reverseHolo` | `reverse-holo` |
| Catalogue `holo` | `regularHolo` | `regular-holo` |
| Catalogue `reverse` | `reverseHolo` | `reverse-holo` |

### ISO compare (playroom)

Comparer → **CSS | Simey** (`?pair=simey`). Map leaf → demo :
`src/effects/pokemon/simeyIsoCompare.ts` (stem, carte démo, checklist).
Gauche = Placarr CSS ; droite = iframe poke-holo / poke-151. Agrandis **la
bonne rareté** (ex. AngledPillars = Kangaskhan **#190 Ultra Rare**, pas #115).

Simey one-offs encore skippés (pas de leaf Live) : `SIMEY_CSS_SKIP_STEMS`
(`swsh-pikachu`, TG aliases, `ex-special-illustration-rare`, …).

---

## 2. Checklist adaptation (par look Simey)

Rejouer `/admin?tab=catalogue&pack=pokemon&view=compare` — **plusieurs
faces locales** du même leaf.

### Contrat

- [ ] Cible visuelle = **Simey** (même rareté / fichier CSS), paint = **Live**.
- [ ] Compare secondaire Unity | CSS = QA WebGL, pas la vérité CSS.
- [ ] Pas de raster EN Simey / Malie foil CDN en runtime.

### Idle ↔ hover

- [ ] Même stack ; glare dose only (`pointerCss`).
- [ ] Ne jamais gater un motif `background-blend` sur `--opacity`.

### Masks & plaques

- [ ] Polarité etch mesurée ; invert si besoin **avant** le blend Simey.
- [ ] Mask = couverture (où le foil a le droit) ; motif = autre couche.
- [ ] Split mask OK (Radiant: lattice / coat=etch).

### Validation

- [ ] Face FR **et** autre locale si dump existe.
- [ ] `cssGuard` vert.
- [ ] Staging simey à HEAD (`syncSimeyCss --check`).

---

## 3. Simey IDs runtime

Voir `LIVE_FINISH_CSS` + `holoShadersSimey.ts` / ports Radiant & co dans
`holoShadersPokemon.ts` (structure Simey, paint Live).

**Intentionnellement non mappés** (one-offs Simey) : `SIMEY_CSS_SKIP_STEMS`
(`swsh-pikachu`, TG aliases, `ex-special-illustration-rare`, …).

### Radiant — exemple (Simey stack × Live paint)

| Rôle Simey | Simey | Placarr |
| ---------- | ----- | ------- |
| shine spot / bars | CSS | idem + pan FPTI ; lattice sans mask etch |
| `:after` foil | scan EN `--foil` | Live `_CardEtch` invert → `--foil-etch` |
| `:before` glitter | `glitter.png` μ≈51 | vendored `simey_glitter` (+ filter poke-holo) |

---

## 4. Staging

| Upstream | Path | Pin |
| -------- | ---- | --- |
| [pokemon-cards-css](https://github.com/simeydotme/pokemon-cards-css) | `…/simey/poke-holo/` | `UPSTREAM_COMMIT` |
| [pokemon-cards-151](https://github.com/simeydotme/pokemon-cards-151) | `…/simey/poke-151/` | `UPSTREAM_COMMIT` |

Refresh : `tsx src/providers/pokemontcglive/syncSimeyCss.ts`.

---

## 5. Autres sources

Inchangé — analyse only (ShaderKit, FPTI dosage, kongyo2, hover-tilt maison).
**Aucun** dépôt public ne mappe dumps Live multi-locale → choréo Simey sauf
Placarr (`useInvertedPaintBlob` + `--foil-etch`).
