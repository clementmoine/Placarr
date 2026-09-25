import bcrypt from "bcryptjs";
import { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { UserRole } from "@/generated/prisma/browser";

import { prisma } from "@/lib/db/prisma";
import { clientIpFrom, consumeRateLimit } from "@/lib/http/rateLimit";

if (!process.env.NEXTAUTH_SECRET) {
  throw new Error("Please provide NEXTAUTH_SECRET environment variable");
}

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      id: "app-password",
      name: "App password",
      credentials: {
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials, req) {
        if (!credentials?.password) {
          return null;
        }

        // Mono-instance unlock: one password for the owner account. Throttle
        // by address — there is no email to rotate against.
        const perAddress = consumeRateLimit(
          `login:ip:${clientIpFrom(new Headers(req?.headers ?? {}))}`,
          { limit: 20, windowMs: 15 * 60 * 1000 },
        );
        if (!perAddress.allowed) {
          console.warn("[Auth] Throttled app-password unlock attempt");
          return null;
        }

        const owner = await prisma.user.findFirst({
          where: { role: UserRole.admin },
          orderBy: { createdAt: "asc" },
        });

        if (!owner?.password) {
          return null;
        }

        const isCorrectPassword = await bcrypt.compare(
          credentials.password,
          owner.password,
        );

        if (!isCorrectPassword) {
          return null;
        }

        return {
          id: owner.id,
          email: owner.email,
          name: owner.name,
          role: owner.role,
        };
      },
    }),
  ],
  session: {
    strategy: "jwt",
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },
  secret: process.env.NEXTAUTH_SECRET,
  pages: {
    signIn: "/auth/login",
    error: "/auth/error",
  },
  callbacks: {
    async jwt({ token, user, trigger, session }) {
      if (user) {
        token.role = user.role;
        token.id = user.id;
      }
      if (trigger === "update" && session) {
        token.name = session.user.name;
        token.email = session.user.email;
      }
      return token;
    },
    async session({ session, token }) {
      if (session?.user) {
        session.user.id = token.id as string;
        session.user.role = token.role as string;
        session.user.email = token.email as string;
      }
      return session;
    },
  },
};
