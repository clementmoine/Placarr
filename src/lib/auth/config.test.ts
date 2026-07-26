import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  findFirst: vi.fn(),
  findUnique: vi.fn(),
  compare: vi.fn(),
}));

vi.mock("bcryptjs", () => ({ default: { compare: h.compare } }));
vi.mock("@/lib/db/prisma", () => ({
  prisma: { user: { findFirst: h.findFirst, findUnique: h.findUnique } },
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
 * both providers read as id "credentials", and the top-level `authorize` is
 * the library's stub that always returns null. The real one is in `options`.
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

const STORED_USER = {
  id: "u1",
  email: "a@b.c",
  name: "A",
  role: "user",
  password: "HASH",
};

/** The credentials provider is the whole login surface — nothing else guards it. */
describe("credentials provider", () => {
  const authorize = providerAuthorize("credentials");

  beforeEach(() => {
    resetRateLimitsForTests();
    h.findFirst.mockReset().mockResolvedValue(STORED_USER);
    h.compare.mockReset().mockResolvedValue(true);
  });

  it("refuses missing credentials without touching the database", async () => {
    expect(await authorize(undefined)).toBeNull();
    expect(await authorize({ email: "a@b.c", password: "" })).toBeNull();
    expect(h.findFirst).not.toHaveBeenCalled();
  });

  it("returns the user with its role on a correct password", async () => {
    const user = await authorize({ email: "a@b.c", password: "good" });

    expect(user).toEqual({
      id: "u1",
      email: "a@b.c",
      name: "A",
      role: "user",
    });
    // The hash must never travel with the session payload.
    expect(user).not.toHaveProperty("password");
  });

  it("refuses a wrong password", async () => {
    h.compare.mockResolvedValue(false);

    expect(await authorize({ email: "a@b.c", password: "bad" })).toBeNull();
  });

  it("refuses an unknown account", async () => {
    h.findFirst.mockResolvedValue(null);

    expect(await authorize({ email: "ghost@b.c", password: "x" })).toBeNull();
    expect(h.compare).not.toHaveBeenCalled();
  });

  it("refuses an account with no password (e.g. seeded without one)", async () => {
    h.findFirst.mockResolvedValue({ ...STORED_USER, password: null });

    expect(await authorize({ email: "a@b.c", password: "x" })).toBeNull();
  });

  it("looks the account up case-insensitively", async () => {
    // Registration lowercases; rows created before that kept their case, and
    // users type whatever they like. All three have to sign in.
    await authorize({ email: "  A@B.C  ", password: "good" });

    expect(h.findFirst).toHaveBeenCalledWith({
      where: { email: { equals: "a@b.c", mode: "insensitive" } },
    });
  });

  it("throttles an account after repeated attempts", async () => {
    h.compare.mockResolvedValue(false);

    for (let attempt = 0; attempt < 10; attempt += 1) {
      await authorize({ email: "a@b.c", password: "bad" });
    }
    h.findFirst.mockClear();

    // 11th attempt: refused before reaching the database at all.
    expect(await authorize({ email: "a@b.c", password: "good" })).toBeNull();
    expect(h.findFirst).not.toHaveBeenCalled();
  });

  it("throttling one account leaves the others able to sign in", async () => {
    h.compare.mockResolvedValue(false);
    for (let attempt = 0; attempt < 11; attempt += 1) {
      await authorize({ email: "victim@b.c", password: "bad" });
    }

    h.compare.mockResolvedValue(true);
    expect(await authorize({ email: "a@b.c", password: "good" })).toEqual(
      expect.objectContaining({ id: "u1" }),
    );
  });
});

describe("guest provider", () => {
  const authorize = providerAuthorize("guest");

  beforeEach(() => {
    resetRateLimitsForTests();
    h.findUnique.mockReset();
  });

  it("signs the guest in with the guest role", async () => {
    h.findUnique.mockResolvedValue({
      id: "g1",
      email: "guest@placarr.com",
      name: "Guest",
      role: "guest",
    });

    expect(await authorize({})).toEqual({
      id: "g1",
      email: "guest@placarr.com",
      name: "Guest",
      role: "guest",
    });
  });

  it("fails loudly when the guest account was never seeded", async () => {
    h.findUnique.mockResolvedValue(null);

    await expect(authorize({})).rejects.toThrow(/seed/i);
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
    // Authorization everywhere else reads `session.user.role`.
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
