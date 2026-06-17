-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Shelf" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "imageUrl" TEXT,
    "color" TEXT,
    "type" TEXT NOT NULL,
    "isPublic" BOOLEAN NOT NULL DEFAULT true,
    "cardFormat" TEXT NOT NULL DEFAULT 'default',
    "userId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Shelf_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Shelf" ("color", "createdAt", "id", "imageUrl", "isPublic", "name", "type", "updatedAt", "userId") SELECT "color", "createdAt", "id", "imageUrl", "isPublic", "name", "type", "updatedAt", "userId" FROM "Shelf";
DROP TABLE "Shelf";
ALTER TABLE "new_Shelf" RENAME TO "Shelf";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
