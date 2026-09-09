import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  findFirst: vi.fn(),
  compare: vi.fn(),
}));

vi.mock("bcryptjs", () => ({ default: { compare: h.compare } }));
vi.mock("@/lib/db/prisma", () => ({
  prisma: { user: { findFirst: h.findFirst } },
}));

process.env.NEXTAUTH_SECRET ||= "test-secret";

import { authOptions } from "./config";
import { resetRateLimitsForTests } from "@/lib/http/rateLimit";

type AuthorizeFn = (
  credentials: Record<string, string> | undefined,
  req?: { headers?: Record<string, string> },
) => Promise<unknown>;

/**
 * `CredentialsProvider()` keeps everything the caller passed under `options`
 * and leaves the top level at its defaults until NextAuth merges them — so
 * the top-level `authorize` is the library's stub that always returns null.
 * The real one is in `options`.
 */
function providerAuthorize(id: string): AuthorizeFn {
  const provider = authOptions.providers.find((candidate) => {
    const entry = candidate as { id?: string; options?: { id?: string } };
    return (entry.options?.id ?? entry.id) === id;
  });
  if (!provider) throw new Error(`provider ${id} not registered`);

  const options = (provider as { options?: { authorize?: AuthorizeFn } })
    .options;
  const authorize = options?.authorize;
  if (!authorize) throw new Error(`provider ${id} has no authorize`);
  return authorize;
}

const OWNER = {
  id: "admin-1",
  email: "admin@placarr.com",
  name: "Admin",
  role: "admin",
  password: "HASH",
};

describe("app-password provider", () => {
  const authorize = providerAuthorize("app-password");

  beforeEach(() => {
    resetRateLimitsForTests();
    h.findFirst.mockReset().mockResolvedValue(OWNER);
    h.compare.mockReset().mockResolvedValue(true);
  });

  it("refuses a missing password without touching the database", async () => {
    expect(await authorize(undefined)).toBeNull();
    expect(await authorize({ password: "" })).toBeNull();
    expect(h.findFirst).not.toHaveBeenCalled();
  });

  it("unlocks the earliest admin on a correct password", async () => {
    const user = await authorize({ password: "good" });

    expect(user).toEqual({
      id: "admin-1",
      email: "admin@placarr.com",
      name: "Admin",
      role: "admin",
    });
    expect(user).not.toHaveProperty("password");
    expect(h.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { role: "admin" },
      }),
    );
  });

  it("refuses a wrong password", async () => {
    h.compare.mockResolvedValue(false);
    expect(await authorize({ password: "bad" })).toBeNull();
  });

  it("refuses when no owner exists", async () => {
    h.findFirst.mockResolvedValue(null);
    expect(await authorize({ password: "good" })).toBeNull();
    expect(h.compare).not.toHaveBeenCalled();
  });

  it("throttles by address after repeated attempts", async () => {
    h.compare.mockResolvedValue(false);
    const req = { headers: { "x-forwarded-for": "203.0.113.9" } };

    for (let attempt = 0; attempt < 20; attempt += 1) {
      await authorize({ password: "bad" }, req);
    }
    h.findFirst.mockClear();

    expect(await authorize({ password: "good" }, req)).toBeNull();
    expect(h.findFirst).not.toHaveBeenCalled();
  });
});

describe("session callbacks", () => {
  it("carries the role from the user into the token, then the session", async () => {
    const jwt = authOptions.callbacks!.jwt!;
    const session = authOptions.callbacks!.session!;

    const token = await jwt({
      token: {},
      user: { id: "u1", role: "admin", email: "a@b.c", name: "A" },
    } as never);
    expect(token).toMatchObject({ id: "u1", role: "admin" });

    const result = await session({
      session: { user: {} },
      token,
    } as never);
    expect((result as { user: { role: string } }).user.role).toBe("admin");
  });

  it("does not invent a role when the token has none", async () => {
    const session = authOptions.callbacks!.session!;

    const result = await session({
      session: { user: {} },
      token: { email: "a@b.c" },
    } as never);

    expect((result as { user: { role?: string } }).user.role).toBeUndefined();
  });
});
