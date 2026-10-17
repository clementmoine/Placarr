# Unity sans Python — livré (ADR-021)

Objectif atteint : **UnityPy hors du chemin produit** (`pokemontcglive` /
`lorcanatcg`). Extract = Node (`@/lib/unity` + `unityfs-js` patché), déclenché
par **Catalogue Sync / worker in-process** (pas de CLI foil dans Docker).
Frida QA hors produit peut rester Python.

## Surface produit (Node)

| Module | Entrée | Rôle |
| ------ | ------ | ---- |
| `pokemontcglive` | `extractAllNode.ts`, `dumpCdnManifest.ts` | Manifests CDN, faces/masks ASTC, shaders `.frag`, UV mesh, dos, `cards.json` |
| `lorcanatcg` | `extractUnityNode.ts` | Matériaux / textures / shaders app Lorcana (Unity 6000) |

Patch critique : `patches/unityfs-js@0.2.8.patch` (LZ4/LZMA JS sous Node +
SerializedPass Unity 6000 — header editor-data retiré, cf. AssetStudio 3dkkb).

## Phases A–E

| Phase | Remplace | Statut |
| ----- | -------- | ------ |
| **A** | `dump_cdn_manifest.py` | ✅ Node |
| **B** | Texture2D ASTC→WebP | ✅ Node (Δ≤1 vs anciens artefacts) |
| **C** | shadersbundle → `.frag` | ✅ Node |
| **D** | card_quad / card_back / Lorcana | ✅ Node |
| **E** | retrait scripts Python + `packPython` / `PLACARR_UNITY_PYTHON` | ✅ |

## Liens

- ADR-021
- [data-layout.md](data-layout.md)
- Backlog P2 « Sortie UnityPy » (fermé)
