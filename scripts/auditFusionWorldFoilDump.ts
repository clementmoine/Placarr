/**
 * Prove shared + per-card foil plates from the installed client are on disk.
 * Usage: tsx scripts/auditFusionWorldFoilDump.ts
 * Does not modify the game.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

import { packCardDir } from "@/lib/packPaths";
import { resolveAssetManager } from "@/lib/unity/loadUnityFs";
import {
  clientFoilWebpName,
  DBS_FW_FOIL_TEXTURE_TARGETS,
  isSharedFoilPlateName,
} from "@/providers/dragonball/dbsfw/extract/foilTextures";
import {
  DBS_FW_FACE_LANGS,
  DBS_FW_PACK_ID,
} from "@/providers/dragonball/dbsfw/indexStore";
import {
  fusionWorldCardBundle,
  fusionWorldMaskTexture,
} from "@/providers/dragonball/dbsfw/masks";

async function main(): Promise<void> {
  const bundlesDir = join(
    homedir(),
    "Library/Application Support/DBSCG FW/Games/DRAGON BALL SUPER CARD GAME FUSION WORLD/default/game/DBSCGFW.app/Contents/Resources/Data/StreamingAssets/aa/StandaloneOSX",
  );
  const texDir = join(process.cwd(), "data/dragonball/fw/foil/textures");
  const onDiskShared = new Set(readdirSync(texDir));

  const seedWebp = new Map(
    DBS_FW_FOIL_TEXTURE_TARGETS.map((t) => [t.unityName, t.webp]),
  );

  const sharedBundles = {
    shader: "packdata_assets_shader.bundle",
    materials: "packdata_assets_card_materials.bundle",
    premiumtex: "packdata_assets_card_premiumtex.bundle",
  } as const;

  const sharedMissing: string[] = [];
  const sharedPresent: string[] = [];
  const inventory: Record<string, string[]> = {};

  for (const [key, file] of Object.entries(sharedBundles)) {
    const am = await resolveAssetManager(readFileSync(join(bundlesDir, file)), {
      enableTypeTree: false,
    });
    const names: string[] = [];
    for (const info of am.getObjectInfosByClass("Texture2D")) {
      const name = String(info.name ?? "");
      if (key !== "premiumtex" && !isSharedFoilPlateName(name)) continue;
      names.push(name);
      const candidates = [
        seedWebp.get(name),
        clientFoilWebpName(name),
      ].filter(Boolean) as string[];
      if (candidates.some((c) => onDiskShared.has(c))) {
        sharedPresent.push(`${key}:${name}`);
      } else {
        sharedMissing.push(`${key}:${name} → ${candidates.join("|")}`);
      }
    }
    inventory[key] = names.sort((a, b) => a.localeCompare(b));
  }

  const series = readdirSync(bundlesDir).filter((n) =>
    n.startsWith("packdata_assets_card_series_"),
  );
  let perCardClient = 0;
  let perCardMissing = 0;
  const missingSample: string[] = [];
  const classCounts: Record<string, number> = {};

  for (const file of series) {
    const card = fusionWorldCardBundle(file);
    if (!card) continue;
    let am;
    try {
      am = await resolveAssetManager(readFileSync(join(bundlesDir, file)), {
        enableTypeTree: false,
      });
    } catch {
      continue;
    }
    for (const info of am.getObjectInfosByClass("Texture2D")) {
      const name = String(info.name ?? "");
      const mask = fusionWorldMaskTexture(name);
      if (!mask) continue;
      perCardClient += 1;
      classCounts[mask.file] = (classCounts[mask.file] ?? 0) + 1;
      const langs = mask.langs.filter((lang) =>
        (DBS_FW_FACE_LANGS as readonly string[]).includes(lang),
      );
      const ok = langs.some((lang) =>
        existsSync(
          join(
            packCardDir(DBS_FW_PACK_ID, {
              set: card.set,
              lang,
              card: card.folder,
            }),
            mask.file,
          ),
        ),
      );
      if (!ok) {
        perCardMissing += 1;
        if (missingSample.length < 30) {
          missingSample.push(`${file} :: ${name} → ${mask.file}`);
        }
      }
    }
  }

  const diskMasks: Record<string, number> = {};
  const walk = (p: string) => {
    for (const ent of readdirSync(p, { withFileTypes: true })) {
      const full = join(p, ent.name);
      if (ent.isDirectory()) walk(full);
      else if (ent.name.startsWith("mask") && ent.name.endsWith(".webp")) {
        diskMasks[ent.name] = (diskMasks[ent.name] ?? 0) + 1;
      }
    }
  };
  walk(join(process.cwd(), "data/dragonball/fw/cards"));

  console.log(
    JSON.stringify(
      {
        shared: {
          inventoryCounts: Object.fromEntries(
            Object.entries(inventory).map(([k, v]) => [k, v.length]),
          ),
          inventory,
          present: sharedPresent.length,
          missing: sharedMissing,
          webpOnDisk: [...onDiskShared].filter((n) => n.endsWith(".webp"))
            .length,
          dxtOnDisk: [...onDiskShared].filter((n) => /\.dxt[15]$/.test(n))
            .length,
        },
        perCard: {
          clientMaskTextures: perCardClient,
          missingCount: perCardMissing,
          missingSample,
          classCounts,
          diskMasks,
        },
        ok: sharedMissing.length === 0 && perCardMissing === 0,
      },
      null,
      2,
    ),
  );
}

void main();
