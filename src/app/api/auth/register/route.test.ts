import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { UserRole } from "@/generated/prisma/browser";

const h = vi.hoisted(() => ({
  findUnique: vi.fn(),
  create: vi.fn(),
  count: vi.fn(),
  hash: vi.fn(),
}));

vi.mock("bcryptjs", () => ({ hash: h.hash }));
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    user: { findUnique: h.findUnique, create: h.create, count: h.count },
  },
}));

import { POST, GET } from "./route";
import { resetRateLimitsForTests } from "@/lib/http/rateLimit";

const VALID_PASSWORD = "correct-horse-battery";

function req(body: unknown) {
  return new Request("http://localhost/api/auth/register", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  // Le limiteur est un compteur de process : sans ça les cas suivants
  // héritent des hits des précédents.
  resetRateLimitsForTests();
  h.findUnique.mockReset().mockResolvedValue(null);
  h.create.mockReset().mockResolvedValue({
    id: "u1",
    name: "A",
    email: "a@b.c",
    role: "user",
  });
  // Default: an instance that already has accounts.
  h.count.mockReset().mockResolvedValue(1);
  h.hash.mockReset().mockResolvedValue("HASHED_PW");
  process.env.ALLOW_REGISTRATION = "1";
});

afterEach(() => {
  delete process.env.ALLOW_REGISTRATION;
});

describe("POST /api/auth/register", () => {
  it("renvoie 400 quand un champ requis manque", async () => {
    const res = await POST(req({ email: "a@b.c", password: VALID_PASSWORD }));

    expect(res.status).toBe(400);
    expect(h.findUnique).not.toHaveBeenCalled();
    expect(h.create).not.toHaveBeenCalled();
  });

  it("refuse une adresse qui n'est pas un email", async () => {
    const res = await POST(
      req({ name: "A", email: "pas-un-email", password: VALID_PASSWORD }),
    );

    expect(res.status).toBe(400);
    expect(h.create).not.toHaveBeenCalled();
  });

  it("refuse un mot de passe trop court", async () => {
    const res = await POST(req({ name: "A", email: "a@b.c", password: "pw" }));

    expect(res.status).toBe(400);
    expect(h.create).not.toHaveBeenCalled();
  });

  it("renvoie 400 quand l'utilisateur existe déjà", async () => {
    h.findUnique.mockResolvedValue({ id: "u1" });

    const res = await POST(
      req({ name: "A", email: "a@b.c", password: VALID_PASSWORD }),
    );
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.message).toMatch(/already exists/i);
    expect(h.create).not.toHaveBeenCalled();
  });

  it("crée l'utilisateur (201), hash le mdp, rôle user, et n'expose jamais le mdp", async () => {
    const res = await POST(
      req({ name: "A", email: "a@b.c", password: VALID_PASSWORD }),
    );
    const json = await res.json();

    expect(res.status).toBe(201);
    expect(h.hash).toHaveBeenCalledWith(VALID_PASSWORD, 12);

    const createArg = h.create.mock.calls[0][0];
    expect(createArg.data.password).toBe("HASHED_PW");
    expect(createArg.data.role).toBe(UserRole.user);
    // Le `select` ne doit pas exposer le mot de passe.
    expect(createArg.select.password).toBeUndefined();
    expect(json.user.password).toBeUndefined();
  });

  it("normalise l'email en minuscules", async () => {
    await POST(
      req({ name: "A", email: "  MiXeD@Case.COM ", password: VALID_PASSWORD }),
    );

    expect(h.findUnique).toHaveBeenCalledWith({
      where: { email: "mixed@case.com" },
    });
    expect(h.create.mock.calls[0][0].data.email).toBe("mixed@case.com");
  });

  it("ferme l'inscription quand des comptes existent déjà", async () => {
    delete process.env.ALLOW_REGISTRATION;

    const res = await POST(
      req({ name: "A", email: "a@b.c", password: VALID_PASSWORD }),
    );

    expect(res.status).toBe(403);
    expect(h.create).not.toHaveBeenCalled();
  });

  it("laisse passer le tout premier compte et le fait admin", async () => {
    delete process.env.ALLOW_REGISTRATION;
    h.count.mockResolvedValue(0);

    const res = await POST(
      req({ name: "A", email: "a@b.c", password: VALID_PASSWORD }),
    );

    expect(res.status).toBe(201);
    expect(h.create.mock.calls[0][0].data.role).toBe(UserRole.admin);
  });

  it("renvoie 500 sur erreur inattendue", async () => {
    h.findUnique.mockRejectedValue(new Error("db down"));

    const res = await POST(
      req({ name: "A", email: "a@b.c", password: VALID_PASSWORD }),
    );

    expect(res.status).toBe(500);
  });
});

describe("GET /api/auth/register", () => {
  it("signale open=false quand des comptes existent déjà", async () => {
    delete process.env.ALLOW_REGISTRATION;
    h.count.mockResolvedValue(2);

    const res = await GET();
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toEqual({ open: false, bootstrap: false });
  });

  it("signale open=true en bootstrap", async () => {
    delete process.env.ALLOW_REGISTRATION;
    h.count.mockResolvedValue(0);

    const res = await GET();
    const json = await res.json();

    expect(json).toEqual({ open: true, bootstrap: true });
  });
});

describe("POST /api/auth/register — throttling", () => {
  beforeEach(() => {
    resetRateLimitsForTests();
    h.count.mockResolvedValue(1);
    process.env.ALLOW_REGISTRATION = "1";
  });

  it("renvoie 429 après 5 tentatives depuis la même adresse", async () => {
    const from = (email: string) =>
      new Request("http://localhost/api/auth/register", {
        method: "POST",
        headers: { "x-forwarded-for": "203.0.113.5" },
        body: JSON.stringify({ name: "A", email, password: VALID_PASSWORD }),
      });

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const ok = await POST(from(`a${attempt}@b.c`));
      expect(ok.status, `tentative ${attempt + 1}`).toBe(201);
    }

    const blocked = await POST(from("a5@b.c"));
    expect(blocked.status).toBe(429);
    expect(Number(blocked.headers.get("Retry-After"))).toBeGreaterThan(0);
  });

  it("compte séparément une autre adresse", async () => {
    const post = (ip: string) =>
      POST(
        new Request("http://localhost/api/auth/register", {
          method: "POST",
          headers: { "x-forwarded-for": ip },
          body: JSON.stringify({
            name: "A",
            email: "a@b.c",
            password: VALID_PASSWORD,
          }),
        }),
      );

    for (let attempt = 0; attempt < 6; attempt += 1) await post("203.0.113.6");
    expect((await post("203.0.113.6")).status).toBe(429);
    expect((await post("203.0.113.7")).status).toBe(201);
  });
});
