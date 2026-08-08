# Handoff — navigateur Live carte (Frida / uGUI) (2026-08-08)

Reconstitué côté Cursor : Claude n’a **pas** écrit de handoff de retour.
Source = collages chat Claude + commits locaux + `scripts/pokemon/liveCard.ts`.

Branche `feat/foundation-postgres-tests` (HEAD local **8 commits** devant origin,
working tree clean au moment de ce doc). Ne pas committer secrets / tokens.

**Où Claude s’est arrêté :** chaîne Frida/il2cpp validée ; navigateur pas encore
écrit. Demande user : « le plus logique / efficace pour **toujours** trouver la
carte ».

---

## 1. Verdict — surfaces externes (clos, exhaustif)

Les trois voies Android pour adresser l’app depuis l’extérieur sont **mortes** :

| Voie | Verdict |
|---|---|
| URI / deep link `tpcitcgapp://` | Seulement `callback` + `event.googleplay` ; routage dans `LoginWebFlow` |
| Activité tierce | **1** activité exportée : `.UnityPlayerActivity` (MAIN/LAUNCHER + VIEW OAuth) |
| Service / broadcast | Aucun exporté ; receiver protégé `DYNAMIC_RECEIVER_NOT_EXPORTED` (signature) |
| Provider | `FirebaseInitProvider` interne seulement |

Même si Unity lisait des extras d’intent, **aucun handler** ne route hors login.
L’app n’est pilotable que par son UI — décision éditeur, pas lacune d’outil.

**Ne pas** relancer l’enquête deep link / intent / activité.

---

## 2. UI Card-Dex (reconnu avant Frida)

| Observation | Implication |
|---|---|
| uiautomator = surface vide | Pas d’a11y Android utile |
| Pas de recherche Card-Dex (`ui_filters_*` ≠ champ nom) | Pas de « tape le nom → go » |
| Bandeau « MÉGA-ÉVOLUTION ▲ » = **sélecteur de série** | UI **à 2 niveaux**, pas carrousel plat de 100 sets |
| Listes séries stables (ME, SV, SWSH, SM, XY, …) | Peu d’entrées, peu de churn |

Préfixes set → série (dérivable, ~6 lignes, stable) :

| Préfixe stem | Série UI (FR observée) |
|---|---|
| `me*` | Méga-Évolution |
| `sv*` | Écarlate et Violet |
| `swsh*` | Épée et Bouclier |
| `sm*` | Soleil et Lune |
| `xy*` | XY |
| `bw*` | Noir & Blanc |

Sets hors préfixe (à nommer explicitement) : `gum`, `rsv10-5`, `zsv10-5`.

---

## 3. Designs envisagés (ordre chronologique)

### A. Table set → index carrousel (proposé puis dépassé)

Générer une fois l’ordre d’affichage Live par série, figer, rafraîchir à chaque
nouveau set. Sans OCR / sans dep. **Fragile** si Live réordonne ; maintenance.

### B. Série (préfixe) + table set-dans-série + **vérif image** (design Claude « logique »)

1. **Niveau 1 série** — gratuit via préfixe stem.
2. **Niveau 2 set** — table générée (ordre Live capturé), pas manuscrite.
3. **Niveau 3 garantie** — après ouverture, comparer le screenshot à la
   `cardTex` dumpée du bundle (~41k textures locales). Mismatch → échec explicite
   (« on sait quand ça n’a pas marché »), pas une fausse capture.

C’est le critère user « toujours trouver la carte » : navigation + **preuve**.

### C. Frida uGUI (dernier état — à poursuivre)

Découverte après B : graphe uGUI inspectable (pas UI Toolkit — 0 `UIDocument`).

| Classe | ~instances |
|---|---|
| `UnityEngine.Canvas` | 219 |
| `UnityEngine.UI.Button` | 1 890 |
| `TMPro.TextMeshProUGUI` | 4 857 |
| `UnityEngine.GameObject` | 69 142 |

Frida + `frida-il2cpp-bridge` (scratch **hors repo**) : lire libellés TMP, tap via
`RectTransform`, éventuellement `onClick`.

