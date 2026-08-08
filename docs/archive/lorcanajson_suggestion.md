# Suggestion LorcanaJSON — hot foil colour / second varnish

Envoyé à Didero (suggestions@lorcanajson.org), 29/07/2026.

**Livré upstream** (release ~02/08/2026) :

- `hot_foil_color` + `second_hot_foil_color` → liste `foilEffectColors`
- `second_foil_top_layer_mask_url` → `images.varnishMask2`

Le sidecar `src/providers/lorcanajson/catalog.ts` (SSO Ravensburger) a été
retiré : ces champs viennent maintenant de `allCards.json`.

---

Hi,

Thank you for LorcanaJSON — the per-card `foilMask` and `varnishMask` are what
make it possible to render the foils faithfully outside the official app, and
nothing else publishes them.

I'd like to suggest three fields that are present in the Ravensburger catalog
your scraper already reads, but are not carried through to the output files.

In `v3/catalog/{language}`, under `cards.<type>[].variants[]`, each variant has:

```json
{
  "foil_type": "Lore",
  "foil_top_layer": "MetallicHotFoil",
  "foil_mask_url": "...",
  "foil_top_layer_mask_url": "...",
  "hot_foil_color": "#FF474B",
  "second_hot_foil_color": "#B2B2B2",
  "second_foil_top_layer_mask_url": "..."
}
```

You already expose `foil_type` as `foilTypes` and `foil_top_layer` as
`varnishType`, and `foil_mask_url` / `foil_top_layer_mask_url` as
`images.foilMask` / `images.varnishMask`. The three that don't come through are:

1. **`hot_foil_color`** — the colour the stamped varnish throws. It is the one
   piece the effect cannot be derived without: I checked, and it does not follow
   from the ink, the rarity, the set, or the varnish type. Three Enchanted cards
   from set 9 in Amber, Amethyst and Ruby all use `#D9A36D`, while the seven
   Iconic `Lore` prints use seven different colours. Without it the coat has to
   be drawn in an invented colour, which is visibly wrong.
2. **`second_hot_foil_color`**
3. **`second_foil_top_layer_mask_url`** — some prints carry two stamped varnish
   layers (set 13 #244 is one), and only the first is currently reachable.

In the current French catalog this affects 83 variants for the colour (9
distinct values) and 2 for the second layer — so it is a small addition, but
without it those cards can't be rendered correctly at all.

Suggested names, following your existing conventions: `hotFoilColor`,
`secondHotFoilColor`, and `images.secondVarnishMask`.

Thanks for considering it, and thanks again for the project.
