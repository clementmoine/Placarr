/**
 * Importe prisma/data-export.json dans la base courante (PostgreSQL).
 * À lancer APRÈS `prisma migrate dev` sur une base Postgres vierge.
 *
 *   node scripts/import-data.cjs
 *
 * Ordre respectant les contraintes de clés étrangères, puis remise à niveau
 * des séquences auto-increment (RawName / BarcodeCache / UnresolvedBarcodeScan).
 */
const { PrismaClient } = require("@prisma/client");
const fs = require("fs");
const path = require("path");

async function main() {
  const file = path.join(__dirname, "..", "prisma", "data-export.json");
  const data = JSON.parse(fs.readFileSync(file, "utf8"));
  const prisma = new PrismaClient();

  try {
    console.log("Importing into PostgreSQL...");

    // 1. Indépendants / racines
    if (data.users?.length)
      await prisma.user.createMany({ data: data.users, skipDuplicates: true });
    if (data.authors?.length)
      await prisma.author.createMany({
        data: data.authors,
        skipDuplicates: true,
      });
    if (data.publishers?.length)
      await prisma.publisher.createMany({
        data: data.publishers,
        skipDuplicates: true,
      });
    if (data.settings?.length)
      await prisma.setting.createMany({
        data: data.settings,
        skipDuplicates: true,
      });

    // 2. Metadata (+ relations M2M authors/publishers par nom)
    for (const m of data.metadata || []) {
      const { authors, publishers, ...scalar } = m;
      await prisma.metadata.create({
        data: {
          ...scalar,
          authors: authors?.length
            ? { connect: authors.map((a) => ({ name: a.name })) }
            : undefined,
          publishers: publishers?.length
            ? { connect: publishers.map((p) => ({ name: p.name })) }
            : undefined,
        },
      });
    }

    // 3. Shelf (FK user) → Item (FK shelf/user/metadata) → Attachment (FK metadata)
    if (data.shelves?.length)
      await prisma.shelf.createMany({
        data: data.shelves,
        skipDuplicates: true,
      });
    if (data.items?.length)
      await prisma.item.createMany({ data: data.items, skipDuplicates: true });
    if (data.attachments?.length)
      await prisma.attachment.createMany({
        data: data.attachments,
        skipDuplicates: true,
      });

    // 4. BarcodeCache → RawName (FK barcodeCache)
    if (data.barcodeCache?.length)
      await prisma.barcodeCache.createMany({
        data: data.barcodeCache,
        skipDuplicates: true,
      });
    if (data.rawNames?.length) {
      // SQLite n'imposait pas l'intégrité référentielle : on écarte les
      // RawName orphelins dont le barcodeCache parent n'existe pas.
      const cacheIds = new Set((data.barcodeCache || []).map((c) => c.id));
      const validRawNames = data.rawNames.filter((rn) =>
        cacheIds.has(rn.barcodeCacheId),
      );
      const dropped = data.rawNames.length - validRawNames.length;
      if (dropped > 0)
        console.warn(`  (skipped ${dropped} orphan rawNames)`);
      if (validRawNames.length)
        await prisma.rawName.createMany({
          data: validRawNames,
          skipDuplicates: true,
        });
    }

    // 5. Restants
    if (data.loanRequests?.length)
      await prisma.loanRequest.createMany({
        data: data.loanRequests,
        skipDuplicates: true,
      });
    if (data.unresolvedBarcodeScans?.length)
      await prisma.unresolvedBarcodeScan.createMany({
        data: data.unresolvedBarcodeScans,
        skipDuplicates: true,
      });

    // 6. Remise à niveau des séquences auto-increment
    for (const table of ["RawName", "BarcodeCache", "UnresolvedBarcodeScan"]) {
      await prisma.$executeRawUnsafe(
        `SELECT setval(pg_get_serial_sequence('"${table}"', 'id'), GREATEST((SELECT COALESCE(MAX(id), 0) FROM "${table}"), 1))`,
      );
    }

    // 7. Vérification
    const counts = {
      users: await prisma.user.count(),
      authors: await prisma.author.count(),
      publishers: await prisma.publisher.count(),
      settings: await prisma.setting.count(),
      shelves: await prisma.shelf.count(),
      metadata: await prisma.metadata.count(),
      items: await prisma.item.count(),
      attachments: await prisma.attachment.count(),
      barcodeCache: await prisma.barcodeCache.count(),
      rawNames: await prisma.rawName.count(),
      loanRequests: await prisma.loanRequest.count(),
      unresolvedBarcodeScans: await prisma.unresolvedBarcodeScan.count(),
    };
    console.log("Imported counts:");
    for (const [k, v] of Object.entries(counts)) console.log(`  ${k}: ${v}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
