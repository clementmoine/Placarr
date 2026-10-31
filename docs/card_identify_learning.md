# Identify cartes — index embeddings vs fine-tune CLIP

Doc produit / MLOps pour la reconnaissance visuelle TCG.
**Décision formelle** : [ADR-023](ADR.md#adr-023--croissance-catalogue--ré-embed-pas-retrain).

> **Modèle courant (2026-10-31)** : `Xenova/dinov2-small` (CLS 384‑d, bande
> art) — `core/identify/embedMath.ts`, même checkpoint serveur (Sync) et
> client (WebGPU fp32 / WASM q8). Bench Lorcana FR 3 462 arts × 150 photos
> dégradées : 4 vraies erreurs (le reste des « échecs » = art réimprimé,
> indécidable sans OCR), marge #1/#2 p10 = 52 milli (CLIP ViT‑B/32 : ≈ 0).
> « CLIP » ci-dessous désigne la famille « encodeur image figé » ; la
> stratégie (ré-embed, pas retrain) est inchangée.

## TL;DR (une phrase)

Nouvelles cartes = **ré-encoder les faces avec le même modèle** et mettre à
jour l’index (Sync). **Fine-tuner CLIP** = rare, offline, seulement si la
qualité photo→art stagne malgré index complet + OCR + gates.

## Deux objets distincts

| Objet | C’est quoi | Change quand… |
| ----- | ---------- | ------------- |
| **Modèle** (CLIP / ONNX) | Fonction fixe image → vecteur | Rarement (version bump / fine-tune) |
| **Index / galerie** | Liste de vecteurs des faces catalogue | **À chaque set / face nouvelle** |

Identifier une carte = encoder la photo avec le modèle, puis chercher les
voisins dans l’index. Sans entrée dans l’index, la carte est **invisible** —
même avec un modèle parfait. C’est le *cold start au niveau index*, pas un
problème de « modèle pas assez entraîné ».

Industry standard (e-commerce / docs / TCG) :

1. Encoder seulement les **nouveaux** items (ou ceux dont l’art a changé).
2. Append / upsert dans le store (FAISS `add`, HNSW, fichier sidecar Placarr…).
3. **Ne pas** re-entraîner le réseau parce qu’un SKU est arrivé.
4. Après **changement de modèle** : re-encoder **tout** le corpus (anciens
   vecteurs incompatibles). Taguer chaque index avec `modelId` / version.

Réfs. pratiques : incremental CLIP indexes ([The Neural Base](https://theneuralbase.com/clip/learn/advanced/incremental-index-updates/)),
freshness vector DB ([CalibreOS](https://www.calibreos.com/learn/mlsd-embeddings-vector-db)),
Drift-Adapter EMNLP 2025 (migration modèle ≠ ajout de docs).

## Ce que fait Placarr aujourd’hui

Pipeline Sync catalogue (`identifyIndexesStep`) :

1. **Visual index** (dHash / signaux) — `visualIndexStep`
2. **Embedding index** (DINOv2) — `embeddingIndexStep`

Les deux sont **incrémentaux sur l’empreinte du fichier face** (`fp` =
`taille-mtime`, portée par chaque entrée) :

- face inchangée → signaux et vecteur **copiés**, jamais relue ;
- face réécrite en place sous le même nom → re-hashée **et** ré-encodée ;
- résultat identique au fichier d’index existant → **pas de réécriture**
  (`builtAt`, mtime et ETag stables → les shards IndexedDB du téléphone
  répondent 304 à leur revalidation).

Fraîcheur embeddings (`embeddingLooksFresh`) : même nombre d’entrées que le
visual index et mtime embedding ≥ mtime visual → skip ; sinon rebuild
incrémental (delta seulement). Un Sync sans nouvelle carte ne décode donc
aucune image et n’écrit aucun index (mesuré : Yu‑Gi‑Oh 73 k faces → 1–3 s).

Rattrapage / force rebuild : admin Catalogue → **Indexes caméra**
(pack) ou **CLIP manquant (N)** (tous les packs stale) — `only: ["identify"]`,
force — **pas de CLI**. Le statut corpora affiche `vis / CLIP`.

Query path (caméra Auto) : multi-signaux + hybride dHash/CLIP + soft abstain
cross-game + (scaffold) OCR collector# — principe produit inchangé :
**vide honnête OK, faux positif confiant interdit**.

### Sujet caméra : quad → redressement (pas d'AABB)

Ce que l'embed voit est **la carte redressée**, jamais un rectangle englobant :
une carte inclinée à 30° parmi d'autres donne, en AABB, un losange de table +
voisines (distances 250–340, miss) ; redressée par homographie
(`perspectiveWarp`, même code que le crop serveur) elle retombe à 100–120.

Chaîne live (`useScanPipeline.tickSubject`) :

1. **Classique haute précision** (`cardQuadClassical`, `precision: "high"`) :
   masque Sobel fermé + trous bouchés, ouverture morphologique (sépare les
   voisines collées), enveloppe convexe → 4 sommets → ajustement des côtés par
   droites. Gates : remplissage ≥ 0.8, support des côtés ≥ 0.8, bbox qui ne
   couvre pas > 90 % du cadre dans les deux sens (`MAX_SUBJECT_FRAME_SPAN` —
   sinon c'est la table / le poster, pas la carte).
2. **DocAligner** (ONNX, fond chargé / pochette / foil) : post-process
   officiel (plus gros blob par canal à 0.3) ; si le quad n'est pas une carte
   et qu'**un seul** coin est muet ou aberrant, on le complète par le
   parallélogramme des trois autres **uniquement** si un blob faible du même
   canal le confirme à < 8 % de la diagonale (`heatmapCardCorners`). Deux coins
   muets → miss honnête.
3. **Classique basse précision** (remplissage scanline) — ROI seulement.

Le quad n'est redressé pour identify / OCR que s'il « ressemble à une carte »
(`quadSafeForIdentifyCrop` : côtés opposés ≥ 0.65, ratio 0.55–0.9 une fois
droit, 6–85 % du cadre, convexe) ; sinon retour AABB / plein cadre.

## Croissance régulière des sets (cas Placarr)

Quand un extract Sync ramène un nouveau set :

| Étape | Automatique ? | Coût |
| ----- | ------------- | ---- |
| Faces sur disque / ledger | Extract / refresh admin | I/O + réseau |
| Visual index | Sync | CPU léger |
| CLIP embeddings des **nouvelles** faces | Sync / **Indexes caméra** | ONNX CPU/GPU — **pas** de training |
| Fine-tune CLIP | **Non** | Dataset + GPU + eval + re-embed **tout** |

Donc : « on aura de nouvelles cartes régulièrement » → **ops d’index**, pas
de retrain. Le produit doit garantir que Sync laisse l’embedding index à jour
(ou affiche clairement « embeddings stale »).

## Quand fine-tuner (et seulement alors)

Fine-tune = adapter le **modèle** au domaine (photo téléphone ↔ art
catalogue, glare, warp, foil). Littérature + prod :

- **Ne pas** fine-tuner parce que le catalogue a grandi (LanceDB guide,
  Neural Base long-term CLIP strategy).
- Fine-tuner si **domaine** sous-représenté vs prétrain, et qu’un eval
  hold-out photo réelle le montre.
- Risque majeur : **catastrophic forgetting** (arXiv Continual Learning for
  CLIP) — un FT naïf casse le zero-shot / d’autres jeux.
- Mercari (10M paires, jours A100) = échelle entreprise ; pour Placarr,
  viser d’abord **augments à l’index** (warp / blur / glare synthétiques sur
  l’art) ou un **adapter** léger (DAC / LoRA) plutôt qu’un full FT.
- Synthétique seul → gap réel/gen (RegFT) : toujours valider sur **photos
  téléphone** tenues à l’écart.

**Déclencheurs Placarr (tous requis avant d’ouvrir un chantier FT)** :

1. Embeddings **complets** sur tous les packs avec faces.
2. OCR collector# branché + shortlist saine.
3. Quad / quality gates stables.
4. Suite golden photo→printKey : plateau clair (ex. recall@1 / rate « sure »
   stagnent ; FP rate déjà sous contrôle).
5. Dataset versionné : paires (photo crop, `printKey`) + hold-out par jeu.
6. Après FT : **rebuild total** des indexes + tag `modelId` ; A/B vs ancien.

Hors ces conditions, FT = coût + risque sans levier produit.

## Marché TCG (lecture)

- **Delver Lens** : modèle compact on-device (~5 MB, 35k+ cartes), sync sets —
  le rythme produit est **mise à jour catalogue / modèle de reco**, pas un
  retrain utilisateur à chaque set. Détail algo propriétaire.
- Scanners open / hobby : souvent **phash / dHash set-lock** ou CLIP gallery —
  même logique « galerie qui grandit ».
- Pas de preuve publique qu’un scanner grand public **ré-entraîne CLIP à
  chaque spoilers set** ; le pattern dominant est **index freshness**.

## Règles opérationnelles Placarr

1. **Default path** : admin Sync → visual → embed. Missing vectors = bug de
   fraîcheur (bouton **Indexes caméra**), pas « besoin de fine-tune ». Pas de
   script `package.json` pour ça.
2. **Versionner** le modèle dans les sidecars embedding (`modelId`). Changer
   de checkpoint = invalidation globale + rebuild.
3. **Incrémental** (évolution souhaitable) : encoder seulement les
   `printKey` absents / art hash changé ; éviter rebuild O(N) à chaque Sync
   quand N devient gros.
4. **Monitor** : distribution des scores top1/margin, taux abstain, FP
   reportés — seuil avant d’envisager FT.
5. **Jamais** auto-accept confiant ; FT n’autorise pas à baisser la barre
   sure≠FP.

## Liens code

- `src/providers/shared/cardCatalogue/identifyIndexesStep.ts`
- `src/providers/shared/cardCatalogue/embeddingIndexStep.ts`
- `src/core/identify/cardEmbeddingIndex.ts`
- `src/core/identify/cardVisualIndex.ts`
- Caméra : `UnifiedScanCapture`, `scanAccept`, soft abstain hybrid

## Sources (sélection)

- The Neural Base — Incremental index updates ; When to fine-tune CLIP ;
  Long-term CLIP strategy
- LanceDB — Practical guide to fine-tuning embedding models
- CalibreOS — Embeddings & vector DBs (freshness, HNSW add)
- Drift-Adapter (EMNLP 2025) — upgrades de modèle ≠ inserts
- Continual Learning for CLIP (arXiv 2207.09248) — forgetting
- Mercari Engineering — fine-tuned CLIP at marketplace scale
- OpenAI CLIP paper — retrieval = gallery + frozen encoders
