# Handoff retour foil — Claude → Cursor (2026-08-07)

Suite de `docs/handoff-foil-claude.md`. Branche `feat/foundation-postgres-tests`,
working tree toujours dirty, **rien commité pendant cette passe** (conformément
au handoff entrant).

---

## 1. Verdict

Le port simey est **fidèle** — vérifié ligne à ligne contre `third_party/` — et
il n'y a **aucun gap** de mapping. Le lavis de Radiant ne venait pas d'une
mauvaise recette mais de la **découpe en passes** : trois `mix-blend-mode:
color-dodge` enchaînés contre la carte, là où l'original n'en applique qu'un
seul à une pile déjà composée. Corrigé en abaissant le blanc du spot ; Radiant,
Rainbow, Cosmos et FlatSilver_CC sont désormais proches de l'Unity.

## 2. Changements

**Un seul fichier touché : `src/core/render/holoShadersPokemon.ts`.**

### 2a. `radiantSpot()` — centre de `hsl(0,0%,95%)` → `hsl(0,0%,62%)`

La teinte périphérique (`--card-glow`) est inchangée : elle appartient à la carte.

Pourquoi : chez simey ce radial est la **couche 1 d'un seul `.card__shine`**,
fondue dans les losanges par `exclusion` *avant* l'unique `color-dodge` qui
rencontre la carte — son blanc à 95 % ne touche jamais l'illustration
directement. Sorti sur son propre élément (nécessaire pour survivre à l'idle,
cf. §6), il devient un second dodge plein contre la carte, et un dodge de
quasi-blanc est un cramage : Dracaufeu virait rose et perdait son noir. `62 %`
place le centre éclairé là où l'original composé le met.

Le commentaire de la fonction porte cette dépendance : **si une passe
`color-dodge` est ajoutée, cette valeur doit redescendre** — les dodges se
composent, ils ne moyennent pas.

### 2b′. Le spot **remis** dans la pile du lattice (correction de 2b)

La rampe doublée décrite plus bas a été **annulée**. Elle rendait les losanges
visibles, mais uniformément éclairés — et ce n'est pas ce que fait poke-holo.

Diff mesuré des deux `.card__shine`, avant correction :

| | simey | nous |
|---|---|---|
| couches | 3 — spot + 2 jeux de barres | 2 |
| paliers | 26, 51, 89, 108, **128**, … | 51, 102, 179, 217, **255**, … |
| blend | `exclusion, darken, color-dodge` | `darken, darken` |
| période / filtre | 12 % / `brightness(.5) contrast(2)` | identiques ✓ |

`exclusion` contre le radial est ce qui rend les barres **brillantes sous le
pointeur et sombres ailleurs** : les losanges sont *modelés*, pas seulement
éclaircis. Un multiplicateur uniforme ne peut pas devenir spatial — aucun
réglage de rampe ne reproduit ça.

La contrainte d'origine (idle met `--opacity` à 0, et une couche à alpha nul
dans `background-blend` effaçait les losanges) est maintenant tenue autrement :
le spot dégénère vers le **noir**, identité d'`exclusion`, donc à l'idle les
barres passent intactes. Vérifié en direct — à `--opacity: 0.659` le centre
résout à `srgb 0.626` et la périphérie à la teinte `--card-glow` ; à 0 les deux
tombent sur `#000`.

Rampe, blend, size et filtre sont désormais **identiques aux valeurs mesurées
sur le site**.

`cssGuard.test.ts` : l'ancre `not.toContain("radial-gradient")` a été remplacée
par l'invariant qui compte réellement — le spot est dans la pile *et* il fond
vers `#000`, jamais vers `transparent`. Ne jamais y remettre un fondu en alpha.

### 2b. ~~`radiantBars()` — rampe doublée~~ (annulé, voir 2b′)

**Les losanges n'étaient pas masqués : ils étaient annihilés par leur propre
filtre.** Même cause racine que 2a — l'élément a perdu une couche.

