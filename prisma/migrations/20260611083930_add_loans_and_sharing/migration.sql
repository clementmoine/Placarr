-- AlterTable
ALTER TABLE "BarcodeCache" ADD COLUMN "shelfType" TEXT;

-- AlterTable
ALTER TABLE "Metadata" ADD COLUMN "aliases" TEXT;

-- CreateTable
CREATE TABLE "LoanRequest" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "itemId" TEXT NOT NULL,
    "requesterId" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "LoanRequest_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "LoanRequest_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "LoanRequest_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_RawName" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "value" TEXT NOT NULL,
    "coverUrl" TEXT,
    "barcodeCacheId" INTEGER NOT NULL,
    CONSTRAINT "RawName_barcodeCacheId_fkey" FOREIGN KEY ("barcodeCacheId") REFERENCES "BarcodeCache" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_RawName" ("barcodeCacheId", "id", "value") SELECT "barcodeCacheId", "id", "value" FROM "RawName";
DROP TABLE "RawName";
ALTER TABLE "new_RawName" RENAME TO "RawName";
CREATE INDEX "RawName_barcodeCacheId_idx" ON "RawName"("barcodeCacheId");
CREATE TABLE "new_Shelf" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "imageUrl" TEXT,
    "color" TEXT,
    "type" TEXT NOT NULL,
    "isPublic" BOOLEAN NOT NULL DEFAULT true,
    "userId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Shelf_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Shelf" ("color", "createdAt", "id", "imageUrl", "name", "type", "updatedAt", "userId") SELECT "color", "createdAt", "id", "imageUrl", "name", "type", "updatedAt", "userId" FROM "Shelf";
DROP TABLE "Shelf";
ALTER TABLE "new_Shelf" RENAME TO "Shelf";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
