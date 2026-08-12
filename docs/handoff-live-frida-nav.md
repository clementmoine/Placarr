# Handoff — navigateur Live carte (Frida / uGUI) (2026-08-08)

Mis à jour Cursor — API-first (pas de taps pixels sauf ultime secours).

Branche `feat/foundation-postgres-tests`. Scratch : `~/.cache/placarr-frida-ugui/`.

---

## 1. Verdict

| Question | Réponse |
|---|---|
| Deep link / intent carte ? | **Non** |
| DOM | **uGUI** + `frida-il2cpp-bridge` |
| Entrée Card-Dex | `MainMenuNavigation_P.GoToHomeScreen` + `MainMenuController.OpenScreen(HUBCardDex)` / `ChangeToCardCollection` (parfois AV mais UI OK) |
| Fermer overlays (carte / tri) | **`OverlayManager.CloseAllOverlays()`** — **jamais** tap y≈0.91 (ouvre « Trier par ») |
| Série | `CardDexSeriesDropdownItem.OnClickSeries` / `CardDexSeriesSelector.SelectSeries` |
| **Set (y compris hors pool recyclé)** | **`CollectionSetCarousel.ShiftCarouselToTargetSet(id)` + `OnClickExpansion(id, bool, bool)`** |
| Set (fallback cellule GC) | `CollectionCarouselObjects.SelectExpansion()` |
| Carte | `CardDexStackParts.InvokeClickDelegateWithBoundArchetypeStack` via `_assetBundleToUse` |
| Catalogue sets | `HUBCardDexScreenController.get_AllCachedExpansionDetails()` |
| Thread | Unity main (`Il2Cpp.mainThread.schedule` quand dispo) |

Identité foil admin → Live : `printKey` → `paperBundleId` → `{liveSet}_{lang}_{num}` ex. `me5_fr_001`. Playroom : `bundleId` déjà sur `packArts`.

---

## 2. Scratch CLI

```bash
python3 ~/.cache/placarr-frida-ugui/nav.py close-overlays
python3 ~/.cache/placarr-frida-ugui/nav.py home
python3 ~/.cache/placarr-frida-ugui/nav.py card-dex      # OpenScreen API
python3 ~/.cache/placarr-frida-ugui/nav.py series XY
python3 ~/.cache/placarr-frida-ugui/nav.py select XY1   # Shift+OnClickExpansion
python3 ~/.cache/placarr-frida-ugui/nav.py open xy1_fr_001 --prefer ph
python3 ~/.cache/placarr-frida-ugui/nav.py goto me5_fr_001 --prefer ph
python3 ~/.cache/placarr-frida-ugui/nav.py expansions   # catalogue complet
python3 ~/.cache/placarr-frida-ugui/nav.py tour          # série→sets pool→open (API)
```

Ne pas ajouter `frida-il2cpp-bridge` aux deps Placarr. Proxy mitm off pendant la nav.

---

## 3. Placarr

| Fichier | Rôle |
|---|---|
| `scripts/pokemon/liveCard.ts` | Nom → sqlite → `fridaGotoCard` → tilt → vérif |
| `src/lib/admin/liveNavFrida.ts` | Shell `nav.py` (`goto` / `select` / `open`) |
| `src/app/api/admin/live-open` | Admin bouton playroom → `openCardInLive` |
| `scripts/pokemon/liveCardVerify.ts` | Screenshot ↔ `cardTex` (complément) |
| `src/effects/pokemon/resolveEffect.ts` | `printKey` → bundle |
| Admin | `/admin?tab=tcg-effects` (`FoilPlayroom` / `packArts.bundleId`) |

```bash
pnpm foil:pokemon:live-card "Tropius" --set me5 --tilt
```

---

## 4. Validé live (API)

| Étape | Résultat |
|---|---|
| CloseAllOverlays / GoToHome | OK |
| Card-Dex (OpenScreen) | AV possible ; `inCardDex` / titre Collection = source de vérité (pas GC carousel stale) |
| `listExpansions` | Catalogue complet (bw/xy/sv/…) |
| `selectSeries("XY")` dropdown | OK |
| `Shift+OnClickExpansion("XY1")` | OK — pool passe à XY0/1/2, `loaded=XY1` |
| `open XY12_fr_005` | OK — Aspicot Évolutions |
| `open me5_fr_001 --prefer ph` | OK — Tropius owned 4 |

---

## 4. Ouvert (pour tests foil carte-par-carte)

1. ~~OpenScreen AV~~ / ~~set hors pool~~ / ~~close overlays~~
2. **Tour exhaustif** optionnel — moins critique grâce à `openFast`
3. **JumpToDataIndex** grille — fallback seulement
4. **Vérif cardTex** — seuil/crop
5. ~~**Bouton admin** « Live »~~ → `POST /api/admin/live-open` + `OpenInLiveButton` (playroom owned faces)

### Instant open (2026-08-08 soir)

```
bundle …
  → ensure Card-Dex (soft OpenScreen ; skip CloseAllOverlays / GoToHome — hang Frida)
  → openFast: SetupLargeCard + OpenOverlay
  → hide purchaseUI + BackgroundInputBlocker
  → settle ~2s: DragRotator ready + PhysicsRaycaster
```

**Pourquoi Dex d’abord** : `openFast` depuis home (ou overlay déjà ouvert hors Dex) laisse PurchaseUI / chrome incomplet → pas de X close ni tilt doigt. Toujours `OpenScreen(CardDex)` avant `openFast` (même si le détecteur croit déjà être en Dex).

`inCardDex` : `CardDexSeriesSelector` / écran dex / titre Collection — **pas** `CollectionCarouselObjects` (faux positif hors dex).

Warm daemon `navd.py` (~0.5–1 s/open). Sans daemon, chaque clic ~2.5–3.5 s (re-attach Frida).
Le bouton admin tente de démarrer `navd` en arrière-plan (sans bloquer le 1er clic).

```bash
python3 ~/.cache/placarr-frida-ugui/navd.py &   # une fois
python3 ~/.cache/placarr-frida-ugui/nav.py goto smalt_fr_001
pnpm foil:pokemon:live-card --bundle smalt_fr_001 --tilt
```

- GC `CollectionCarouselObjects` **stale hors Card-Dex** → ne pas croire `current_set` / `inCardDex` seul.
- Tap bas d’écran = barre **Trier par** / decks — préférer `CloseAllOverlays` hors hot path.
- Package Live = `com.pokemon.pokemontcgl` only (jamais Pocket).
- Pas de KEYCODE_BACK (boot/loading).
- **Erreur chargement (ERREUR 10099 + Réessayer)** : `wait_app_ready` / `attach` tapent le bouton in-app (cooldown ~8s), **pas** de force-stop pour ça.
- Tap Card-Dex hub : label y−40 (le texte est sous l’hex).
- `SelectSeries` / certains invokes AV **après** succès — re-vérifier pool / `loadedSetId`.

---

## 7. Prompt de reprise

> Lis ce handoff. Priorité : (1) `tour` exhaustif via `ShiftCarouselToTargetSet`
> + catalogue `listExpansions` ; (2) stabiliser `openCardDex` ; (3) bouton admin
> foil → `goto` bundle. API-first, pas de taps. Scratch hors repo.
