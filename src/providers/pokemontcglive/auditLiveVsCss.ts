/**
 * Live plates vs what the CSS fallback actually paints, per material.
 *
 * audit Live vs CSS (local tool)
 *
 * The WebGL path runs the publisher's own GLES3 fragments against the plates
 * the material binds, so it *is* Live. Anything a material binds and the CSS
 * recipe never reaches is a difference we chose or forgot — this separates the
 * two.
 *
 * Owned effects are flagged: those have a 1:1 reference in the running app, so
 * a divergence found there can be checked by eye and the fix usually carries to
 * the effects we cannot open.
 *
 * Three verdicts per unreferenced plate:
 *
 * - **data** — displacement / direction / normal maps. `_Distort` offsets UVs,
 *   `Direction`/`Normal`/`_RG_` encode vectors in red and green. CSS has no
 *   equivalent and painting them shows red-green noise, so leaving them out is
 *   correct. Never a bug.
 * - **carved** — the plate *is* used, as a stencil rather than as paint
 *   (`HoloShader.carve`). Near-black plates whose shape lives in alpha.
 * - **missing** — bound by Live, drawable, and nowhere in the CSS chain. The
 *   only column worth acting on.
 */
import "@/effects/pokemon";
// Server-side: installs the SQLite lookups the pack reads Live faces from.
import "@/effects/pokemon/cardFoilIndex";

import { getEffectPack } from "@/core/render/foil";
import { holoShader } from "@/core/render/holoShaders";
import { POKEMON_FOIL_NAMES } from "@/effects/pokemon/foilNames";
import { ownedBundlesForShader } from "@/effects/pokemon/liveOwnedBundles";

/** Per-print plates — the card's own art and masks, never shared motifs. */
const PER_PRINT = /CardColorDiffuse|WhitePlateMask|CardEtch|ColdFoilMask/;

/**
 * Vector fields and displacement maps: correct to omit, never a finding.
 *
 * Matched on the **slot**, not the file. The same plate can be a picture in one
 * material and a displacement field in another — `T_CloudNoise` is `_T_noise_dots`
 * on Cosmos (drawn) and `_TexDistort` on 25thConfetti (must not be). Classifying
 * by filename reported the second as a forgotten plate.
 */
const DATA_SLOT = /Distort|Direction|Normal|Bump|_RG_|Cross(?!Texture)/i;

/** Fallback for plates whose slot name says nothing but whose file does. */
const DATA_FILE = /Distort|Distortion|Direction|_Normal_|_RG_|BumpRandom/;

/**
 * Plates a recipe drops **on purpose**, with the reason.
 *
 * An audit that keeps reporting a decision somebody already made stops being
 * read. Every entry needs a why; if the why no longer holds, delete the entry
 * rather than the finding.
 */
const DELIBERATE: Record<string, { plates: string[]; why: string }> = {
  RadiantHolo: {
    plates: ["FX_T_Gradient_Shine_Dull", "FX_T_Spectrum_BlackSide"],
    why: "poke-holo choreography: the pastel rainbow replaces both Live plates",
  },
};

function stemOf(value: unknown): string {
  const raw =
    typeof value === "string"
      ? value
      : ((value as { path?: string; file?: string })?.path ??
        (value as { file?: string })?.file ??
        "");
  return (raw.split("/").pop() ?? "").replace(/\.\w+$/, "");
}

/** Every `textures/` stem the CSS chain paints or carves, following overlays. */
function cssPlates(startId: string | null): {
  painted: Set<string>;
  carved: Set<string>;
  chain: string[];
} {
  const painted = new Set<string>();
  const carved = new Set<string>();
  const chain: string[] = [];
  let id: string | null | undefined = startId;
  const seen = new Set<string>();
  while (id && !seen.has(id)) {
    seen.add(id);
    const look = holoShader(id);
    if (!look) break;
    chain.push(id);
    for (const [, stem] of String(look.backgroundImage).matchAll(
      /\/textures\/([^./]+)\.webp/g,
    )) {
      painted.add(stem);
    }
    const carve = (look as { carve?: { url?: string } }).carve;
    if (carve?.url) carved.add(stemOf(carve.url));
    id = (look as { overlay?: string }).overlay ?? null;
  }
  return { painted, carved, chain };
}

function main(): void {
  const pack = getEffectPack("pokemon");
  if (!pack) {
    console.error("pokemon effect pack not registered");
    process.exitCode = 1;
    return;
  }

  const findings: { material: string; owned: boolean; missing: string[] }[] =
    [];

  console.log("Live plates vs CSS paint — pokemon\n");
  for (const name of POKEMON_FOIL_NAMES) {
    if (name === "NonFoil") continue;
    const material = pack.material?.(name);
    if (!material) continue;

    /*
      Cast-and-cure slots are off unless the print turns them on.

      `_Tex_CC*` feeds the laminate layer, and `_UseCCFoil` defaults to 0 on the
      material sheet — only `CastAndCure` / `ReverseLaminate*` prints flip it at
      runtime (`applyLiveFoilMask`). Counting those plates as unpainted made the
      audit report Northern Cross and the CC spectrum as forgotten on SunPillar
      and FlatSilver, when the shader does not sample them either.
    */
    const ccOn = Number(material.floats?._UseCCFoil ?? 0) > 0;
    const bound: { slot: string; stem: string }[] = [];
    const seenStem = new Set<string>();
    for (const [slot, tex] of Object.entries(material.textures ?? {})) {
      if (!ccOn && slot.startsWith("_Tex_CC")) continue;
      const stem = stemOf(tex);
      if (!stem || PER_PRINT.test(stem) || seenStem.has(stem)) continue;
      seenStem.add(stem);
      bound.push({ slot, stem });
    }

    const { painted, carved, chain } = cssPlates(
      pack.resolveCss(name, null).finishShaderId,
    );

    const chosen = DELIBERATE[name];
    const data: string[] = [];
    const dropped: string[] = [];
    const missing: string[] = [];
    for (const { slot, stem } of bound) {
      if (painted.has(stem) || carved.has(stem)) continue;
      if (chosen?.plates.includes(stem)) {
        dropped.push(stem);
        continue;
      }
      const isData = DATA_SLOT.test(slot) || DATA_FILE.test(stem);
      (isData ? data : missing).push(stem);
    }

    const owned = ownedBundlesForShader(name).length > 0;
    const flag = owned ? "OWNED" : "     ";
    const notes: string[] = [];
    if (data.length) notes.push(`${data.length} carte(s) de données`);
    if (dropped.length)
      notes.push(`${dropped.length} écartée(s) — ${chosen!.why}`);
    const verdict = missing.length
      ? `MANQUE ${missing.join(" ")}`
      : notes.length
        ? `ok (${notes.join(" ; ")})`
        : "ok";
    console.log(
      `${flag} ${name.padEnd(20)} live=${String(bound.length).padStart(2)}` +
        ` peint=${String(painted.size).padStart(2)}` +
        ` découpé=${carved.size}` +
        ` passes=${chain.length}  ${verdict}`,
    );
    if (missing.length) findings.push({ material: name, owned, missing });
  }

  if (findings.length === 0) {
    console.log("\nAucune plaque dessinable oubliée.");
    return;
  }
  const owned = findings.filter((f) => f.owned);
  console.log(
    `\n${findings.length} matériau(x) avec une plaque non reprise` +
      ` — dont ${owned.length} vérifiable(s) à l'œil (owned).`,
  );
  for (const f of findings) {
    console.log(
      `  ${f.owned ? "OWNED" : "     "} ${f.material}: ${f.missing.join(" ")}`,
    );
  }
}

main();
