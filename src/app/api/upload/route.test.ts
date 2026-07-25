import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const h = vi.hoisted(() => ({
  requireGuestOrHigher: vi.fn(),
  mkdir: vi.fn(),
  writeFile: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ requireGuestOrHigher: h.requireGuestOrHigher }));
vi.mock("fs/promises", () => ({ mkdir: h.mkdir, writeFile: h.writeFile }));

import { POST } from "./route";

const USER = { user: { id: "u1", role: "user" } };

function uploadReq(file: File | null) {
  const fd = new FormData();
  if (file) fd.append("file", file);
  return new NextRequest("http://localhost/api/upload", {
    method: "POST",
    body: fd,
  });
}

beforeEach(() => {
  h.requireGuestOrHigher.mockReset().mockResolvedValue(USER);
  h.mkdir.mockReset().mockResolvedValue(undefined);
  h.writeFile.mockReset().mockResolvedValue(undefined);
});

/** PNG signature — enough for the content check to accept the buffer. */
const PNG_BYTES = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);

describe("POST /api/upload", () => {
  it("renvoie la réponse d'auth (401) quand non authentifié", async () => {
    h.requireGuestOrHigher.mockResolvedValue(
      NextResponse.json({ error: "x" }, { status: 401 }),
    );

    const res = await POST(
      uploadReq(new File(["x"], "a.png", { type: "image/png" })),
    );

    expect(res.status).toBe(401);
  });

  it("403 pour un invité", async () => {
    h.requireGuestOrHigher.mockResolvedValue({
      user: { id: "g", role: "guest" },
    });

    const res = await POST(
      uploadReq(new File(["x"], "a.png", { type: "image/png" })),
    );

    expect(res.status).toBe(403);
    expect(h.writeFile).not.toHaveBeenCalled();
  });

  it("400 quand aucun fichier n'est fourni", async () => {
    const res = await POST(uploadReq(null));
    expect(res.status).toBe(400);
  });

  it("400 quand le type MIME n'est pas autorisé", async () => {
    const res = await POST(
      uploadReq(new File(["x"], "a.pdf", { type: "application/pdf" })),
    );

    expect(res.status).toBe(400);
    expect(h.writeFile).not.toHaveBeenCalled();
  });

  it("400 quand le fichier dépasse 5MB", async () => {
    const big = new File([new Uint8Array(5 * 1024 * 1024 + 1)], "big.png", {
      type: "image/png",
    });

    const res = await POST(uploadReq(big));

    expect(res.status).toBe(400);
    expect(h.writeFile).not.toHaveBeenCalled();
  });

  it("400 quand les octets ne sont pas une image malgré un MIME d'image", async () => {
    // `file.type` vient du client : seul le contenu fait foi avant d'écrire
    // dans un dossier servi publiquement.
    const res = await POST(
      uploadReq(
        new File(["<script>alert(1)</script>"], "x.png", {
          type: "image/png",
        }),
      ),
    );

    expect(res.status).toBe(400);
    expect(h.writeFile).not.toHaveBeenCalled();
  });

  it("écrit un PNG valide; l'extension vient du MIME, le nom est aléatoire (pas le nom client)", async () => {
    const res = await POST(
      uploadReq(
        new File([PNG_BYTES], "../evil name.jpeg", { type: "image/png" }),
      ),
    );
    const json = await res.json();

    expect(res.status).toBe(200);
    // Nom = UUID, extension dérivée du MIME → pas de path traversal ni de
    // confusion d'extension via le nom client.
    expect(json.url).toMatch(/^\/uploads\/[a-f0-9-]+\.png$/);
    expect(h.writeFile).toHaveBeenCalledTimes(1);
  });
});
