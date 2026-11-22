---
name: db-ops
description: PostgreSQL / Prisma operations for Placarr — schema changes and migrations, seeding, backups, restores, moving to another host, Docker volume handling. Use before any prisma migrate command, any change to prisma/schema.prisma, or any docker compose / volume command that could touch the database.
---

# Database operations

Reference: `docs/database.md` (storage, retention, restore, migration between hosts). Scripts: `docker/postgres/backup.sh`, `restore.sh`, `initdb/10-restore-latest.sh`.

## Where things live

- Live cluster: Docker named volume `placarr-db` — never a bind mount in a cloud-synced folder (fsync not guaranteed → corruption).
- Backups: `./backups/postgres/placarr-YYYYmmdd-HHMMSS.dump` (`pg_dump -Fc`), written by the `db-backup` service every 6 h with retention. The volume is not a backup; only dumps are.
- Empty volume on `docker compose up -d` → the latest dump is restored automatically (disable with `RESTORE_ON_INIT=0`), then run `pnpm prisma migrate deploy`.
- `DATABASE_URL` host should be `127.0.0.1` (compose binds IPv4 loopback only). Prisma client is generated to `src/generated/prisma`.

## Commands

```bash
pnpm db:backup                         # dump now (+ retention)
pnpm db:backups                        # list dumps
pnpm db:restore latest                 # restore into placarr_restore_test (safe)
pnpm prisma migrate deploy             # apply pending migrations
pnpm prisma db seed                    # owner account (first run)
```

## Always ask the user first

These destroy or overwrite data — take a fresh `pnpm db:backup` and get an explicit yes before running any of them (several are also denied in `.claude/settings.json`):

- `FORCE=1 pnpm db:restore <dump> placarr` (overwrites the live DB; stop Next and workers first)
- `docker compose down -v`, `docker volume rm placarr-db`, `docker volume prune`, `docker system prune --volumes`
- `pnpm prisma migrate reset`, `prisma db push --force-reset`, any `DROP` / `TRUNCATE`

## Schema changes

1. Take a dump: `pnpm db:backup`.
2. Edit `prisma/schema.prisma`, then `pnpm prisma migrate dev --name <snake_case_change>` (creates `prisma/migrations/<timestamp>_<name>/`). Review the generated SQL — data-losing steps (dropped columns, type changes) need a data migration or the user's OK.
3. `pnpm prisma generate` is run by `migrate dev`; restart the worker processes (`pnpm dev` supervises them) so they pick up the new client.
4. Production containers apply `prisma migrate deploy` at start-up.

Keep `processes × PRISMA_PG_POOL_MAX` under Postgres `max_connections` (vitest is capped at 4 workers for the same reason).
