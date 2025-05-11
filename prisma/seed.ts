import { PrismaClient, UserRole } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

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
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
