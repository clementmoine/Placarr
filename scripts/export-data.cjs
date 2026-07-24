/**
 * Exporte toutes les données de la base courante (SQLite) vers un JSON.
 * À lancer AVANT de basculer le provider Prisma vers PostgreSQL.
 *
 *   node scripts/export-data.cjs
 *
 * Le fichier produit (prisma/data-export.json) contient de vraies données
 * → il est gitignored. Les relations M2M (Metadata↔Author/Publisher) sont
 * incluses sous forme de listes de noms.
 */
const { PrismaClient } = require("@prisma/client");
const fs = require("fs");
const path = require("path");

async function main() {
  const prisma = new PrismaClient();
  try {
    const data = {
      users: await prisma.user.findMany(),
      authors: await prisma.author.findMany(),
      publishers: await prisma.publisher.findMany(),
      settings: await prisma.setting.findMany(),
      shelves: await prisma.shelf.findMany(),
      metadata: await prisma.metadata.findMany({
        include: {
          authors: { select: { name: true } },
          publishers: { select: { name: true } },
        },
      }),
      items: await prisma.item.findMany(),
      attachments: await prisma.attachment.findMany(),
      barcodeCache: await prisma.barcodeCache.findMany(),
      rawNames: await prisma.rawName.findMany(),
      loanRequests: await prisma.loanRequest.findMany(),
      unresolvedBarcodeScans: await prisma.unresolvedBarcodeScan.findMany(),
    };

    const out = path.join(__dirname, "..", "prisma", "data-export.json");
    fs.writeFileSync(out, JSON.stringify(data, null, 2));

    console.log("Export counts:");
    for (const [k, v] of Object.entries(data)) {
      console.log(`  ${k}: ${Array.isArray(v) ? v.length : 1}`);
    }
    console.log(`\nWritten: ${out}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
