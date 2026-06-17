#!/bin/sh
set -e

# La base est désormais PostgreSQL (service `db` du compose). DATABASE_URL est
# fournie par l'environnement. Le compose attend que la DB soit "healthy"
# (depends_on: condition: service_healthy) avant de lancer ce conteneur.

# Applique les migrations en attente sur Postgres.
npx prisma migrate deploy

# Démarre l'application (sortie standalone de Next.js).
exec node server.js
