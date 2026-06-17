import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const itemId = "cmqb4htr50077utwguviy5xg7";
  const item = await prisma.item.findUnique({
    where: { id: itemId },
    select: {
      id: true,
      name: true,
      barcode: true,
      metadata: true,
    },
  });
  console.log("Item metadata structure:", JSON.stringify(item, null, 2));
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
