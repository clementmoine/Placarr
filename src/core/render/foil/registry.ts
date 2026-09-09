import type { EffectPackModule } from "./types";

const packs = new Map<string, EffectPackModule>();

export function registerEffectPack(pack: EffectPackModule): void {
  packs.set(pack.id, pack);
}

export function getEffectPack(
  id: string | null | undefined,
): EffectPackModule | null {
  if (!id) return null;
  return packs.get(id) ?? null;
}

export function listEffectPacks(): EffectPackModule[] {
  return [...packs.values()];
}

export function __resetEffectPacksForTests(): void {
  packs.clear();
}
