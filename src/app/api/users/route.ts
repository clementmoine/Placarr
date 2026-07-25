import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { Prisma, UserRole } from "@/generated/prisma/browser";
import bcrypt from "bcryptjs";
import { getToken } from "next-auth/jwt";

import { authOptions } from "@/lib/auth/config";
import { prisma } from "@/lib/db/prisma";
import {
  MIN_PASSWORD_LENGTH,
  PASSWORD_HASH_ROUNDS,
} from "@/lib/auth/passwordPolicy";

export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const token = await getToken({ req });

  if (!session?.user?.email || !token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // The shared guest account is read-only everywhere else; without this it
  // could rename itself, change its email, or lock everyone out by setting a
  // new password.
  if (session.user.role === UserRole.guest) {
    return NextResponse.json(
      { error: "Write access not allowed for guests" },
      { status: 403 },
    );
  }

  try {
    const data = await req.json();
    const { name, image, password, email } = data;

    const updateData: Prisma.UserUpdateInput = { name, image };
    if (password) {
      // Same floor and cost as registration — otherwise the minimum is one
      // profile update away from being bypassed.
      if (
        typeof password !== "string" ||
        password.length < MIN_PASSWORD_LENGTH
      ) {
        return NextResponse.json(
          {
            error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters`,
          },
          { status: 400 },
        );
      }
      updateData.password = await bcrypt.hash(password, PASSWORD_HASH_ROUNDS);
    }

    // If email is being changed, we need to update the session
    if (email && email !== session.user.email) {
      // Check if new email is already taken
      const existingUser = await prisma.user.findUnique({
        where: { email },
      });
      if (existingUser) {
        return NextResponse.json(
          { error: "Email already in use" },
          { status: 400 },
        );
      }
      updateData.email = email;
    }

    const user = await prisma.user.update({
      where: { email: session.user.email },
      data: updateData,
    });

    // Never expose the password hash in the API response.
    const safeUser = { ...user, password: undefined };

    // If email was changed, return special response to trigger session update
    if (email && email !== session.user.email) {
      return NextResponse.json({
        ...safeUser,
        _sessionUpdate: {
          email: user.email,
          name: user.name,
        },
      });
    }

    return NextResponse.json(safeUser);
  } catch (error) {
    console.error("Error updating user:", error);
    return NextResponse.json(
      { error: "Failed to update user" },
      { status: 500 },
    );
  }
}

export async function DELETE() {
  const session = await getServerSession(authOptions);

  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    await prisma.user.delete({
      where: { email: session.user.email },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting user:", error);
    return NextResponse.json(
      { error: "Failed to delete user" },
      { status: 500 },
    );
  }
}
