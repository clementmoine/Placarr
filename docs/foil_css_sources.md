# Foil CSS — Pokémon : Live leaf ↔ CSS

Contrat commun CSS+WebGL (les deux packs) : [foil_effects.md](foil_effects.md).

Dernière passe 2026-08-07 (simey **vendored** dans `third_party/`, plus de
submodules).

**Règle.** Placarr = **GPL-3.0-or-later**. Arbres simey = copies locales
(`third_party/simeydotme-pokemon-cards-{css,151}/`) pour **lire** leurs
recettes — on n’en dépend pas au runtime et on ne force pas leur stack sur
un leaf Live divergent. Assets Pokémon officiels hors arbre.

**Fidélité Pokémon.** WebGL = Live GLES3. CSS = **même intention visuelle**
que le compare Unity, avec les **plaques Live multi-locale** (FR/DE/…).
Simey / [photo-cards](https://github.com/kronenz/photo-cards) / ShaderKit =
outils d’**analyse** (quels mixes, quelles promos→`style`+`etch`) — pas la
source de vérité. Exemple : Simey `secret-rare` / SWSH145 ≈ Live **`SwSecret`**,
pas `SvUltraGoldRainbow` — coller secret-rare sur Ultra Gold a divergé.

---

## 0. Verdict (lire d’abord)

1. **Unity / Live : tous les finishes dumpés ont une recette CSS.**  
   23 `.frag` foiled + `NonFoil` = `POKEMON_FOIL_NAMES`.  
   27 feuilles matériaux = ces 24 + alias `FlatSilver_CC`, `Rainbow02`,
   `SwSecreT02`. Chaque feuille foiled a une entrée `LIVE_FINISH_CSS`.
2. **Pas de bijection Simey ↔ Unity.** Simey = rareté catalogue ; Live =
   matériau shader. Les IDs `holoShadersSimey` sont des **noms historiques**
   de looks CSS, pas un contrat « maximiser Simey ».
3. **Leafs sans analogue utile** (Sun*, Thatch, Tinsel, Squares, Stamped,
   Confetti, SolidColor) = textures extract / house.

### Schéma d’adaptation

```
┌─────────────────┐     plaques + intention frag (spectrum, shine, etch,
│  Live / Unity   │     cold-foil, wp, glitter…)  →  compare = vérité
│  dump + .frag   │ ──────────────────────────────────────────► CSS HoloShader
└────────┬────────┘
         │ besoin d’idées de stack / mix / promo mapping
         ▼
┌─────────────────┐     analyse seulement (pas de dépendance runtime)
│  Simey / forks  │     photo-cards style+etch, ShaderKit parity notes…
│  ShaderKit…     │
└────────┬────────┘
         │ trou (pas de plaque CSS-équivalent)
         ▼
┌─────────────────┐     inspiration (bandes, exclusion, scrollY, dosage)
│  WebGL / house  │     — reproduire l’intention, pas porter le frag
└─────────────────┘
```

**Priorité :** (1) Live/Unity → (2) analyse Simey/forks si utile → (3) trou
comblé à la WebGL/house. Compare playroom = Unity | CSS, **plusieurs faces**
par effet (généricité).

---

## 1. Couverture Unity → CSS

| Leaf `.frag` / sheet | CSS Placarr | Note |
|---|---|---|
| `RadiantHolo` | `radiantHolo` (+ coat / sparkle) | Live etch invert + lattice |
| `SwSecret` / `SwSecreT02` | `swSecret` (+ etch) | Spectrum + noise + etch brut |
| `Rainbow` | `rainbowFoil` | Live Spectrum_Rainbow |
| `Rainbow02` | `rainbow02` | Spectrum + Highlight_Over |
| `Cosmos` | `cosmos` | carve dots |
| `Galaxy` | `galaxy` | carve stars |
| `CrackedIce` | `crackedIce` | carve ice |
| `FlatSilver` | `flatSilver` (+ Cc / CcMb via `foil_mask`) | laminate Poké / Master Ball |
| `FlatSilver_CC` | `flatSilverCc` (+ MB override) | carve Poké Ball |
| `SvUltraGoldRainbow` | `ultraGoldRainbow` (+ coat / etch) | exclusion + dodge + etch |
| `SvUltraScodix` | `ultraScodix` (+ etch Ultra Gold) | |
| `SvUltra` | `svUltra` | |
| `SvHolo` | `svHolo` | |
| `SwHolo` | `swHolo` | |
| `AceFoil` | `aceFoil` | |
| `AngledPillars` | `angledPillars` | |
| `SunPillar` | `sunPillar` / `sunPillarCc` | CC = Northern Cross + SVHolo2 |
| `SunBeam` / `SunLava` | `sunBeam` / `sunLava` | |
| `SolidColor` / `Squares` / `Thatch` / `Tinsel` | APK ids | |
| `Stamped` / `25thConfetti` | `stamped` / `confetti25th` | |
| `NonFoil` | plain | — |
| Catalogue `holo` / `reverse` | `regularHolo` / `reverseHolo` | catalogue |
| Catalogue extras | Pokemon / catalogue ids | — |

## 2. Checklist — adapter **tous** les effets CSS

Leçons Radiant + Ultra Gold (2026-08-07), à rejouer sur chaque finish
(`/admin?tab=tcg-effects&pack=pokemon&view=compare&material=…`).

### Contrat (schéma §0)

- [ ] **Cible** = rendu Unity du leaf (playroom compare), pas un fichier Simey.
- [ ] **Plaques** = dumps Live multi-locale uniquement (pas CDN simey EN).
- [ ] Simey / forks = **lecture** (mixes, promo→style) si ça aide — jamais
      forcer une stack upstream sur un leaf dont les plates divergent.
- [ ] Trou (layer Live sans équivalent CSS) → plaque Live + adapt (invert, μ,
      split mask) ; si toujours pas → **inspiration WebGL/house**.
- [ ] WebGL reste le frag Live ; CSS ne prétend pas échantillonner un
      champ RG (`_CrossTexture`, etc.) — motifs CSS ou plaques dessinables.
- [ ] Compare **plusieurs faces** du même leaf (sets différents) — pas une
      seule seed « magique ».

### Idle ↔ hover (`pointerCss` / `HoloCardImage`)

- [ ] **Même stack** au repos et sous le pointeur (mêmes couches, mêmes
      mixes). Seule la **dose** change (glare idle ≈0.12–0.30, pointeur ≈0.66).
- [ ] Motifs + spot suivent le **lean** aussi en idle (pas de spot figé à
      50 % / glare forcé à 0 — sinon hover = autre recette).
- [ ] Ne **jamais** gater un motif `background-blend` sur `--opacity`
      (idle/spring → couche morte). Glare = `.card__glare` + `--opacity` only.

### Masques & plaques

- [ ] Mesurer polarité / μ (etch Live vs autres plates) ;
      adapter (invert, grayscale + brightness) **avant** le blend.
- [ ] Mask = **couverture** (où le foil a le droit d’exister), pas le motif.
      Si le mask Live n’a pas le pattern baké (ex. etch sans losanges), ne
      pas le mettre sur la couche qui *est* le pattern.
- [ ] **Split mask par couche** OK (Radiant: lattice nu / coat=etch ;
      Ultra Gold: shine=wp / coat=invert(cf)). Une plaque ≠ un mask unique.
- [ ] White-plate = couverture soft full-card quand Simey est soft full-card ;
      **interdit** sur un motif CSS-only (losanges Radiant).
- [ ] Plaque *dessin* (cold-foil perso blanc) = **paint** Unity (`--foil-cold`),
      pas invert-coverage — invert(cf) vidait perso + bords (Ultra Gold).
- [ ] Vernis house (`withEtch`, etc.) : couper si doublon avec une plaque
      déjà peinte (`--foil-etch`).
- [ ] `clip-borders` seulement si Simey l’a **et** que l’art Live ne porte
      pas de décor overhang (Ultra Gold : **pas** de clip).

### Ordre & dosage

- [ ] Ordre DOM simey (shine → :after → :before) n’est pas sacré : si le
      contenu des plaques diffère, tester l’ordre (coat sous/sur motif).
- [ ] **Deux curseurs** : opacity/contraste du **motif** vs du **coat**.
      Live etch + `hard-light` / `contrast(3)` raye les corps sombres —
      adoucir le coat (`soft-light`, contraste bas, op.) sans toucher au motif.
- [ ] Art Live très clair (or-sur-or) : `color-dodge` full = lavis → tester
      `exclusion` / soft-light (Unity house Ultra Gold = exclusion + bandes SV).
- [ ] Dodge pleine dose seulement si pré-assombri (`brightness` ≤ ~0.66) —
      voir `cssGuard` ceilings.
- [ ] Spectre tall (`SVHolo2` 32×256) → pan **Y** (`--background-y`), sinon
      teinte morte.
- [ ] Stops de `repeating-linear-gradient` **strictement croissants** (sinon
      le navigateur aplatit le motif).
- [ ] Dosage pan/size (FPTI, ShaderKit, …) = leviers anti-lavis, pas un port
      1:1 d’un autre repo.

### Validation

- [ ] Compare **Unity | CSS** même print + locale.
- [ ] Réf. visuelle simey (même rareté) pour la chorégraphie.
- [ ] Idle animé **et** hover : mêmes effets, pas un wash qui apparaît seulement
      au pointeur.
- [ ] Zoom zone art (perso) + zone texte : stries etch vs motif distincts.
- [ ] `cssGuard` / tests du finish verts après retouche.

### File d’attente (passer la checklist)

Mapping Live → CSS Pokemon **branché** (table §1). Reste la **vérif visuelle**
Unity | CSS (dosage = toi) :

1. `RadiantHolo` — fait (réf. §3)
2. `SvUltraGoldRainbow` / `ultraGoldRainbow` — fait (réf. §3)
3. `SvUltraScodix` / `ultraScodix` — branché (+ etch Ultra Gold)
4. `SwSecret` / `swSecret` — branché (Spectrum + noise + etch)
5. `Rainbow` / `Rainbow02` — branché
6. `Cosmos` / `Galaxy` / `CrackedIce` — branché (carve)
7. `FlatSilver` / `_CC` — branché (CC = carve Poké Ball)
8. `SvUltra` / `SvHolo` / `SwHolo` — branché
9. `AceFoil` / `AngledPillars` — branché
10. Sun* / SolidColor / Squares / Thatch / Tinsel / Stamped / 25th — branché

Cocher dans le PR / la note de finish après compare manuel.

---

## 3. Simey IDs runtime (`holoShadersSimey.ts` + Radiant)

poke-holo : regular (+ bars), reverse, rainbow (+ coat), rainbow-alt,
cosmos, amazing, secret, V / VMAX / VSTAR, shiny, trainer-gallery, radiant
(lattice / coat / sparkle — 3 passes comme upstream).

poke-151 : poke-ball, ex, illustration-rare, hyper-rare.

**Intentionnellement non mappés** (one-offs / peu de valeur Live) :
`swsh-pikachu`, `trainer-full-art`, aliases TG mineurs.

### Radiant — sources factuelles → même résultat simey

Cible visuelle = [poke-holo radiant](https://poke-holo.simey.me/#⚓-radiant).
Structure = `radiant-holo.css` (3 mixes : dodge / dodge / overlay + glare).
Applique la checklist §2 ; particularités ci-dessous.

| Rôle simey | Source simey | Source Placarr | Adaptation |
|---|---|---|---|
| `.card__shine` spot | CSS `hsl(0,0%,95%)` / `--card-glow` | idem, **toujours allumé** | ne pas gater sur `--opacity` (idle/spring → losanges morts) |
| `.card__shine` bars | CSS ±45° `--barwidth` | idem + pan FPTI ×**0.9** / size **240%** | anti-lavis ; **lattice sans mask etch** ; **peint au-dessus du coat** ; opacity ~0.48 |
| `.card__shine:after` | foil + pastel, hard-light, **color-dodge** carte | etch Live + pastel, soft-light + color-dodge, contraste **1.2** / op **0.42** | adoucir rayures perso ; lattice inchangé |
| `.card__shine` mask | scan `*_radiantholo` (lattice baké) | invert(etch) luma→alpha | **coat + sparkle only** — pas sur le lattice CSS |
| `.card__shine:before` glitter | [`glitter.png`](https://poke-holo.simey.me/img/glitter.png) EN μ≈51 | `T_Noise_Random.webp` μ≈143 | `grayscale` + `brightness(0.28)` (dosage μ) |
| `.card__glare` | `hard-light` + radial 33 % | idem si `shader.id === radiantHolo` | avant : `overlay` global → lavis blanc |
| Vernis house `etch` | n’existe pas chez simey | était branché via `withEtch` | **coupé** pour Radiant (doublon qui cramait) |

WebGL Radiant garde `_CrossTexture` `T_Holofoil_Mask_RadiantHolo_RG_X_Grad_5` +
plates Live. CSS reconstitue le look simey avec gradients + etch localisé.

### SvUltraGoldRainbow / `ultraGoldRainbow`

**Vérité =** `SvUltraGoldRainbow.frag` + plates Live. Stack CSS :

1. `ultraGoldRainbow` — SVHolo2 + bandes + gold tint → **`exclusion`**
2. `ultraGoldRainbowCoat` — glitter + glare → quiet **`color-dodge`**
3. `ultraGoldRainbowEtch` — raw `--foil-etch` × Gold_Band → **`soft-light`**

Full-card (pas de mask white-plate). Etch **non** inversé. Cold-foil =
WebGL only.

### SwSecret / `swSecret`

**Vérité =** `SwSecret.frag` + plates Live (`FX_T_Spectrum`, `T_Noise_Random`).
photo-cards SWSH145 → `{ style: SwSecret, etch: Etched }` — pas Ultra Gold.

1. `swSecret` — rainbow-alt bands + Spectrum + noise + glare → **`color-dodge`**
2. `swSecretCoat` — pastel opposite-pan (simey rainbow-holo :after)
3. `swSecretEtch` — raw `--foil-etch` × noise → **`soft-light`**

Même règles full-card / etch brut que Ultra Gold. `SwSecreT02` partage le look.

### Layers Simey intégrés (structure, pas dosage)

Choréo poke-holo / poke-151 branchée sur les ids Live (plaques restent dump) :

| Technique Simey | Live CSS ids |
|---|---|
| rainbow-alt bands + opposite-pan pastel coat | `rainbowFoil*`, `rainbow02*`, `swSecret*` |
| cosmos 3-pass staggered pans + 82° lattice | `cosmos` / `cosmosCoat` / `cosmosTop` |
| amazing dual glitter + invert radial + saturation | `galaxy` / `galaxyCoat` |
| V diagonal ribs + opposite-pan coat | `svUltra*`, `svHolo*`, `swHolo*`, `aceFoil*`, `angledPillars*` |
| reverse laminate radial + diagonal | `flatSilver` / `flatSilverCoat` |
| poke-ball grey 45° laminate base | `flatSilverCc*` |
| cracked-ice opposite-pan depth | `crackedIceCoat` |

Pas de PNGs EN simey ; pas de remap finish → rareté Simey.

---

## 4. Arbres vendored (analyse)

| Upstream | Path | Pin |
|---|---|---|
| [pokemon-cards-css](https://github.com/simeydotme/pokemon-cards-css) | `third_party/simeydotme-pokemon-cards-css/` | `UPSTREAM_COMMIT` |
| [pokemon-cards-151](https://github.com/simeydotme/pokemon-cards-151) | `third_party/simeydotme-pokemon-cards-151/` | `UPSTREAM_COMMIT` |

Pas de `git submodule`. Voir `third_party/README.md` pour un refresh manuel.
Réf. mapping promo→Live : [kronenz/photo-cards `promos.json`](https://github.com/kronenz/photo-cards/blob/000e554eef94778845cb71aacebe61ec4ec99348/src/lib/components/promos.json).

---

## 5. Autres sources (analyse)

Audit GitHub 2026-08-07 — qui a **adapté** (pas seulement forké) :

| Source | Licence | Type | Pour Placarr |
|---|---|---|---|
| [jamesrochabrun/ShaderKit](https://github.com/jamesrochabrun/ShaderKit) `docs/shadercards/css-parity.md` | MIT | Metal procédural, pas de rasters simey | idée dual-intensity ; lattice reste full une fois unmasked |
| [juhee-playground/FPTI](https://github.com/juhee-playground/FPTI) `…/ui/animation` | ? | CSS simey-like + `{id}_holo.webp` local | **branché** — pan ×0.9 / size 240% |
| [kongyo2/cards-css](https://github.com/kongyo2/cards-css) | MIT | 14 foils procéduraux (radiant ≠ bars simey) | dosage / palette (pas 1:1) — à piocher si besoin |
| [bpisano/Sticker](https://github.com/bpisano/Sticker) | MIT | Metal foil générique | réf. technique |
| [daniel-ilett/shaders-holo-card](https://github.com/daniel-ilett/shaders-holo-card) | MIT | Unity TCG Pocket | réf. WebGL |
| [ciro-unity/FoilTradingCard](https://github.com/ciro-unity/FoilTradingCard) | Apache-2.0 | Unity foil challenge | réf. |
| [akshaykg42/foil-shader](https://github.com/akshaykg42/foil-shader) | aucune | WebGL physique | **ne pas copier** |
| [BIAsia/holo-card-studio](https://github.com/BIAsia/holo-card-studio) | ? | Transplant + **assets EN poke-holo** | skip (inverse de notre contrainte) |
| [pokemon-holo-cards](https://www.npmjs.com/package/pokemon-holo-cards) | MIT | React + CDN `poke-holo.b-cdn.net` | skip (foils EN) |
| Ports Vue / forks ([Maurier](https://github.com/Maurier/vue-pokemon-cards-css), …) | GPL-3.0 | Copie framework | **aucun apport** plaques |
| [simeydotme/hover-tilt](https://github.com/simeydotme/hover-tilt) | MIT | tilt | OK maison |

**Trou ouvert.** Aucun dépôt public trouvé qui mappe dumps **TCG Live / Unity
multi-locale** (`_CardEtch`, white-plate) → chorégraphie simey. Placarr est
seul sur ce chemin (invert etch + mask alpha + noise dosé).

Canvas session : `foil-adaptation-survey`.
