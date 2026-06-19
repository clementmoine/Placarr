import { beforeEach, describe, expect, it, vi } from "vitest";
import { UserRole } from "@prisma/client";

const h = vi.hoisted(() => ({
  findUnique: vi.fn(),
  create: vi.fn(),
  hash: vi.fn(),
}));

vi.mock("bcryptjs", () => ({ hash: h.hash }));
vi.mock("@/lib/prisma", () => ({
  prisma: { user: { findUnique: h.findUnique, create: h.create } },
}));

import { POST } from "./route";

function req(body: unknown) {
  return new Request("http://localhost/api/auth/register", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  h.findUnique.mockReset();
  h.create.mockReset();
  h.hash.mockReset().mockResolvedValue("HASHED_PW");
});

describe("POST /api/auth/register", () => {
  it("renvoie 400 quand un champ requis manque", async () => {
    const res = await POST(req({ email: "a@b.c", password: "pw" }));

    expect(res.status).toBe(400);
    expect(h.findUnique).not.toHaveBeenCalled();
    expect(h.create).not.toHaveBeenCalled();
  });

  it("renvoie 400 quand l'utilisateur existe déjà", async () => {
    h.findUnique.mockResolvedValue({ id: "u1" });

    const res = await POST(req({ name: "A", email: "a@b.c", password: "pw" }));
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.message).toMatch(/already exists/i);
    expect(h.create).not.toHaveBeenCalled();
  });

  it("crée l'utilisateur (201), hash le mdp, rôle user, et n'expose jamais le mdp", async () => {
    h.findUnique.mockResolvedValue(null);
    h.create.mockResolvedValue({
      id: "u1",
      name: "A",
      email: "a@b.c",
      role: "user",
    });

    const res = await POST(
      req({ name: "A", email: "a@b.c", password: "secret" }),
    );
    const json = await res.json();

    expect(res.status).toBe(201);
    expect(h.hash).toHaveBeenCalledWith("secret", 12);

    const createArg = h.create.mock.calls[0][0];
    expect(createArg.data.password).toBe("HASHED_PW");
    expect(createArg.data.role).toBe(UserRole.user);
    // Le `select` ne doit pas exposer le mot de passe.
    expect(createArg.select.password).toBeUndefined();
    expect(json.user.password).toBeUndefined();
  });

  it("renvoie 500 sur erreur inattendue", async () => {
    h.findUnique.mockRejectedValue(new Error("db down"));

    const res = await POST(req({ name: "A", email: "a@b.c", password: "pw" }));

    expect(res.status).toBe(500);
  });
});
