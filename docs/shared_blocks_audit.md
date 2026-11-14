# Shared blocks audit — covers, foils, digs

> **2026-11-08** — Phase 0 du plan d’harmonisation (adapters + blocs
> core/shared). Suite produit : Affiche auto/pin, métadonnées face, moteur foil
> commun — voir [backlog.md](backlog.md).

## Boussole

| Couche | Rôle |
| ------ | ---- |
| `core/` | Moteurs (rank Affiche, foil WebGL/CSS, identify, enrich…) |
| `providers/shared/` | Digs & coques catalogue réutilisables (Wayback, Coleka, tcgcards, sealed, cardCatalogue…) |
| `providers/<pack>/` | **Adapter** : capacités / sources / parsers uniques |
| `effects/<pack>/` | Materials / recipes foil — le runtime reste dans `core/render/foil` |

Règle : **amélioration une fois → toute l’app**. Pack = traits + observations, pas de second moteur.

---

## 1. Covers / faces

### Blocs cibles (garder)

| Brick | Path | Scope |
| ----- | ---- | ----- |
| Affiche / shelf rank | `core/enrich/media/coverDisplayRank.ts` + `collect/media.ts` (`getCoverImage`) | Galerie stamped + pin utilisateur |
| Catalogue disk score | `core/enrich/media/catalogueFaceRank.ts` | Façade TCG sur observations Affiche (`observeCatalogueFace`) + adaptateur area/stub |
| `face.json` factory | `providers/shared/cardFaces.ts` (`mergeWriteFaceDecision`) | Dig audit **opt-in** (`PLACARR_WRITE_FACE_JSON=1`) ; plus SSOT display |
| URL mint | `lib/packAssetUrls.ts` | prints / cards / products |
| HTTP print role | `lib/media/resolvePrintFace.ts` (+ hook pack) | Foil/HTTP ; pas display SSOT Affiche |

### Merge / delete

| Fork | Statut | Notes |
| ---- | ------ | ----- |
| `faceArtRank` / Carddass ladder | **Merged** | → `catalogueFaceRankScore` + dump order |
| Resolve sans `face.json` SSOT (Naruto / PK / DBS CG / FW) | **Fait** | Re-rank sync / async |
| Admin `/prints` vs `/cards/art.*` | **Fait** | Soft-fill + Carddass exclusive ; shelf garde `/prints` |
| `SPECIAL_ART` tripliqué | **Fait** | `NARUTO_SPECIAL_ART_RE` unique |
| `writeSealedProductFaceDecision` / ranks writer | **Fait** | Appels → `mergeWriteFaceDecision` direct |
| Basename markers → `artKind` / `watermarked` | **Fait** | Emitters / resolve → `resolveFaceArtMetaForDig` (basename gap-fill only) |
| Promote Naruto / Pokémon / DBS CG / FW | **Fait** | `promoteResolvedFace` (écrit `face.json` opt-in) |
| Ninja Ranks `preferredNinjaRanksDisplayArt` | **Fait** | `createCardFaceChoice` + `artKind` (hors Coleka) |
| `catalogueFaceRank` → Affiche observations | **Fait** | `observeCatalogueFace` + stamps ; area/stub = adaptateur TCG |

### Produit (après merges)

- Affiche = tuile **auto** + pin ; `coverMode` auto\|pinned.
- Sync catalogue **re-rank overwrite** ; pin étagère inchangé.
- `collapsePrintRoleTwinWithDiskArt` quand dumps `art.*` présents.

---

## 2. Foils

### Keep

| Brick | Notes |
| ----- | ----- |
| `core/render/foil/*` + `FoilCardImage` / `HoloCardImage` | Moteur commun |
| `lib/unity/*` | Extract Unity → WebGL |
| `effects/pokemon`, `effects/lorcana`, `effects/narutokayou` | Materials / recipes / lenticular |
| `defineCatalogueOnlyPack` | Packs sans dump Unity |

### Statut