Upstream, `.card__shine` porte *trois* couches : le spot d'abord, fondu dans les
barres par `exclusion`, puis les deux jeux de barres. Ce composite culmine près
du blanc, donc `brightness(.5) contrast(2)` laisse de quoi travailler. Chez nous
le spot est sur sa propre passe (il doit l'être), donc l'élément n'est *que* les
barres, qui plafonnent à `hsl(0,0%,50%)` :

```
0.50 → brightness .5 → 0.25 → contrast 2 → (0.25 − 0.5) × 2 + 0.5 = 0
```

Toutes les barres tombent à zéro, et `color-dodge` contre du noir est un no-op.
Le lattice était dessiné, filtré à néant, puis composité comme néant — présent
dans le DOM, invisible à l'écran. Vérifié en retirant le filtre en direct : les
losanges apparaissent immédiatement.

Doubler la rampe pré-compense le halving : après `brightness(.5)` elle retombe
exactement sur les paliers nominaux d'upstream, ce que la courbe de contraste
attend. **Filtre, blend, opacité et `--barwidth` vendorés : intacts.** Seule
l'entrée est corrigée pour la couche qu'on a dû retirer.

> Deux voies ont été essayées et rejetées :
> - `brightness(1)` sur le lattice — casse le guard « dodge pleine force ⇒
>   `brightness ≤ 0.66` », qui est la règle anti-délavage. À ne pas contourner.
> - remettre le spot dans la pile via `color-mix` vers le noir (neutre
>   d'`exclusion`, donc losanges préservés à l'idle) — marche techniquement,
>   mais contredit une décision explicitement épinglée par
>   `cssGuard.test.ts:468` (`not.toContain("radial-gradient")`). Laissée au
>   choix de l'humain plutôt que forcée.

### 2c. L'etch câblé — `--foil-etch` (le vrai écart avec poke-holo)

Mesure du site live (Radiant Charizard, pointeur actif) contre le nôtre :

| | poke-holo | nous |
|---|---|---|
| `.card__shine` | 3 couches · `exclusion, darken, color-dodge` | 2 · `darken` |
| `::before` | 2 · `color-dodge, color-dodge` | idem |
| `::after` | 2 · `cover, 400% 100%` · `hard-light, hard-light` | 3 · `normal, soft-light, hard-light` |
| glare | 1 · `hard-light` | idem |
| **total** | **8** | **10** |

**Le nombre de couches n'est pas le problème.** L'écart est le contenu :
leur `::after` couche 1 est `var(--foil)` — l'image *etched* de l'impression.

La nôtre était `linear-gradient(hsl(0,0%,8%), hsl(0,0%,14%))`, et c'est pire
qu'inutile : première dans la liste, elle est la couche du **dessus**, opaque,
en `normal` — elle *remplace* les deux couches sous elle. Puis
`brightness(.6) contrast(3)` la met à noir, et `color-dodge` contre noir est un
no-op. **Le coat ne contribuait rien.**

Or l'asset existe : `swsh10-5_etch_fr_011.webp`, 732×1024, luminance moyenne
196, sans alpha — une **gravure au trait de toute la carte** (Dracaufeu en
lignes parallèles, bordures hachurées). C'est exactement leur `--foil`.
`_CardEtch` porte le rôle `varnishMask` parce que c'est le slot que Live lui
donne, mais le fichier est une image, pas un pochoir.

Câblage : `HoloCardImage` écrit `--foil-etch` depuis `varnishMaskUrl` ; le coat
lit `var(--foil-etch, <aplat sombre>)`. Aucun rôle changé, et une impression
sans etch retombe sur l'ancien comportement.

**Blend : `multiply`, pas `hard-light`.** Upstream met `hard-light`, mais ça
suppose *sa* plaque. La nôtre est un `_CardEtch` Live : gravure **sombre sur
blanc**, luminance moyenne 196. `hard-light` se décide sur la couche du dessus,
donc une plaque majoritairement blanche *screene* presque partout — essayé,
mesuré, Dracaufeu vire au rose pâle. `multiply` lit la même plaque dans le bon
sens : le blanc laisse passer les plaques du dessous, seules les lignes gravées
marquent, et la lumière court *entre* les lignes sous `color-dodge`. À revoir si
l'etch est un jour dumpé en polarité inverse.

> **Note d'architecture :** l'etch est désormais consommé deux fois — en
> *peinture* ici (upstream `var(--foil)`), et en *masque* par le look de vernis
> `etch` (`holoShadersHouse`), qui passe une brillance douce à travers. Ce n'est
> pas un doublon au sens strict (usages différents), mais c'est un point de
> conception à trancher si Radiant devient trop chargé.

### 2d. `third_party/` est à jour — vérifié, ne pas re-vendorer

Une passe précédente de ce handoff affirmait une dérive entre le vendoré et le
site live (`--space: 5%` vs `200px`, `--barwidth` absent). **C'était faux**, et
l'erreur vaut d'être notée parce qu'elle est facile à refaire.

Les propriétés étaient lues sur `.card__front`. Or `radiant-holo.css` les
déclare sur `.card__shine`, son enfant : `cards.css:8` pose `--space: 5%` à la
racine, la règle Radiant le surcharge localement. Lu sur le bon nœud, le live
donne `--space: 200px`, `--barwidth: 1.2%`, `--imgsize: cover` — **identique au
vendoré, au caractère près**.

Et les deux copies sont déjà au HEAD upstream :

```
pokemon-cards-css   acb1197633e749a1fba4412231db2f6581586d00  (2025-12-15)
pokemon-cards-151   98030f941cdc4919b648457200277e29b60d5f5a  (2026-02-16)
```

> **Piège :** une propriété custom lue sur un ancêtre renvoie la valeur héritée,
> pas la surcharge locale. Toujours lire sur l'élément qui porte la règle.

Conséquence utile : le vendoré **est** la référence fidèle, donc l'écart
restant sur Radiant est bien notre déviation à nous — le `.card__shine` à trois
couches (spot en `exclusion` + deux jeux de barres) réduit à deux. Voir §5.

## 3. Tests

```
pnpm exec vitest run src/effects/pokemon/cssGuard.test.ts \
  src/core/render/holoShadersSimey.test.ts src/effects/pokemon
  → 15 fichiers, 156 tests ✅

pnpm exec vitest run src/effects/pokemon src/core/render
  → 30 fichiers, 418 tests ✅

pnpm foil:audit-gaps
  → 0 gap sur les 6 catégories (frags, SHARED, LIVE_FINISH_CSS,
    simey unported, Lorcana FOIL_STEMS, unlisted stems)
```

Aucun guard affaibli, aucun test réécrit.

> `pnpm build` reste **rouge**, et l'était avant cette passe : le type-check
> casse sur `scripts/lorcana/cli.ts:33` (`ok` spécifié deux fois), l'une des 36
> erreurs TS préexistantes hors périmètre foil. Le bundle webpack, lui, compile.

## 4. Visuel

Mesuré dans le playroom, `view=compare`, pointeur actif.

| Finition | Avant | Après |
|---|---|---|
| **RadiantHolo** (Dracaufeu Radieux) | lavis rose, Dracaufeu délavé, losanges noyés | rouge dense, corps noir tenu, très proche Unity |
| **FlatSilver_CC** (Énergie Plante) | — | Poké Balls lisibles des deux côtés, quasi identiques |
| **Cosmos** (Raichu) | — | très proche, rien à signaler |
| **Rainbow** (Arakdo) | — | correct sous pointeur ; boîte de texte un peu plus plate que l'Unity, qui garde plus de moutonnement |

Encore faux : le moutonnement fin de Rainbow dans la boîte de texte. Non
corrigé — voir §5.

## 5. Ouvert

1. ~~**Rainbow — moutonnement boîte de texte**~~ — **fermé (Cursor, reprise)**.
   Bandes pastel simey remises en tête ; `FX_T_Highlight_Over` + `T_CloudNoise`
   en soft-light sous le Spectrum_Rainbow ; coat avec Highlight en pan opposé.
   À re-vérifier à l’œil dans le playroom (Arakdo / Rainbow).
2. **Rainbow — 2 dodges enchaînés** (coat à `opacity 0.85`). Ne crame pas
   aujourd’hui ; même levier que Radiant si un jour ça lave.
3. Le reste du parc (`Cosmos`, `Galaxy`, `CrackedIce`, `FlatSilver`,
   `SvUltraGoldRainbow`) est en **1 dodge + un blend varié** — schéma sain.

### Reprise Cursor (2026-08-07 soir)

- Lu `docs/handoff-foil-retour.md` ; suite au §5.1 Rainbow.
- Fichier touché : `src/core/render/holoShadersSimey.ts` (+ test).
- Tests : `cssGuard` + `holoShadersSimey` + `src/effects/pokemon` → 157 ✅.
- Radiant **non retouché** (Claude déjà calé : lattice+spot exclusion, etch
  invert, halo 62 %).

## 6. Pièges

- **Les dodges se composent.** Une passe supplémentaire en `color-dodge`
  multiplie les hautes lumières ; ce n'est pas une moyenne. Avant d'ajouter une
  passe, compter les dodges de la chaîne (script en §7).
- **`exclusion` n'est pas transposable d'un blend interne à un `mix-blend-mode`.**
  Essayé sur le halo pour coller à la source : la carte vire au gris et perd son
  rouge. `exclusion` contre le *lattice* (dans un même élément) ≠ `exclusion`
  contre la *carte*.
- **Ne pas remettre le spot dans le `background-blend` du lattice** — la règle du
  handoff entrant tient toujours, et pour la bonne raison : l'idle met
  `--opacity: 0` et ça tuait les losanges. Le spot doit rester sur sa passe.
- **Ne pas effacer les styles inline pour tester** (`el.style.mixBlendMode = ''`) :
  React pose ces valeurs uniquement en inline, il n'y a pas de feuille en repli,
  et tout retombe en `normal`. Recharger la page pour revenir à l'état propre.
- **Le ressort du pointeur retombe** entre deux appels d'outil : un halo lu à
  `opacity 0` n'est pas un bug, c'est l'idle. Vérifier `--opacity` avant de
  conclure.
- `FlatSilver_CC` ≠ `FlatSilver` : `foilManifestToShader` écrase l'alias sur son
  `.frag`, la clé exacte doit être interrogée en premier. Déjà en place, ne pas
  réintroduire.

## 7. Outil utile

Compter les passes et les dodges d'une chaîne, sans navigateur :

```bash
npx tsx -e "
import { holoShader } from './src/core/render/holoShaders';
import '@/effects';
import { getEffectPack } from './src/core/render/foil';
const pack = getEffectPack('pokemon')!;
for (const f of ['RadiantHolo','Rainbow','Cosmos','FlatSilver_CC']) {
  let id: any = pack.resolveCss(f, null).finishShaderId, chain: string[] = [];
  while (id && chain.length < 12) { const s: any = holoShader(id); if (!s) break;
    chain.push(s.mixBlendMode); id = s.overlay; }
  console.log(f, 'dodges=' + chain.filter(c => c === 'color-dodge').length, chain.join(' → '));
}"
```

Sortie au moment de ce handoff :

```
RadiantHolo     dodges=3  color-dodge → color-dodge → color-dodge → overlay
Rainbow         dodges=2  color-dodge → color-dodge
Cosmos          dodges=1  color-dodge → overlay
FlatSilver_CC   dodges=1  color-dodge → lighten
```
