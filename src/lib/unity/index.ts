export {
  loadUnityFs,
  iterMonoBehaviourTrees,
  iterClassTrees,
  resolveResourceBlob,
  resourceBlobsFromAssetManager,
  resolveBlobFromMap,
  type LoadedUnityFs,
  type UnityTypeTree,
} from "@/lib/unity/loadUnityFs";
export {
  parseAssetManifestEntries,
  assetEntriesFromTypeTrees,
  type UnityAssetManifestEntry,
} from "@/lib/unity/assetManifest";
export {
  parseMaterialManifests,
  materialManifestsFromTypeTrees,
  type MaterialManifestRow,
} from "@/lib/unity/materialManifest";
export {
  decodeTexturesFromUnityFs,
  decodeTextureTree,
  rawS3tcMip0FromTree,
  listTexture2D,
  decodeTextureFormat,
  canDecodeTextureFormat,
  rgbaFromTexture2DObject,
  pixelsFromTextureObject,
  textureFormatId,
  astcBlockSize,
  webglAstcFormat,
  webglS3tcFormat,
  dxtMipByteSize,
  type DecodedTexture2D,
  type RawS3tcMip0,
} from "@/lib/unity/texture2d";
export {
  cropCardRgba,
  cropRgbaRect,
  loadUvRectFromJson,
  type UvRect,
  type PixelRect,
  type CroppedRgba,
} from "@/core/render/unity/cardCrop";
export {
  CARD_MESH_NAME,
  cardQuadFromObjText,
  cardQuadFromApk,
  unityStFromQuad,
  type CardQuadPayload,
} from "@/lib/unity/cardQuad";
export {
  extractApkUnityData,
  listApkSerializedHeads,
  loadSerializedAssets,
  readSerializedHeadBytes,
} from "@/lib/unity/apkAssets";
export {
  SHADER_CLASS_ID,
  decompressPlatformBlobs,
  glslPrograms,
  toWebgl2Fragment,
  extractShaderFragFromTree,
  extractShaderFragsFromLoaded,
  extractShaderFragsFromBytes,
  shaderNameFromPath,
  type ShaderTypeTree,
  type ExtractedShaderFrag,
  type ShaderFragExtractOptions,
  type ShaderFragNameInput,
} from "@/lib/unity/shader";
export {
  metalSourcesFromBlob,
  type MetalProgramSource,
} from "@/lib/unity/metalBlob";
export {
  preferredMetalFragment,
  translateMetalSource,
  translatePreferredFragment,
  type TranslatedMetal,
} from "@/lib/unity/metalToGlsl";
export {
  frostCardFragmentForKeywords,
  frostEffectsLayerCountKeyword,
  frostEffectsLayerMax,
} from "@/lib/unity/frostCardVariants";
export {
  extractFrostCardVariantFiles,
  type FrostCardVariantFile,
} from "@/lib/unity/frostCardExtract";
