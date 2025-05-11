import { UserRole } from "@prisma/client";
import { getServerSession } from "next-auth";
import { NextRequest, NextResponse } from "next/server";

import { authOptions } from "@/lib/auth.config";

export async function getAuthSession() {
  return await getServerSession(authOptions);
}

export async function requireAuth() {
  const session = await getAuthSession();

  if (!session) {
    return NextResponse.json(
      { error: "Authentication required" },
      { status: 401 },
    );
  }

  return session;
}

export async function requireAdmin() {
  const session = await getAuthSession();

  if (!session) {
    return NextResponse.json(
      { error: "Authentication required" },
      { status: 401 },
    );
  }

  if (session.user.role !== UserRole.admin) {
    return NextResponse.json(
      { error: "Admin access required" },
      { status: 403 },
    );
  }

  return session;
}

export async function requireGuestOrHigher(req: NextRequest) {
  const session = await getAuthSession();

  if (!session) {
    return NextResponse.json(
      { error: "Authentication required" },
      { status: 401 },
    );
  }

  if (session.user.role === UserRole.guest && req.method !== "GET") {
    return NextResponse.json(
      { error: "Write access not allowed for guests" },
      { status: 403 },
    );
  }

  return session;
}
