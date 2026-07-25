import "dotenv/config";
import { UserRole } from "../src/generated/prisma/browser";
import { prisma, disconnectPrisma } from "../src/lib/db/prisma";
import bcrypt from "bcryptjs";
import fs from "fs";
import path from "path";

async function main() {
  // Create admin user
  const adminUser = await prisma.user.upsert({
    where: { email: process.env.ADMIN_EMAIL || "admin@placarr.com" },
    update: {},
    create: {
      email: process.env.ADMIN_EMAIL || "admin@placarr.com",
      name: process.env.ADMIN_NAME || "Admin",
      role: UserRole.admin,
      password: await bcrypt.hash(process.env.ADMIN_PASSWORD || "admin", 12),
    },
  });

  // Create guest user
  const guestUser = await prisma.user.upsert({
    where: { email: process.env.GUEST_EMAIL || "guest@placarr.com" },
    update: {},
    create: {
      email: process.env.GUEST_EMAIL || "guest@placarr.com",
      name: process.env.GUEST_NAME || "Guest",
      role: UserRole.guest,
      password: await bcrypt.hash(
        process.env.GUEST_PASSWORD || "guest-password",
        12,
      ),
    },
  });

  console.log({ adminUser, guestUser });

  // Seeding custom shelves from shelves-seed.json
  const shelvesDataPath = path.join(
    process.cwd(),
    "prisma",
    "shelves-seed.json",
  );
  if (fs.existsSync(shelvesDataPath)) {
    const shelves = JSON.parse(fs.readFileSync(shelvesDataPath, "utf-8"));
    console.log(`Seeding ${shelves.length} custom shelves...`);

    const users = [adminUser, guestUser];
    for (const user of users) {
      for (const shelf of shelves) {
        const existing = await prisma.shelf.findFirst({
          where: {
            name: shelf.name,
            userId: user.id,
          },
        });

        if (!existing) {
          await prisma.shelf.create({
            data: {
              name: shelf.name,
              type: shelf.type,
              color: shelf.color,
              imageUrl: shelf.imageUrl,
              userId: user.id,
            },
          });
        } else {
          await prisma.shelf.update({
            where: { id: existing.id },
            data: {
              type: shelf.type,
              color: shelf.color,
              imageUrl: shelf.imageUrl,
            },
          });
        }
      }
    }
    console.log("Custom shelves seeded successfully.");
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await disconnectPrisma();
  });
