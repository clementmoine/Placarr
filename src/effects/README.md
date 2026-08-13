# Effect packs

Un dossier = un jeu. Contrat : `EffectPackModule` (`core/render/foil/types`).
Architecture et sources de vérité : [`docs/foil_effects.md`](../../docs/foil_effects.md).

| Pack | CSS | WebGL |
|------|-----|-------|
| `lorcana/` | Site Lorcana (`data/…/web`) | App TCG Unity (`manifest` + `.frag`) |
| `pokemon/` | Simey vendored → `HoloShader` | TCG Live HoloFoil (`.frag` + sheets) |

Nouveau finish upstream → admin foil-status (`computeFoilGaps`) +
[`docs/foil_new_finish.md`](../../docs/foil_new_finish.md).

Ne pas mettre de literal de provider id ici ; le provider pointe seulement
`effectPack`. Core ne choisit pas de finish par défaut de pack.
