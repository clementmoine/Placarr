import "dotenv/config";
import { Type, UserRole } from "../src/generated/prisma/browser";
import { prisma, disconnectPrisma } from "../src/lib/db/prisma";
import bcrypt from "bcryptjs";

/**
 * Demo shelves (name/type/color only — no baked-in image blobs).
 *
 * `type` is the shelf enum, not a bare string: declared as `string` it was not
 * assignable to what `prisma.shelf.create` expects, and a typo in this list
 * would only have surfaced at seed time.
 */
const DEMO_SHELVES: ReadonlyArray<{
  name: string;
  type: Type;
  color: string;
}> = [
  {
    name: "ATARI 2600",
    type: "games",
    color: "#ffffff",
  },
  {
    name: "Black Stories",
    type: "boardgames",
    color: "#000000",
  },
  {
    name: "Bluray",
    type: "movies",
    color: "#ffffff",
  },
  {
    name: "Bluray 4K",
    type: "movies",
    color: "#ffffff",
  },
  {
    name: "CD",
    type: "musics",
    color: "white",
  },
  {
    name: "DVD",
    type: "movies",
    color: "#ffffff",
  },
  {
    name: "DVD Disney",
    type: "movies",
    color: "#191159",
  },
  {
    name: "EXIT",
    type: "boardgames",
    color: "#ebffff",
  },
  {
    name: "Echoes",
    type: "boardgames",
    color: "#000000",
  },
  {
    name: "NEO GEO",
    type: "games",
    color: "#000000",
  },
  {
    name: "Nintendo 3DS",
    type: "games",
    color: "#ffffff",
  },
  {
    name: "Nintendo 64",
    type: "games",
    color: "#ffffff",
  },
  {
    name: "Nintendo DS",
    type: "games",
    color: "#ffffff",
  },
  {
    name: "Nintendo Game Boy Advance",
    type: "games",
    color: "#492e81",
  },
  {
    name: "Nintendo Gameboy",
    type: "games",
    color: "white",
  },
  {
    name: "Nintendo Gameboy Color",
    type: "games",
    color: "white",
  },
  {
    name: "Nintendo Gamecube",
    type: "games",
    color: "#ffffff",
  },
  {
    name: "Nintendo NES",
    type: "games",
    color: "white",
  },
  {
    name: "Nintendo SNES",
    type: "games",
    color: "white",
  },
  {
    name: "Nintendo Switch",
    type: "games",
    color: "#E60012",
  },
  {
    name: "Nintendo Wii",
    type: "games",
    color: "white",
  },
  {
    name: "Nintendo Wii U",
    type: "games",
    color: "white",
  },
  {
    name: "PlayStation 1",
    type: "games",
    color: "#D3D3D3",
  },
  {
    name: "PlayStation 2",
    type: "games",
    color: "#000000",
  },
  {
    name: "PlayStation 3",
    type: "games",
    color: "white",
  },
  {
    name: "PlayStation 4",
    type: "games",
    color: "#003791",
  },
  {
    name: "PlayStation Portable",
    type: "games",
    color: "white",
  },
  {
    name: "PlayStation Vita",
    type: "games",
    color: "white",
  },
  {
    name: "Playstation 5",
    type: "games",
    color: "#ffffff",
  },
  {
    name: "Sega Dreamcast",
    type: "games",
    color: "white",
  },
  {
    name: "Sega Game Gear",
    type: "games",
    color: "#F8F8F8",
  },
  {
    name: "Sega Master System",
    type: "games",
    color: "#000000",
  },
  {
    name: "Sega Mega Drive",
    type: "games",
    color: "#000000",
  },
  {
    name: "Sherlock Holmes",
    type: "boardgames",
    color: "#000000",
  },
  {
    name: "Unlock",
    type: "boardgames",
    color: "#000000",
  },
  {
    name: "Xbox 360",
    type: "games",
    color: "#ffffff",
  },
  {
    name: "Xbox One",
    type: "games",
    color: "white",
  },
  {
    name: "Xbox Original",
    type: "games",
    color: "#000000",
  },
  {
    name: "Xbox Series",
    type: "games",
    color: "#000000",
  },
];

async function main() {
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

  console.log(`Seeding ${DEMO_SHELVES.length} demo shelves...`);
  for (const user of [adminUser, guestUser]) {
    for (const shelf of DEMO_SHELVES) {
      const existing = await prisma.shelf.findFirst({
        where: { name: shelf.name, userId: user.id },
      });
      if (!existing) {
        await prisma.shelf.create({
          data: {
            name: shelf.name,
            type: shelf.type,
            color: shelf.color,
            userId: user.id,
          },
        });
      } else {
        await prisma.shelf.update({
          where: { id: existing.id },
          data: {
            type: shelf.type,
            color: shelf.color,
          },
        });
      }
    }
  }
  console.log("Demo shelves seeded.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await disconnectPrisma();
  });
