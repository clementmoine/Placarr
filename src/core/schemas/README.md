# `core/schemas` — ce qu'est un item

Point d'entrée pour la question « qu'est-ce qu'un item Placarr ? »,
inspiré du `content-types.js` de tako-firehouse.

| Fichier | Rôle |
| --- | --- |
| [`content-types.ts`](./content-types.ts) | Types de contenu, domaines, profils, Zod identité |

La **persistance** reste `prisma/schema.prisma` (`Item`, `Metadata`, `Type`).
Ce dossier ne remplace pas Prisma : il documente et valide le contrat logique
(identité d'exemplaire, champs caractéristiques, regroupement domaine).

Le découpage physique `domains/<domaine>/providers/` est **volontairement
non fait** (churn massif, providers multi-domaines) — voir ADR-020.
