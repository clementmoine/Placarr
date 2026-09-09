import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const h = vi.hoisted(() => ({
  getServerSession: vi.fn(),
  getToken: vi.fn(),
  update: vi.fn(),
  hash: vi.fn(),
}));

vi.mock("next-auth", () => ({ getServerSession: h.getServerSession }));
vi.mock("next-auth/jwt", () => ({ getToken: h.getToken }));
vi.mock("@/lib/auth/config", () => ({ authOptions: {} }));
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    user: { update: h.update },
  },
}));
vi.mock("bcryptjs", () => ({ default: { hash: h.hash } }));

import { PATCH } from "./route";
import { PASSWORD_HASH_ROUNDS } from "@/lib/auth/passwordPolicy";

function patchReq(body: unknown) {
  return new NextRequest("http://localhost/api/users", {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  for (const fn of Object.values(h)) fn.mockReset();
  h.hash.mockResolvedValue("HASHED");
});

describe("PATCH /api/users", () => {
  it("401 sans session ou token", async () => {
    h.getServerSession.mockResolvedValue(null);
    h.getToken.mockResolvedValue(null);

    const res = await PATCH(patchReq({ password: "correct-horse-battery" }));

    expect(res.status).toBe(401);
    expect(h.update).not.toHaveBeenCalled();
  });

  it("hash le mot de passe avant de le persister", async () => {
    h.getServerSession.mockResolvedValue({
      user: { email: "a@b.c", role: "admin" },
    });
    h.getToken.mockResolvedValue({ sub: "u1" });
    h.update.mockResolvedValue({
      id: "u1",
      email: "a@b.c",
      role: "admin",
    });

    await PATCH(patchReq({ password: "correct-horse-battery" }));

    expect(h.hash).toHaveBeenCalledWith(
      "correct-horse-battery",
      PASSWORD_HASH_ROUNDS,
    );
    expect(h.update.mock.calls[0][0].data.password).toBe("HASHED");
  });

  it("refuse un mot de passe trop court", async () => {
    h.getServerSession.mockResolvedValue({
      user: { email: "a@b.c", role: "admin" },
    });
    h.getToken.mockResolvedValue({ sub: "u1" });

    const res = await PATCH(patchReq({ password: "court" }));

    expect(res.status).toBe(400);
    expect(h.update).not.toHaveBeenCalled();
  });

  it("refuse name/email/image — seul le mot de passe est accepté", async () => {
    h.getServerSession.mockResolvedValue({
      user: { email: "a@b.c", role: "admin" },
    });
    h.getToken.mockResolvedValue({ sub: "u1" });

    const res = await PATCH(patchReq({ name: "Pirate", email: "x@y.z" }));

    expect(res.status).toBe(400);
    expect(h.update).not.toHaveBeenCalled();
  });

  it("403 pour un rôle guest", async () => {
    h.getServerSession.mockResolvedValue({
      user: { email: "guest@b.c", role: "guest" },
    });
    h.getToken.mockResolvedValue({ sub: "g1" });

    const res = await PATCH(patchReq({ password: "correct-horse-battery" }));

    expect(res.status).toBe(403);
    expect(h.update).not.toHaveBeenCalled();
  });
});