| Item | Statut |
| ---- | ------ |
| `leanPolicy` / finishMatrix / ASTC / Linear-sRGB / second varnish / hydrate / Kayou e2e | **Fait** |
| Dual CSS PK (Simey+Live) vs Lor (`recipes.json`) | **Keep** ingestions distinctes |
| Playroom-gated leaf Comparer (Pokémon) | **Reste** produit (hors architecture) |

---

## 3. Digs / réseaux

### Keep

| Brick | Path |
| ----- | ---- |
| tcgcards / Coleka / sealed / cardCatalogue pipeline | `providers/shared/*` |
| Wayback | `providers/shared/wayback/{waybackRawUrl,cdx}` |
| Curated documents | `loadCuratedDocumentsJson` |

### Dette restante

| Dette | Action | Priorité |
| ----- | ------ | -------- |
| Bleach vs DBS scout carddass.fr parsers | Pattern only — path/PK dialects différents ; garder séparés | P3 (defer) |
| ~~Fullset Pokémon vs `shared/fullset`~~ | **Fait** — `harvestFullsetSets` ; apply PK reste adapter | — |
| ~~Coleka Carddass `fetchColekaListingHtml` re-export~~ | **Fait** — imports → `shared/coleka/listingFetch` | — |
| ~~Carddass `parse/bandai` re-export `waybackRawUrl`~~ | **Fait** — imports → `shared/wayback/*` | — |

---

## 4. Ordre d’exécution (état)

1. ~~Shared Wayback~~ **Fait**
2. ~~face.json unifié (write) + resolve sans SSOT~~ **Fait** (`mergeWriteFaceDecision` ; opt-in writes)
3. ~~Stamp métadonnées art~~ **Fait** (DB + `resolveFaceArtMetaForDig` / emitters)
4. ~~Admin + Affiche faces~~ **Fait**
5. ~~Foil policies / Unity↔WebGL~~ **Fait**
6. ~~`promoteResolvedFace` + Ranks display via `createCardFaceChoice`~~ **Fait**
7. ~~`catalogueFaceRank` → Affiche observations~~ **Fait**
8. ~~Fullset PK harvest + Coleka re-export + basename via `resolveFaceArtMetaForDig`~~ **Fait**
9. ~~Winner DB stamps on Naruto/PK emitters (`resolveDiskFaceAttachmentMeta`)~~ **Fait**
10. ~~Dead aliases (`catalogueArtQualityMarker`, foil CcUv / FoilCardImage lean re-exports, Coleka verifyWall, sealed faceDecision wrapper)~~ **Fait**
11. ~~Promote shelf → corpus apply~~ **Fait** (`decideCorpusPromoteCandidate` → `catalog.applyCorpusPromote` / LocalPrintsIndex via `printGame`)
12. ~~Pokémon identity promote~~ **Fait** (`applyCorpusPromotePokemon` on `tcgdexCatalog` ; dual-owner prefer-apply in core)
13. ~~Affiche disk attachments shared~~ **Fait** — `buildCatalogueDiskFaceAttachments` (lang-first `packCardDir`) ; LocalTcgLine + DBS CG/FW emit multi-`art.*` + `artKind` ; dead `isHtmlOnlyPhantom`
14. ~~Lorcana + Pokémon → shared Affiche helper~~ **Fait** — `lorcanatcg` resolve/browse ; Pokémon paper+Live merge via `artFiles` / `sourceTokenForFile`
15. ~~Naruto Carddass → shared Affiche helper~~ **Fait** — path resolve local ; mint via `buildCatalogueDiskFaceAttachments` (`indexedWinnerArt` + `coverProvenanceForFile`)
16. **Deferred** (P3) : sibling `arts_meta` JSON — **pas de dig demandeur** ; carddass.fr Bleach/DBS restent séparés

---

## 5. Frontière adapter (nouveau pack)

Un pack **peut** : `info` / capabilities / sources / `effectPack` ; parsers HTML ; hook `resolvePrintFace` si layout irréductible ; materials sous `effects/<pack>/`.

Un pack **ne doit pas** : recopier ranker de faces, client Wayback, mint URL admin, moteur foil ; brancher l’UI sur `providerId` hors `providers/` / `effects/`.
