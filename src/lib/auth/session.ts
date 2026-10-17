import { UserRole } from "@/generated/prisma/browser";
import { getServerSession } from "next-auth";
import type { Session } from "next-auth";
import { NextRequest, NextResponse } from "next/server";

import { authOptions } from "@/lib/auth/config";

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

/** Public read — returns the session when unlocked, otherwise null. */
export async function requireReadAccess(
  _req?: NextRequest,
): Promise<Session | null> {
  return getAuthSession();
}

/** Write access — unlocked owner (app password) only. */
export async function requireOwner(_req?: NextRequest) {
  const session = await getAuthSession();

  if (!session?.user?.id) {
    return NextResponse.json(
      { error: "Authentication required" },
      { status: 401 },
    );
  }

  if (
    session.user.role === UserRole.guest ||
    session.user.role === "guest"
  ) {
    return NextResponse.json(
      { error: "Write access not allowed" },
      { status: 403 },
    );
  }

  return session;
}

/**
 * @deprecated Prefer requireReadAccess / requireOwner.
 * GET → session or null-as-guest stand-in for legacy call sites;
 * other methods → requireOwner.
 */
export async function requireGuestOrHigher(req: NextRequest) {
  if (req.method === "GET" || req.method === "HEAD") {
    const session = await requireReadAccess(req);
    if (session) return session;
    return {
      user: {
        id: "",
        role: UserRole.guest,
        email: null,
        name: null,
        image: null,
      },
      expires: "",
    } as Session;
  }
  return requireOwner(req);
}
