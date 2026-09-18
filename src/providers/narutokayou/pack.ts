import path from "node:path";

export const NARUTO_KAYOU_PACK_ID = "naruto/kayou";
export const NARUTO_KAYOU_EFFECT_PACK_ID = "naruto-kayou";
export const NARUTO_KAYOU_PROVIDER_ID = "narutokayou";
/** Jeu distinct du Carddass / Mythos — collectible CN, pas un TCG jouable. */
export const NARUTO_KAYOU_PRINT_GAME = "kayou";

export function narutoKayouCuratedDir(): string {
  return path.join(
    process.cwd(),
    "src",
    "providers",
    NARUTO_KAYOU_PROVIDER_ID,
    "curated",
  );
}
