/**
 * Subpath imports used by Node Unity extract — package ships JS without types.
 */
declare module "unityfs-js/unityfs/unityFile.js" {
  export class UnityFS {
    constructor(
      data: Uint8Array,
      opts?: { enableTypeTree?: boolean },
    );
    parse(): void;
    readonly assetManager: unknown;
  }
}

declare module "unityfs-js/decoders/drivers/lz4.js" {
  export function decompressBlock(
    src: Uint8Array,
    dst: Uint8Array,
    ...rest: number[]
  ): number;
}
