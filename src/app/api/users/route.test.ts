import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const h = vi.hoisted(() => ({
  getServerSession: vi.fn(),
  getToken: vi.fn(),
  findUnique: vi.fn(),
  update: vi.fn(),
  del: vi.fn(),
  hash: vi.fn(),
}));

vi.mock("next-auth", () => ({ getServerSession: h.getServerSession }));
vi.mock("next-auth/jwt", () => ({ getToken: h.getToken }));
vi.mock("@/lib/auth/config", () => ({ authOptions: {} }));
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    user: { findUnique: h.findUnique, update: h.update, delete: h.del },
  },
}));
vi.mock("bcryptjs", () => ({ default: { hash: h.hash } }));

import { PATCH, DELETE } from "./route";

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

    const res = await PATCH(patchReq({ name: "X" }));

    expect(res.status).toBe(401);
    expect(h.update).not.toHaveBeenCalled();
  });

  it("400 quand le nouvel email est déjà pris", async () => {
    h.getServerSession.mockResolvedValue({ user: { email: "a@b.c" } });
    h.getToken.mockResolvedValue({ sub: "u1" });
    h.findUnique.mockResolvedValue({ id: "other" });

    const res = await PATCH(patchReq({ email: "taken@b.c" }));

    expect(res.status).toBe(400);
    expect(h.update).not.toHaveBeenCalled();
  });

  it("ne renvoie JAMAIS le hash du mot de passe dans la réponse", async () => {
    h.getServerSession.mockResolvedValue({ user: { email: "a@b.c" } });
    h.getToken.mockResolvedValue({ sub: "u1" });
    h.update.mockResolvedValue({
      id: "u1",
      name: "A",
      email: "a@b.c",
      password: "SECRET_HASH",
    });

    const res = await PATCH(patchReq({ name: "A" }));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.password).toBeUndefined();
  });

  it("hash le mot de passe avant de le persister quand il est fourni", async () => {
    h.getServerSession.mockResolvedValue({ user: { email: "a@b.c" } });
    h.getToken.mockResolvedValue({ sub: "u1" });
    h.update.mockResolvedValue({
      id: "u1",
      email: "a@b.c",
      password: "HASHED",
    });

    await PATCH(patchReq({ password: "newpass" }));

    expect(h.hash).toHaveBeenCalledWith("newpass", 10);
    expect(h.update.mock.calls[0][0].data.password).toBe("HASHED");
  });
});

describe("DELETE /api/users", () => {
  it("401 sans session", async () => {
    h.getServerSession.mockResolvedValue(null);

    const res = await DELETE();

    expect(res.status).toBe(401);
    expect(h.del).not.toHaveBeenCalled();
  });

  it("supprime le compte de l'utilisateur courant", async () => {
    h.getServerSession.mockResolvedValue({ user: { email: "a@b.c" } });
    h.del.mockResolvedValue({});

    const res = await DELETE();

    expect(res.status).toBe(200);
    expect(h.del.mock.calls[0][0].where.email).toBe("a@b.c");
  });
});
