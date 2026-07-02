import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  getServerSession: vi.fn(),
  findUnique: vi.fn(),
}));

vi.mock("next-auth", () => ({ getServerSession: h.getServerSession }));
vi.mock("@/lib/auth/config", () => ({ authOptions: {} }));
vi.mock("@/lib/db/prisma", () => ({
  prisma: { user: { findUnique: h.findUnique } },
}));

import { GET } from "./route";

beforeEach(() => {
  h.getServerSession.mockReset();
  h.findUnique.mockReset();
});

describe("GET /api/users/me", () => {
  it("401 sans session", async () => {
    h.getServerSession.mockResolvedValue(null);

    const res = await GET();

    expect(res.status).toBe(401);
    expect(h.findUnique).not.toHaveBeenCalled();
  });

  it("404 si l'utilisateur n'existe pas", async () => {
    h.getServerSession.mockResolvedValue({ user: { email: "a@b.c" } });
    h.findUnique.mockResolvedValue(null);

    const res = await GET();

    expect(res.status).toBe(404);
  });

  it("renvoie le profil sans mot de passe (select de champs publics)", async () => {
    h.getServerSession.mockResolvedValue({ user: { email: "a@b.c" } });
    h.findUnique.mockResolvedValue({
      id: "u1",
      name: "A",
      email: "a@b.c",
      image: null,
      role: "user",
    });

    const res = await GET();
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.email).toBe("a@b.c");
    expect(json.password).toBeUndefined();
    // La requête sélectionne explicitement des champs publics, jamais password.
    expect(h.findUnique.mock.calls[0][0].select.password).toBeUndefined();
  });

  it("500 sur erreur DB", async () => {
    h.getServerSession.mockResolvedValue({ user: { email: "a@b.c" } });
    h.findUnique.mockRejectedValue(new Error("db down"));

    const res = await GET();

    expect(res.status).toBe(500);
  });
});
