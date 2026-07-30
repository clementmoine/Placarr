# unity-dump — extraire les effets carte d'une app mobile Unity

Pipeline qui a servi pour Lorcana et qui doit resservir tel quel pour les
prochains TCG (Pokémon TCG…). La méthode complète, avec ce qu'on a appris en
la construisant, est dans `docs/tcg_support.md` §9.

## Prérequis

- L'APK de l'app (split APK : c'est le split `config.*` ou `base.apk` qui
  contient `assets/bin/Data/`). Dézippé quelque part.
- Python ≥ 3.11, puis :

```sh
python -m venv .venv && .venv/bin/pip install -r requirements.txt
```

## Lancer

```sh
.venv/bin/python dump_card_effects.py \
  --data /chemin/vers/apk/assets/bin/Data \
  --repo ../..
```

Trois phases, trois sorties :

| Phase     | Sortie                                    | Contenu                                                          |
| --------- | ----------------------------------------- | ---------------------------------------------------------------- |
| shaders   | `public/foil/unity/shaders/*.frag`        | fragments GLSL Tilt + Time, un fichier par variante de keywords  |
| matériaux | `src/core/render/unityFoil/manifest.json` | bindings : textures (wrap/filter/mips), floats, couleurs, 2 frags |
| textures  | `public/foil/unity/textures/*.png`        | toutes les textures que les matériaux lient                      |

## Pourquoi ça marche (et quand ça ne marchera pas)

Un build Android Unity cible `GLES3Plus` : les shaders « compilés » sont du
**GLSL texte** (`#version 300 es`), le dialecte exact de WebGL2. Le script ne
transcrit aucune math — il bascule deux macros (`HLSLCC_ENABLE_UNIFORM_BUFFERS`
et `UNITY_SUPPORTS_UNIFORM_LOCATION` à 0) pour que les uniform buffers
deviennent des uniforms nommés et que les qualifieurs `layout(location)`
interdits en ES 3.00 disparaissent.

Si une app cible Vulkan uniquement, les programmes sont du SPIR-V : la même
approche demande alors un passage par `spirv-cross`. Vérifier d'abord avec
`ShaderCompilerPlatform` (voir le script).

## Adapter à un autre jeu

Deux constantes en tête de `dump_card_effects.py` :

- `CARD_EFFECT_KEYS` — les mots qui marquent un shader/matériau d'effet carte
  dans *cette* app (`Foil`, `Varnish`, `Holo` chez Ravensburger).
- `RUNTIME_ROLES` — les slots de texture par-carte (art, masques), à remplacer
  à l'exécution par le catalogue du jeu.

Tout le reste (parsing du blob, variantes par keywords, filtrage des uniforms
réellement déclarés par chaque fragment) est indépendant du jeu.
