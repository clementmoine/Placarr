import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const barcodes = [
    "0805529950894",
    "3459370474527",
    "3459370440300",
    "3459370402292",
    "8717418002565",
    "5024866326963",
    "0659556980511",
  ];

  console.log("Clearing BarcodeCache for:", barcodes);
  const deletedCache = await prisma.barcodeCache.deleteMany({
    where: {
      barcode: { in: barcodes },
    },
  });
  console.log(`Deleted ${deletedCache.count} BarcodeCache records.`);

  console.log("Clearing Metadata for:", barcodes);
  // Deleting metadata records that were fetched using these barcodes
  const deletedMetadata = await prisma.metadata.deleteMany({
    where: {
      sourceQuery: { in: barcodes },
    },
  });
  console.log(`Deleted ${deletedMetadata.count} Metadata records.`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
