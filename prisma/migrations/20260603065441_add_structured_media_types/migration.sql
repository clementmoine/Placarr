-- AlterTable
ALTER TABLE "Attachment" ADD COLUMN "role" TEXT;
ALTER TABLE "Attachment" ADD COLUMN "source" TEXT;

-- CreateTable
CREATE TABLE "Setting" (
    "key" TEXT NOT NULL PRIMARY KEY,
    "value" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
