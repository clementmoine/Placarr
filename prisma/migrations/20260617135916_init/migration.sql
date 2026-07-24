-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('guest', 'user', 'admin');

-- CreateEnum
CREATE TYPE "Condition" AS ENUM ('new', 'used', 'damaged');

-- CreateEnum
CREATE TYPE "Type" AS ENUM ('games', 'movies', 'musics', 'books', 'boardgames');

-- CreateEnum
CREATE TYPE "AttachmentType" AS ENUM ('cover', 'background', 'screenshot', 'artwork', 'image', 'logo', 'audio');

-- CreateTable
CREATE TABLE "Attachment" (
    "id" TEXT NOT NULL,
    "type" "AttachmentType" NOT NULL,
    "title" TEXT,
    "duration" INTEGER,
    "url" TEXT NOT NULL,
    "metadataId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "role" TEXT,
    "source" TEXT,

    CONSTRAINT "Attachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Shelf" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "imageUrl" TEXT,
    "color" TEXT,
    "type" "Type" NOT NULL,
    "isPublic" BOOLEAN NOT NULL DEFAULT true,
    "cardFormat" TEXT NOT NULL DEFAULT 'default',
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Shelf_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Author" (
    "name" TEXT NOT NULL,
    "imageUrl" TEXT,

    CONSTRAINT "Author_pkey" PRIMARY KEY ("name")
);

-- CreateTable
CREATE TABLE "Publisher" (
    "name" TEXT NOT NULL,
    "imageUrl" TEXT,

    CONSTRAINT "Publisher_pkey" PRIMARY KEY ("name")
);

-- CreateTable
CREATE TABLE "Metadata" (
    "id" TEXT NOT NULL,
    "title" TEXT,
    "duration" INTEGER,
    "pageCount" INTEGER,
    "tracksCount" INTEGER,
    "description" TEXT,
    "releaseDate" TEXT,
    "imageUrl" TEXT,
    "sourceType" "Type" NOT NULL,
    "sourceQuery" TEXT NOT NULL,
    "lastFetched" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "aliases" TEXT,
    "facts" TEXT,

    CONSTRAINT "Metadata_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Item" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "imageUrl" TEXT,
    "barcode" TEXT,
    "condition" "Condition" NOT NULL,
    "metadataId" TEXT,
    "shelfId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "backgroundImageUrl" TEXT,

    CONSTRAINT "Item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RawName" (
    "id" SERIAL NOT NULL,
    "value" TEXT NOT NULL,
    "coverUrl" TEXT,
    "barcodeCacheId" INTEGER NOT NULL,

    CONSTRAINT "RawName_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BarcodeCache" (
    "id" SERIAL NOT NULL,
    "barcode" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "platformKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "shelfType" TEXT,
    "priceLastUpdated" TIMESTAMP(3),
    "priceNew" INTEGER,
    "priceUsed" INTEGER,
    "priceUsedCIB" INTEGER,

    CONSTRAINT "BarcodeCache_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UnresolvedBarcodeScan" (
    "id" SERIAL NOT NULL,
    "barcode" TEXT NOT NULL,
    "shelfType" TEXT NOT NULL DEFAULT 'unknown',
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "seenCount" INTEGER NOT NULL DEFAULT 1,
    "providers" TEXT,
    "rawNames" TEXT,
    "rawPayload" TEXT,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UnresolvedBarcodeScan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT,
    "email" TEXT,
    "image" TEXT,
    "role" "UserRole" NOT NULL DEFAULT 'guest',
    "password" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Setting" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Setting_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "LoanRequest" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "requesterId" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LoanRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_MetadataAuthors" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_MetadataAuthors_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateTable
CREATE TABLE "_MetadataPublishers" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_MetadataPublishers_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE INDEX "Attachment_metadataId_idx" ON "Attachment"("metadataId");

-- CreateIndex
CREATE INDEX "Shelf_userId_idx" ON "Shelf"("userId");

-- CreateIndex
CREATE INDEX "Item_shelfId_idx" ON "Item"("shelfId");

-- CreateIndex
CREATE INDEX "Item_userId_idx" ON "Item"("userId");

-- CreateIndex
CREATE INDEX "Item_metadataId_idx" ON "Item"("metadataId");

-- CreateIndex
CREATE INDEX "Item_barcode_idx" ON "Item"("barcode");

-- CreateIndex
CREATE INDEX "RawName_barcodeCacheId_idx" ON "RawName"("barcodeCacheId");

-- CreateIndex
CREATE UNIQUE INDEX "BarcodeCache_barcode_key" ON "BarcodeCache"("barcode");

-- CreateIndex
CREATE INDEX "UnresolvedBarcodeScan_barcode_idx" ON "UnresolvedBarcodeScan"("barcode");

-- CreateIndex
CREATE INDEX "UnresolvedBarcodeScan_status_lastSeenAt_idx" ON "UnresolvedBarcodeScan"("status", "lastSeenAt");

-- CreateIndex
CREATE UNIQUE INDEX "UnresolvedBarcodeScan_barcode_shelfType_reason_key" ON "UnresolvedBarcodeScan"("barcode", "shelfType", "reason");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "LoanRequest_itemId_idx" ON "LoanRequest"("itemId");

-- CreateIndex
CREATE INDEX "LoanRequest_ownerId_idx" ON "LoanRequest"("ownerId");

-- CreateIndex
CREATE INDEX "LoanRequest_requesterId_idx" ON "LoanRequest"("requesterId");

-- CreateIndex
CREATE INDEX "LoanRequest_status_idx" ON "LoanRequest"("status");

-- CreateIndex
CREATE INDEX "_MetadataAuthors_B_index" ON "_MetadataAuthors"("B");

-- CreateIndex
CREATE INDEX "_MetadataPublishers_B_index" ON "_MetadataPublishers"("B");

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_metadataId_fkey" FOREIGN KEY ("metadataId") REFERENCES "Metadata"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Shelf" ADD CONSTRAINT "Shelf_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Item" ADD CONSTRAINT "Item_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Item" ADD CONSTRAINT "Item_shelfId_fkey" FOREIGN KEY ("shelfId") REFERENCES "Shelf"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Item" ADD CONSTRAINT "Item_metadataId_fkey" FOREIGN KEY ("metadataId") REFERENCES "Metadata"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RawName" ADD CONSTRAINT "RawName_barcodeCacheId_fkey" FOREIGN KEY ("barcodeCacheId") REFERENCES "BarcodeCache"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoanRequest" ADD CONSTRAINT "LoanRequest_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoanRequest" ADD CONSTRAINT "LoanRequest_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoanRequest" ADD CONSTRAINT "LoanRequest_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_MetadataAuthors" ADD CONSTRAINT "_MetadataAuthors_A_fkey" FOREIGN KEY ("A") REFERENCES "Author"("name") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_MetadataAuthors" ADD CONSTRAINT "_MetadataAuthors_B_fkey" FOREIGN KEY ("B") REFERENCES "Metadata"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_MetadataPublishers" ADD CONSTRAINT "_MetadataPublishers_A_fkey" FOREIGN KEY ("A") REFERENCES "Metadata"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_MetadataPublishers" ADD CONSTRAINT "_MetadataPublishers_B_fkey" FOREIGN KEY ("B") REFERENCES "Publisher"("name") ON DELETE CASCADE ON UPDATE CASCADE;
