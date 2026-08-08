export type FoilPackId = "lorcana" | "pokemon";

export type FoilPackStatus = {
  id: FoilPackId;
  label: string;
  /** Staging folder under data/ (lorcana | pokemon). */
  staging: string;
  apk: {
    present: boolean;
    files: { name: string; bytes: number }[];
    bytes: number;
    newestAt: string | null;
  };
  extract: {
    present: boolean;
    /** Shader count under data/<pack>/foil/shaders when available. */
    shaders: number | null;
    newestAt: string | null;
    /** APK newer than extract — re-run recommended. */
    stale: boolean;
  };
  /** Host extract can run without a fresh pull. */
  canExtract: boolean;
  extractTarget: "lorcana" | "pokemon";
};
