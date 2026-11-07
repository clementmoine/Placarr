export type WebglFoilSurfaces = {
  artUrl: string;
  foilMaskUrl?: string | null;
  varnishMaskUrl?: string | null;
  secondVarnishMaskUrl?: string | null;
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
