import { describe, expect, it } from "vitest";

import { dedupeByPerceptualHash } from "./imageAssets";
import type { AttachmentType } from "@/generated/prisma/browser";

describe("dedupeByPerceptualHash language roles", () => {
  const sameHash = "1010101010101010";

  it("keeps same-source covers that differ only by language role", () => {
    const kept = dedupeByPerceptualHash(
      [
        {
          type: "cover" as AttachmentType,
          url: "/uploads/fr.jpg",
          source: "lorcanajson",
          role: "fr",
        },
        {
          type: "cover" as AttachmentType,
          url: "/uploads/en.jpg",
          source: "lorcanajson",
          role: "en",
        },
        {
          type: "cover" as AttachmentType,
          url: "/uploads/de.jpg",
          source: "lorcanajson",
          role: "de",
        },
      ],
      () => sameHash,
      8,
      undefined,
      (item) => {
        const source = item.source ?? "merged";
        if (item.type === "foilMask") return source;
        const role = item.role?.trim().toLowerCase() ?? "";
        return role ? `${source}::${role}` : source;
      },
    );
    expect(kept.map((row) => row.role)).toEqual(["fr", "en", "de"]);
  });

  it("still collapses duplicate covers in the same language", () => {
    const kept = dedupeByPerceptualHash(
      [
        {
          type: "cover" as AttachmentType,
          url: "/uploads/fr-a.jpg",
          source: "lorcanajson",
          role: "fr",
        },
        {
          type: "cover" as AttachmentType,
          url: "/uploads/fr-b.jpg",
          source: "lorcanajson",
          role: "fr",
        },
      ],
      () => sameHash,
      8,
      undefined,
      (item) => {
        const source = item.source ?? "merged";
        const role = item.role?.trim().toLowerCase() ?? "";
        return role ? `${source}::${role}` : source;
      },
    );
    expect(kept).toHaveLength(1);
    expect(kept[0]?.url).toBe("/uploads/fr-a.jpg");
  });
});
