/**
 * ISO compare targets — thin wrapper over {@link simeyDemoAnchors}.
 * Playroom CSS|Simey pair + staging CSS paths.
 */

import { LIVE_FINISH_CSS } from "./cssRecipes";
import {
  liveLeavesMissingSimeyAnchor,
  simeyAnchorDemoUrl,
  simeyAnchorForLeaf,
  type SimeyDemoAnchor,
  type SimeyDemoTree,
} from "./simeyDemoAnchors";

export type { SimeyDemoTree };

export type SimeyIsoTarget = {
  leaf: string;
  cssId: string;
  tree: SimeyDemoTree;
  stem: string;
  demoSearch: string;
  demoPick: string;
  check: string;
  /** Live catalogue bundle for the Simey exemplar. */
  bundleId: string;
};

function toIso(anchor: SimeyDemoAnchor): SimeyIsoTarget {
  return {
    leaf: anchor.leaf,
    cssId: anchor.cssId,
    tree: anchor.tree,
    stem: anchor.stem,
    demoSearch: anchor.demoSearch,
    demoPick: `${anchor.name} · ${anchor.rarity} · ${anchor.bundleId}`,
    check: `Simey ${anchor.stem}.css · catalogue ${anchor.bundleId}`,
    bundleId: anchor.bundleId,
  };
}

/** @deprecated Prefer iterating {@link simeyAnchorForLeaf} / anchors map. */
export const SIMEY_ISO_BY_LEAF: Readonly<Record<string, SimeyIsoTarget>> =
  Object.fromEntries(
    Object.keys(LIVE_FINISH_CSS).map((leaf) => {
      const a = simeyAnchorForLeaf(leaf)!;
      return [leaf, toIso(a)];
    }),
  );

export function simeyIsoForLeaf(
  leaf: string | null | undefined,
): SimeyIsoTarget | null {
  const a = simeyAnchorForLeaf(leaf);
  return a ? toIso(a) : null;
}

export function simeyDemoUrl(target: SimeyIsoTarget): string {
  return simeyAnchorDemoUrl({
    leaf: target.leaf,
    cssId: target.cssId,
    tree: target.tree,
    stem: target.stem,
    pokeId: "",
    name: target.demoPick,
    rarity: "",
    bundleId: target.bundleId,
    demoSearch: target.demoSearch,
  });
}

export function simeyStagingCssPath(target: SimeyIsoTarget): string {
  return `data/pokemon/staging/simey/${target.tree}/public/css/cards/${target.stem}.css`;
}

export function liveLeavesMissingSimeyIso(): string[] {
  return liveLeavesMissingSimeyAnchor();
}
