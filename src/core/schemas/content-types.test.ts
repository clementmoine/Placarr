import { describe, expect, it } from "vitest";

import { Type, Condition } from "@/generated/prisma/browser";
import type { MediaType } from "@/types/providerRegistry";

import {
  CONTENT_DOMAINS,
  CONTENT_TYPE_PROFILES,
  CONTENT_TYPES,
  ITEM_CONDITIONS,
  coreItemIdentitySchema,
  domainForContentType,
  isContentType,
  parseCoreItemIdentity,
  type ContentType,
} from "./content-types";

describe("content-types", () => {
  it("stays aligned with Prisma Type and MediaType", () => {
    const prismaTypes = Object.values(Type).sort();
    const content = [...CONTENT_TYPES].sort();
    expect(content).toEqual(prismaTypes);

    // MediaType is a union — every content type must be assignable.
    for (const type of CONTENT_TYPES) {
      const asMedia: MediaType = type;
      expect(asMedia).toBe(type);
    }
  });

  it("stays aligned with Prisma Condition", () => {
    expect([...ITEM_CONDITIONS].sort()).toEqual(
      Object.values(Condition).sort(),
    );
  });

  it("covers every content type exactly once across domains", () => {
    const seen = new Set<ContentType>();
    for (const types of Object.values(CONTENT_DOMAINS)) {
      for (const type of types) {
        expect(seen.has(type)).toBe(false);
        seen.add(type);
      }
    }
    expect([...seen].sort()).toEqual([...CONTENT_TYPES].sort());
  });

  it("profiles match domainForContentType", () => {
    for (const type of CONTENT_TYPES) {
      expect(CONTENT_TYPE_PROFILES[type].domain).toBe(
        domainForContentType(type),
      );
      expect(CONTENT_TYPE_PROFILES[type].identity.length).toBeGreaterThan(0);
    }
  });

  it("isContentType guards unknown strings", () => {
    expect(isContentType("games")).toBe(true);
    expect(isContentType("nope")).toBe(false);
  });

  it("parses a core item identity and normalizes language", () => {
    const ok = parseCoreItemIdentity({
      name: "Snivy",
      printKey: "pokemon:2011bw-1",
      language: "FR",
      variant: "holo",
      condition: "new",
    });
    expect(ok.language).toBe("fr");
    expect(ok.printKey).toBe("pokemon:2011bw-1");
    expect(
      coreItemIdentitySchema.safeParse({
        name: "Snivy",
        condition: "near",
      }).success,
    ).toBe(false);
  });

  it("rejects empty names", () => {
    expect(
      coreItemIdentitySchema.safeParse({
        name: "  ",
        condition: "used",
      }).success,
    ).toBe(false);
  });
});
