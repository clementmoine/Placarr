import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { Prisma } from "@prisma/client";
import bcrypt from "bcryptjs";
import { getToken } from "next-auth/jwt";

import { authOptions } from "@/lib/auth.config";
import { prisma } from "@/lib/prisma";

export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const token = await getToken({ req });

  if (!session?.user?.email || !token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const data = await req.json();
    const { name, image, password, email } = data;

    const updateData: Prisma.UserUpdateInput = { name, image };
    if (password) {
      updateData.password = await bcrypt.hash(password, 10);
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

    // If email was changed, return special response to trigger session update
    if (email && email !== session.user.email) {
      return NextResponse.json({
        ...user,
        _sessionUpdate: {
          email: user.email,
          name: user.name,
        },
      });
    }

    return NextResponse.json(user);
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
