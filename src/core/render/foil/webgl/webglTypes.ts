import type { FoilS3tcBinding } from "@/core/render/foil/types";

export type WebglFoilSurfaces = {
  artUrl: string;
  foilMaskUrl?: string | null;
  varnishMaskUrl?: string | null;
  secondVarnishMaskUrl?: string | null;
  /** Illustration, chrome and text stacked with the face. */
  frontUrl?: string | null;
  frameUrl?: string | null;
  inkUrl?: string | null;
  /** Cost disc — composited onto frame at load (Frost order). */
  costRingUrl?: string | null;
  /** CostNumber gem — composited onto ink at load (Frost order). */
  badgeUrl?: string | null;
  holoMaskUrl?: string | null;
  /**
   * Catalogue Front DXT sidecar (`file` may be an absolute `/assets/…` URL).
   * Uploaded when S3TC is available; otherwise `frontUrl` WebP is used.
   */
  frontS3tc?: FoilS3tcBinding | null;
  hotFoilColor?: readonly [number, number, number, number] | null;
  secondHotFoilColor?: readonly [number, number, number, number] | null;
};

export type WebglFoilScrollMode = "time" | "tilt";

export type WebglFoilRenderer = {
  ready: Promise<void>;
  setTilt(x: number, y: number): void;
  /**
   * The same lean as {@link setTilt}, in degrees about the card's X and Y axes.
   *
   * Lorcana's fragments scroll a phase and want the normalised amount; Pocket's
   * dumped fragments take a real Euler rotation (`_Rotation`, multiplied by
   * π/180 inside the shader) and need the angle the card is actually leaning at.
   */
  setLeanDegrees(x: number, y: number): void;
  setScrollMode(mode: WebglFoilScrollMode): void;
  setDeviceRotationDegrees(degrees: number): void;
  destroy(): void;
};
