-- CreateTable
CREATE TABLE "Attachment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "type" TEXT NOT NULL,
    "title" TEXT,
    "duration" INTEGER,
    "url" TEXT NOT NULL,
    "metadataId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Attachment_metadataId_fkey" FOREIGN KEY ("metadataId") REFERENCES "Metadata" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Shelf" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "imageUrl" TEXT,
    "color" TEXT,
    "type" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Shelf_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Author" (
    "name" TEXT NOT NULL PRIMARY KEY,
    "imageUrl" TEXT
);

-- CreateTable
CREATE TABLE "Publisher" (
    "name" TEXT NOT NULL PRIMARY KEY,
    "imageUrl" TEXT
);

-- CreateTable
CREATE TABLE "Metadata" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT,
    "duration" INTEGER,
    "pageCount" INTEGER,
    "tracksCount" INTEGER,
    "description" TEXT,
    "releaseDate" TEXT,
    "imageUrl" TEXT,
    "sourceType" TEXT NOT NULL,
    "sourceQuery" TEXT NOT NULL,
    "lastFetched" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Item" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "imageUrl" TEXT,
    "barcode" TEXT,
    "condition" TEXT NOT NULL,
    "metadataId" TEXT,
    "shelfId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Item_metadataId_fkey" FOREIGN KEY ("metadataId") REFERENCES "Metadata" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Item_shelfId_fkey" FOREIGN KEY ("shelfId") REFERENCES "Shelf" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Item_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "RawName" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "value" TEXT NOT NULL,
    "barcodeCacheId" INTEGER NOT NULL,
    CONSTRAINT "RawName_barcodeCacheId_fkey" FOREIGN KEY ("barcodeCacheId") REFERENCES "BarcodeCache" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "BarcodeCache" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "barcode" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT,
    "email" TEXT,
    "emailVerified" DATETIME,
    "image" TEXT,
    "role" TEXT NOT NULL DEFAULT 'guest',
    "password" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "_MetadataAuthors" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,
    CONSTRAINT "_MetadataAuthors_A_fkey" FOREIGN KEY ("A") REFERENCES "Author" ("name") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "_MetadataAuthors_B_fkey" FOREIGN KEY ("B") REFERENCES "Metadata" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "_MetadataPublishers" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,
    CONSTRAINT "_MetadataPublishers_A_fkey" FOREIGN KEY ("A") REFERENCES "Metadata" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "_MetadataPublishers_B_fkey" FOREIGN KEY ("B") REFERENCES "Publisher" ("name") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "RawName_barcodeCacheId_idx" ON "RawName"("barcodeCacheId");

-- CreateIndex
CREATE UNIQUE INDEX "BarcodeCache_barcode_key" ON "BarcodeCache"("barcode");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "_MetadataAuthors_AB_unique" ON "_MetadataAuthors"("A", "B");

-- CreateIndex
CREATE INDEX "_MetadataAuthors_B_index" ON "_MetadataAuthors"("B");

-- CreateIndex
CREATE UNIQUE INDEX "_MetadataPublishers_AB_unique" ON "_MetadataPublishers"("A", "B");

-- CreateIndex
CREATE INDEX "_MetadataPublishers_B_index" ON "_MetadataPublishers"("B");
