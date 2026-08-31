/**
 * Node extract of Live `shadersbundle` → frags + shared textures (ADR-021 C).
 */

import {
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

import { writeLosslessRgbaWebp } from "@/lib/media/losslessWebp";
import { extractShaderFragsFromBytes } from "@/lib/unity/shader";
import {
  iterClassTrees,
  loadUnityFs,
  resolveAssetManager,
  resourceBlobsFromAssetManager,
  type UnityTypeTree,
} from "@/lib/unity/loadUnityFs";
import {
  decodeTextureTree,
  rgbaFromTexture2DObject,
} from "@/lib/unity/texture2d";

export type ExtractShadersBundleOpts = {
  shadersBundlePath: string;
  packDir: string;
  /** Skip `.frag` writes when another pass already dumped them. */
  skipFrags?: boolean;
  /** Skip shared ``foil/textures`` (faster when only validating frags). */
  skipSharedTextures?: boolean;
};

export type ExtractShadersBundleResult = {
  ok: boolean;
  shadersWritten: string[];
  foilNames: string[];
  fragStems: string[];
  sharedTextures: number;
  textureFlags: Record<string, { srgb: boolean }>;
};

function texturePath(directory: string, name: string): string {
  return path.join(directory, `${name}.webp`);
}

/** Bake RGB luma into alpha for CSS `mask-mode: alpha` (Northern Cross). */
async function bakeLumaToAlphaWebp(dest: string): Promise<void> {
  const { default: sharp } = await import("sharp");
  const { data, info } = await sharp(dest)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  const out = Buffer.allocUnsafe(width * height * 4);
  for (let i = 0, px = 0; px < width * height; px++, i += channels) {
    const r = data[i]!;
    const g = data[i + 1]!;
    const b = data[i + 2]!;
    const luma = 0.299 * r + 0.587 * g + 0.114 * b;
    const alpha = Math.max(0, Math.min(255, Math.round((luma - 8) * (255 / 120))));
    const o = px * 4;
    out[o] = r;
    out[o + 1] = g;
    out[o + 2] = b;
    out[o + 3] = alpha;
  }
  await writeLosslessRgbaWebp(out, width, height, dest);
}

function webpReady(dest: string): boolean {
  try {
    return existsSync(dest) && statSync(dest).size > 0;
  } catch {
    return false;
  }
}

export async function extractShadersBundle(
  opts: ExtractShadersBundleOpts,
): Promise<ExtractShadersBundleResult> {
  const shadersDir = path.join(opts.packDir, "shaders");
  const texDir = path.join(opts.packDir, "textures");
  mkdirSync(shadersDir, { recursive: true });
  mkdirSync(texDir, { recursive: true });

  const bytes = readFileSync(opts.shadersBundlePath);
  const written: string[] = [];
  const foilNames: string[] = [];

  if (!opts.skipFrags) {
    const extracted = extractShaderFragsFromBytes(bytes);
    for (const { foil, frag } of extracted) {
      foilNames.push(foil);
      const destName = `${foil}.frag`;
      writeFileSync(path.join(shadersDir, destName), frag, "utf8");
      written.push(destName);
    }
    console.log(`  shaders .frag → ${written.length}`);
  }

  const loaded = loadUnityFs(bytes);
  const textureFlags: Record<string, { srgb: boolean }> = {};
  let texN = 0;

  if (!opts.skipSharedTextures) {
    const trees: { name: string; tree: UnityTypeTree }[] = [];
    for (const tree of iterClassTrees(loaded, 28)) {
      const name =
        (typeof tree.m_Name === "string" && tree.m_Name) ||
        (typeof tree.name === "string" && tree.name) ||
        "";
      if (!name) continue;
      textureFlags[name] = { srgb: Number(tree.m_ColorSpace ?? 0) === 1 };
      trees.push({ name, tree });
    }
    const texTotal = trees.length;
    console.log(`  shared textures → décodage (${texTotal} Texture2D)`);

    // Resume: ne pas recharger AssetManager si les WebP sont déjà là —
    // le typetree sync bloque la boucle d’événements (heartbeat foil → abandon).
    const pending = trees.filter(({ name }) => !webpReady(texturePath(texDir, name)));
    const already = texTotal - pending.length;
    if (already > 0) {
      texN += already;
      console.log(`  shared textures → ${already}/${texTotal} déjà sur disque`);
    }
    if (pending.length === 0) {
      console.log(`  shared textures → rien à écrire`);
    } else {
      let am: Awaited<ReturnType<typeof resolveAssetManager>> | null = null;
      let objectBlobs: Map<string, Uint8Array> | null = null;
      const objectByName = new Map<string, unknown>();
      let seen = already;

      for (const { name, tree } of pending) {
        seen++;

        let rgba: Buffer | null = null;
        let width = 0;
        let height = 0;

        const fromTree = decodeTextureTree(tree, loaded);
        if (fromTree) {
          rgba = fromTree.rgba;
          width = fromTree.width;
          height = fromTree.height;
        } else {
          if (!am) {
            // typetree:false suffit (stream .resS) et reste <5s — typetree:true
            // peut bloquer le worker in-process assez longtemps pour tuer le lock.
            console.log(
              "  shared textures → AssetManager (sans typetree, une fois)",
            );
            am = await resolveAssetManager(bytes, { enableTypeTree: false });
            objectBlobs = resourceBlobsFromAssetManager(am);
            for (const info of am.getObjectInfosByClass("Texture2D")) {
              const texName = String(info.name || info.object?.name || "").trim();
              if (texName) objectByName.set(texName, info.object);
            }
          }
          const obj = objectByName.get(name);
          const decoded = obj
            ? await rgbaFromTexture2DObject(obj as never, name, {
                resourceBlobs: objectBlobs ?? undefined,
              })
            : null;
          if (decoded) {
            rgba = decoded.rgba;
            width = decoded.width;
            height = decoded.height;
          }
        }
        if (!rgba?.length || !width || !height) {
          if (seen % 25 === 0 || seen === texTotal) {
            console.log(
              `  shared textures ${seen}/${texTotal} écrites=${texN} (skip sans raster)`,
            );
          }
          continue;
        }

        const dest = texturePath(texDir, name);
        await writeLosslessRgbaWebp(rgba, width, height, dest);
        if (name === "FX_T_Northern_Cross") {
          await bakeLumaToAlphaWebp(dest);
        }
        texN++;
        if (texN % 25 === 0 || seen === texTotal) {
          console.log(`  shared textures ${seen}/${texTotal} écrites=${texN}`);
        }
      }
    }
  }

  const stems = [...new Set(written.map((n) => path.parse(n).name))].sort(
    (a, b) => b.length - a.length || a.localeCompare(b),
  );
  if (stems.length > 0) {
    writeFileSync(
      path.join(opts.packDir, "frag-stems.json"),
      `${JSON.stringify({ stems }, null, 2)}\n`,
      "utf8",
    );
  }

  return {
    ok: true,
    shadersWritten: [...new Set(written)].sort(),
    foilNames: [...new Set(foilNames)].sort(),
    fragStems: stems,
    sharedTextures: texN,
    textureFlags,
  };
}
