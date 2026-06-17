import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const itemId = "cmqb4htr50077utwguviy5xg7";
  const item = await prisma.item.findUnique({
    where: { id: itemId },
    include: { shelf: true },
  });

  console.log("=== WHEELMAN ITEM ===");
  console.log(JSON.stringify(item, null, 2));

  if (item && item.barcode) {
    const cache = await prisma.barcodeCache.findUnique({
      where: { barcode: item.barcode },
      include: { rawNames: true },
    });
    console.log("=== BARCODE CACHE ===");
    console.log(JSON.stringify(cache, null, 2));
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
