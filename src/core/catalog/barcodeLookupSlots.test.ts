import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { barcodeLookupSlotDefaults } from "@/core/catalog/barcodeLookupSlots";
import { PROVIDER_MODULES } from "@/core/catalog/registry";
import { createEmptyBarcodeLookupPayload } from "@/core/identify/lookup/payload";

/**
 * The type side of a lookup slot (a provider's `declare module` augmentation)
 * and its runtime default are declared in the same file but by different
 * mechanisms, so nothing forces them to agree. These tests are that force:
 * a slot whose default is missing shows up as `undefined` behind a type that
 * promises a value — which is exactly how the first attempt at this refactor
 * failed, as `listings is not iterable`.
 */
describe("barcode lookup slots", () => {
  it("gives every registered slot a defined empty value", () => {
    const payload = createEmptyBarcodeLookupPayload(
      barcodeLookupSlotDefaults(),
    );

    for (const [key, value] of Object.entries(payload)) {
      expect(value, `slot "${key}" has no default`).toBeDefined();
    }
  });

  it("includes every slot a provider module declares", () => {
    const payload = createEmptyBarcodeLookupPayload(
      barcodeLookupSlotDefaults(),
    ) as unknown as Record<string, unknown>;

    const declared = PROVIDER_MODULES.flatMap((providerModule) =>
      Object.keys(providerModule.barcodeLookupSlots ?? {}),
    );
    expect(declared.length).toBeGreaterThan(0);

    for (const key of declared) {
      expect(payload, `provider slot "${key}" missing`).toHaveProperty(key);
      expect(payload[key], `provider slot "${key}" is undefined`).toBeDefined();
    }
  });

  it("keeps array slots independent between payloads", () => {
    const first = createEmptyBarcodeLookupPayload(
      barcodeLookupSlotDefaults(),
    ) as unknown as Record<string, unknown>;
    const second = createEmptyBarcodeLookupPayload(
      barcodeLookupSlotDefaults(),
    ) as unknown as Record<string, unknown>;

    for (const [key, value] of Object.entries(first)) {
      if (Array.isArray(value)) {
        expect(value, `slot "${key}" is shared between payloads`).not.toBe(
          second[key],
        );
      }
    }
  });

  /**
   * The augmentation is erased at compile time, so no runtime check can see a
   * slot that was typed but never registered. Compare the two declarations in
   * the provider source instead: they are written next to each other, and this
   * is what makes "typed but absent at runtime" impossible to ship.
   */
  it("pairs every declared slot type with a registered default", () => {
    const providerRoot = join(process.cwd(), "src/providers");
    const mismatches: string[] = [];

    for (const entry of readdirSync(providerRoot, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      let source: string;
      try {
        source = readFileSync(
          join(providerRoot, entry.name, "index.ts"),
          "utf8",
        );
      } catch {
        continue;
      }

      const augmented = new Set(
        [
          ...source.matchAll(/interface BarcodeLookupSlots \{([^}]*)\}/g),
        ].flatMap((block) =>
          [...block[1]!.matchAll(/^\s*(\w+)\s*\??\s*:/gm)].map((m) => m[1]!),
        ),
      );
      const registered = new Set(
        [...source.matchAll(/barcodeLookupSlots:\s*\{([^}]*)\}/g)].flatMap(
          (block) => [...block[1]!.matchAll(/(\w+)\s*:/g)].map((m) => m[1]!),
        ),
      );

      for (const key of augmented) {
        if (!registered.has(key)) {
          mismatches.push(
            `${entry.name}: slot "${key}" typed but not registered`,
          );
        }
      }
      for (const key of registered) {
        if (!augmented.has(key)) {
          mismatches.push(
            `${entry.name}: slot "${key}" registered but not typed`,
          );
        }
      }
    }

    expect(mismatches).toEqual([]);
  });
});
