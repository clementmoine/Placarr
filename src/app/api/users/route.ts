import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { UserRole } from "@/generated/prisma/browser";
import bcrypt from "bcryptjs";
import { getToken } from "next-auth/jwt";

import { authOptions } from "@/lib/auth/config";
import { prisma } from "@/lib/db/prisma";
import {
  MIN_PASSWORD_LENGTH,
  PASSWORD_HASH_ROUNDS,
} from "@/lib/auth/passwordPolicy";

/** Mono-user: only the unlock password can be changed here. */
export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const token = await getToken({ req });

  if (!session?.user?.email || !token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (session.user.role === UserRole.guest) {
    return NextResponse.json(
      { error: "Write access not allowed" },
      { status: 403 },
    );
  }

  try {
    const data = await req.json();
    const password = data?.password;

    if (typeof password !== "string" || password.length < MIN_PASSWORD_LENGTH) {
      return NextResponse.json(
        {
          error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters`,
        },
        { status: 400 },
      );
    }

    const user = await prisma.user.update({
      where: { email: session.user.email },
      data: {
        password: await bcrypt.hash(password, PASSWORD_HASH_ROUNDS),
      },
      select: {
        id: true,
        email: true,
        role: true,
        updatedAt: true,
      },
    });

    return NextResponse.json(user);
  } catch (error) {
    console.error("Error updating password:", error);
    return NextResponse.json(
      { error: "Failed to update password" },
      { status: 500 },
    );
  }
}
