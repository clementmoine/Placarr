#!/bin/sh
if [ ! -f /config/dev.db ]; then
  echo "Database not found in volume, initializing..."
  if [ -f /app/prisma/dev.db ]; then
    cp /app/prisma/dev.db /config/dev.db
  else
    touch /config/dev.db
  fi
fi

# Create symbolic link to the database in the volume
ln -sf /config/dev.db /app/prisma/dev.db

# Generate Prisma client
npx prisma generate

# Apply migrations
npx prisma migrate deploy

# Start the application
exec node server.js