**Recommandation reprise :** **C pour naviguer** (plus de table d’index à
maintenir) + **garder B.3 vérif `cardTex`** (la garantie). Préfixe série (B.1)
reste utile comme hint / filtre même avec Frida. Table set (B.2) = repli si
Frida casse, pas le chemin principal.

---

## 4. Baseline repo aujourd’hui

`pnpm foil:pokemon:live-card "<nom>" [--set-steps N] [--tilt]`
→ `scripts/pokemon/liveCard.ts`

- Résolution nom → stem : SQLite (`name_*` puis normalize locale).
- Navigation : **coordonnées** (Card-Dex, carousel, grille 3 col).
- Tilt : `motionevent` DOWN/MOVE/capture/UP (`input swipe` relâche → foil plat).
- Deep link clos documenté en tête du fichier.

À remplacer : navigation coordonnées / `--set-steps`. À garder : SQLite + tilt +
(à ajouter) vérif image vs dump.

---

## 5. État outillage (fin passe Claude)

| Élément | État |
|---|---|
| Emulator | MuMu `emulator-5554`, `com.pokemon.pokemontcgl` |
| `frida-server` | Sur device, attach OK (`frida-ps -U`) |
| `adb` root | OK |
| `frida-il2cpp-bridge` | Scratch **hors** dépôt — deps Placarr intactes |
| Probe | `dumpui.ts` scratch : UIDocument=0 → pivot uGUI |
| Frida **dans** repo | Scanner mémoire court — pas d’il2cpp |
| Proxy mitm | Remis `10.0.2.2:8080` — **app offline si mitm n’écoute pas** |

Retrouver / recréer le scratch si perdu. Mitm **dégagé** pendant nav UI/Frida.

---

## 6. Commits Claude (HEAD local, non poussés au moment du doc)

1. `428b6f6` pack Pokémon + `untrackedSourceGuard`
2. `a161486` `card_foil` SQLite
3. `3bb0d0d` drop `unityFoil`
4. `4c601d9` lookups SQLite audits/serveur
5. `d2f942c` CDN GameSettings
6. `bb11511` playroom faces Live serveur
7. `90502a8` FlatSilver 2ᵉ spectre + `foil:audit-live-css`
8. `d19df6c` **`live-card`** (baseline)

Owned/craft : `docs/handoff-live-owned-craft.md`, `docs/pokemon_live_rainier.md`.

---

## 7. Prochaine étape

1. Scratch : enum TMP/Button actifs → `findLabel` → tap / onClick.
2. Brancher dans `liveCard.ts` : série (préfixe ou label) → set (label) → carte
   (nom) ; drop `--set-steps` quand Frida OK.
3. **Vérif** screenshot ↔ `cardTex` du bundle (échec bruyant si mismatch).
4. Cas `gum` / `rsv10-5` / `zsv10-5` : mapping explicite série.
5. Ne pas vendor il2cpp-bridge tant que ce n’est pas outil first-class.
6. Doc rainier § UI ou garder ce handoff.

Hors scope : craft batch, re-sniff tokens.

---

## 8. Pièges

- uiautomator vide ≠ pas de DOM Unity.
- Symboles UIElements ≠ usage (0 UIDocument).
- Proxy sans listener → offline.
- Ne pas committer `.tmp-foil-audit/` / scratch avec tokens.
- `motionevent` pour tilt, pas `swipe`.
- OCR = mauvaise piste (Frida lit les labels ; table seule = maintenance).

---

## 9. Prompt de reprise

> Lis `docs/handoff-live-frida-nav.md`. Objectif : **toujours** ouvrir la bonne
> carte Live. Naviguer via **Frida uGUI** (pas table carrousel, pas OCR) ;
> **vérifier** contre `cardTex` dumpée. Outillage il2cpp-bridge hors repo. Mitm
> dégagé sauf OAuth. À la fin : handoff de retour (verdict, chemins scratch,
> diffs `liveCard.ts`, pièges).
