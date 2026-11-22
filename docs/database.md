# Base PostgreSQL — stockage, sauvegardes, restauration, migration

> Réécrit le 2026-11-21 : la version du 2026-11-18 (jamais commitée) a été
> perdue avec la sync Synology Drive. Scripts : `docker/postgres/`.

## Principe

| Quoi | Où | Pourquoi |
|------|----|----------|
| Base **vivante** | volume Docker `placarr-db` | Un cluster PostgreSQL en marche ne doit jamais être dans un dossier synchronisé (Synology Drive, iCloud, Dropbox) : `fsync` non garanti, fichiers copiés à moitié → corruption. Le volume est aussi le chemin rapide sous macOS. |
| **Sauvegardes** | `./backups/postgres/placarr-YYYYmmdd-HHMMSS.dump` | Dumps `pg_dump -Fc` : fichiers statiques, seuls éléments à copier vers le NAS. Ignorés par Git. `PLACARR_BACKUP_DIR` permet de les écrire ailleurs (ex. partage NAS monté). |
| Code | Git (GitHub) | Clone de travail hors dossier synchronisé (`~/Documents/Projets/Placarr`). |
| `.env` | local uniquement | Non versionné : en garder une copie dans un gestionnaire de mots de passe. |

Le volume n'est **pas** une sauvegarde : seuls les dumps le sont.

## Automatique

`docker compose up -d` démarre `db-backup` (`docker/postgres/backup.sh loop`),
qui fait un dump toutes les 6 h (`BACKUP_INTERVAL_SECONDS`) puis applique la
rétention :

- < 7 jours (`BACKUP_KEEP_ALL_DAYS`) : tous les dumps
- < 35 jours (`BACKUP_KEEP_DAILY_DAYS`) : le premier de chaque jour
- < 365 jours (`BACKUP_KEEP_MONTHLY_DAYS`) : le premier de chaque mois
- au-delà : supprimés

Le dump est écrit dans `backups/postgres/.partial/` puis renommé une fois
vérifié (`pg_restore --list`) — jamais de fichier tronqué dans le dossier.

**Volume vide = restauration automatique** : si `placarr-db` n'existe plus
(Docker Desktop réinstallé, nouvelle machine), le premier `docker compose up -d`
restaure le dump le plus récent (`docker/postgres/initdb/10-restore-latest.sh`).
`RESTORE_ON_INIT=0` pour démarrer vide. Lancer ensuite
`pnpm prisma migrate deploy` (applique les migrations plus récentes que le dump).

## Manuel

```bash
pnpm db:backup                         # dump immédiat (+ rétention)
pnpm db:backups                        # lister les dumps
pnpm db:restore latest                 # test : restaure dans placarr_restore_test
pnpm db:restore placarr-20261118-220000.dump placarr_restore_test
FORCE=1 pnpm db:restore latest placarr # ÉCRASE la base vivante — arrêter Next/workers avant
```

`restore.sh` affiche le nombre de lignes par table après restauration :
tester une restauration au moins une fois par mois (`pnpm db:restore latest`)
et comparer avec la base vivante.

## Commandes à ne pas lancer sans dump récent

`docker compose down -v`, `docker volume rm placarr-db`, `docker volume prune`,
`docker system prune --volumes`, `prisma migrate reset`, réinitialisation /
désinstallation de Docker Desktop. Avant : `pnpm db:backup`.
`.claude/settings.json` bloque ces commandes pour Claude Code.

## Migration vers un autre hôte

Ne jamais copier le dossier de données PostgreSQL : il dépend de la version
majeure et de la plateforme. Toujours passer par un dump.

1. Ancien hôte : arrêter Next et les workers, `pnpm db:backup`.
2. Copier le dépôt (Git), `.env`, `data/` (rsync, workers arrêtés : les
   `catalog.sqlite` doivent être au repos) et `backups/postgres/`.
3. Nouvel hôte : `docker compose up -d` → la base est restaurée depuis le
   dernier dump, puis `docker compose --profile prod up -d` (le conteneur
   applique `prisma migrate deploy` au démarrage).
