import { hash } from "bcryptjs";
import { NextResponse } from "next/server";
import { UserRole } from "@/generated/prisma/browser";
import { prisma } from "@/lib/db/prisma";
import {
  MIN_PASSWORD_LENGTH,
  PASSWORD_HASH_ROUNDS,
} from "@/lib/auth/passwordPolicy";

function isTruthyEnv(value?: string | null): boolean {
  const raw = value?.trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes";
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const name = typeof body?.name === "string" ? body.name.trim() : "";
    // Stored lowercase: `A@b.com` and `a@b.com` are the same account, and the
    // uniqueness check is only meaningful on a normalized value.
    const email =
      typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
    const password = typeof body?.password === "string" ? body.password : "";

    // Validate input
    if (!name || !email || !password) {
      return NextResponse.json(
        { message: "Missing required fields" },
        { status: 400 },
      );
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ message: "Invalid email" }, { status: 400 });
    }

    if (password.length < MIN_PASSWORD_LENGTH) {
      return NextResponse.json(
        {
          message: `Password must be at least ${MIN_PASSWORD_LENGTH} characters`,
        },
        { status: 400 },
      );
    }

    // Self-hosted instances are often reachable from the internet, where open
    // registration means strangers can create accounts and spend the owner's
    // scraping budget. Registration stays open only until the first account
    // exists (bootstrap), unless ALLOW_REGISTRATION says otherwise.
    const userCount = await prisma.user.count();
    const isBootstrap = userCount === 0;
    if (!isBootstrap && !isTruthyEnv(process.env.ALLOW_REGISTRATION)) {
      return NextResponse.json(
        { message: "Registration is closed" },
        { status: 403 },
      );
    }

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      return NextResponse.json(
        { message: "User already exists" },
        { status: 400 },
      );
    }

    // Hash password
    const hashedPassword = await hash(password, PASSWORD_HASH_ROUNDS);

    // Create user
    const user = await prisma.user.create({
      data: {
        name,
        email,
        password: hashedPassword,
        // The very first account owns the instance: a Docker install with
        // ENABLE_SEED=0 would otherwise have no way to obtain an admin, since
        // every registration below is a plain `user`.
        role: isBootstrap ? UserRole.admin : UserRole.user,
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return NextResponse.json(
      { message: "User created successfully", user },
      { status: 201 },
    );
  } catch (error) {
    console.error("Registration error:", error);
    return NextResponse.json(
      { message: "Something went wrong" },
      { status: 500 },
    );
  }
}
