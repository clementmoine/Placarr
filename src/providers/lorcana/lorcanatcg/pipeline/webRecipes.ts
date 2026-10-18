/**
 * Parse publisher foil-inner CSS → stable Placarr recipes.json shape.
 *
 * Used by dumpWeb (live scrape) and tests (fixture / offline). Runtime loads
 * the dumped file via foilMetaLoad — no hand-transcribed look tables.
 */

export const LORCANA_WEB_TEXTURE_BASE = "/assets/lorcana/web";

export type LorcanaWebLookDecl = {
  backgroundImage: string;
  backgroundRepeat?: string;
  backgroundSize?: string;
  backgroundPosition?: string;
  backgroundBlendMode?: string;
  mixBlendMode?: string;
  opacity?: number;
  filter?: string;
};

export type LorcanaWebRecipesFile = {
  version: 1;
  looks: Record<string, LorcanaWebLookDecl>;
  /** Catalogue finish name → look id (Lava → lava). */
  finishMap: Record<string, string>;
  /** Catalogue varnish name → look id (ChromeRainbowHotFoil → …). */
  varnishMap: Record<string, string>;
};

const LOOK_PROPS = [
  "background-image",
  "background-repeat",
  "background-size",
  "background-position",
  "background-blend-mode",
  "mix-blend-mode",
  "opacity",
  "filter",
] as const;

/** Second varnish coat — HoloCardImage clones hotFoil with --topcolor2. */
const SKIP_SELECTORS = new Set([".foil-top-shine-2 .foil-inner"]);

/**
 * Rewrite hashed CDN urls + Placarr idle contract (`--combined`).
 */
export function normalizeRecipeValue(value: string): string {
  return value
    .replace(
      /url\(\s*['"]?\/assets\/([a-z0-9]+)(?:-[A-Za-z0-9_-]+)?\.((?:jpe?g|png|webp))['"]?\s*\)/gi,
      (_m, stem: string, ext: string) => {
        let e = ext.toLowerCase();
        if (e === "jpeg") e = "jpg";
        return `url(${LORCANA_WEB_TEXTURE_BASE}/${stem.toLowerCase()}.${e})`;
      },
    )
    .replace(
      /calc\(\s*var\(--colorX\)\s*\*\s*1\s*\+\s*var\(--colorY\)\s*\)/gi,
      "var(--combined)",
    )
    .replace(/\btransparent\b/gi, "#0000")
    .replace(/rgba\(\s*255\s*,\s*255\s*,\s*255\s*,\s*0?\.8\s*\)/gi, "#fffc")
    .replace(/\s+/g, " ")
    .replace(/\s*,\s*/g, ", ")
    .trim();
}

function toCamelLookId(name: string): string {
  if (!name) return "";
  return name.charAt(0).toLowerCase() + name.slice(1);
}

/**
 * Map a publisher selector to look id + catalogue finish/varnish names.
 */
export function classifyFoilInnerSelector(
  selector: string,
): {
  lookId: string;
  finishes: string[];
  varnish?: string;
} | null {
  const sel = selector.replace(/\s+/g, " ").trim();
  if (SKIP_SELECTORS.has(sel)) return null;

  if (sel === ".foil-top-shine.ChromeRainbowHotFoil .foil-inner") {
    return {
      lookId: "chromeRainbowHotFoil",
      finishes: [],
      varnish: "ChromeRainbowHotFoil",
    };
  }
  if (sel === ".foil-top-shine .foil-inner") {
    return { lookId: "hotFoil", finishes: [], varnish: "HotFoil" };
  }
  if (sel === ".lore-shine .foil-inner") {
    return { lookId: "loreShine", finishes: [] };
  }
  if (sel === ".satin-shine .foil-inner") {
    return { lookId: "satinShine", finishes: [] };
  }

  // Shared FreeForm rule
  if (
    sel.includes("FreeForm1") &&
    sel.includes("FreeForm2") &&
    sel.includes(".foil-inner")
  ) {
    return { lookId: "freeForm", finishes: ["FreeForm1", "FreeForm2"] };
  }

  const finishMatch = sel.match(
    /^\.([A-Z][A-Za-z0-9]*)\s+\.foil-shine\s+\.foil-inner$/,
  );
  if (finishMatch?.[1]) {
    const finish = finishMatch[1];
    return { lookId: toCamelLookId(finish), finishes: [finish] };
  }

  return null;
}

function parseOpacity(raw: string | undefined): number | undefined {
  if (raw == null || raw === "") return undefined;
  const n = Number.parseFloat(raw);
  return Number.isFinite(n) ? n : undefined;
}

function declFromProps(
  props: Record<string, string>,
): LorcanaWebLookDecl | null {
  const backgroundImage = props["background-image"];
  if (!backgroundImage) return null;
  const decl: LorcanaWebLookDecl = {
    backgroundImage: normalizeRecipeValue(backgroundImage),
  };
  const repeat = props["background-repeat"];
  if (repeat) decl.backgroundRepeat = normalizeRecipeValue(repeat);
  const size = props["background-size"];
  if (size) decl.backgroundSize = normalizeRecipeValue(size);
  const position = props["background-position"];
  if (position) decl.backgroundPosition = normalizeRecipeValue(position);
  const bgBlend = props["background-blend-mode"];
  if (bgBlend) decl.backgroundBlendMode = normalizeRecipeValue(bgBlend);
  const mix = props["mix-blend-mode"];
  if (mix) decl.mixBlendMode = normalizeRecipeValue(mix);
  const filter = props["filter"];
  if (filter) decl.filter = normalizeRecipeValue(filter);
  const opacity = parseOpacity(props.opacity);
  if (opacity != null) decl.opacity = opacity;
  return decl;
}

/**
 * Prefer dumped texture files over inlined data: urls when a stem is known
 * (SeaWave's seawavec was historically inlined in the viewer CSS).
 */
function preferDumpedTextures(
  lookId: string,
  decl: LorcanaWebLookDecl,
): LorcanaWebLookDecl {
  if (lookId !== "seaWave") return decl;
  const next = decl.backgroundImage.replace(
    /url\(\s*data:image\/[^)]+\)/i,
    `url(${LORCANA_WEB_TEXTURE_BASE}/seawavec.jpg)`,
  );
  if (next === decl.backgroundImage) return decl;
  return { ...decl, backgroundImage: next };
}

/**
 * Build recipes.json from selector → property maps (fixture or parsed CSS).
 */
export function recipesFromSelectorRules(
  rules: Readonly<Record<string, Record<string, string>>>,
): LorcanaWebRecipesFile {
  const looks: Record<string, LorcanaWebLookDecl> = {};
  const finishMap: Record<string, string> = {};
  const varnishMap: Record<string, string> = {};

  for (const [selector, props] of Object.entries(rules)) {
    const classified = classifyFoilInnerSelector(selector);
    if (!classified) continue;
    const decl = declFromProps(props);
    if (!decl) continue;
    const look = preferDumpedTextures(classified.lookId, decl);
    looks[classified.lookId] = look;
    for (const finish of classified.finishes) {
      finishMap[finish] = classified.lookId;
    }
    if (classified.varnish && classified.varnish !== "HotFoil") {
      varnishMap[classified.varnish] = classified.lookId;
    }
  }

  // HotFoil family → generic coat (not listed as a catalogue varnish name).
  if (looks.hotFoil) {
    for (const name of [
      "HighGloss",
      "MatteHotFoil",
      "MetallicHotFoil",
      "SnowHotFoil",
      "RainbowHotFoil",
      "VarnishFoil",
    ]) {
      if (!(name in varnishMap)) varnishMap[name] = "hotFoil";
    }
  }

  return {
    version: 1,
    looks: Object.fromEntries(
      Object.entries(looks).sort(([a], [b]) => a.localeCompare(b)),
    ),
    finishMap: Object.fromEntries(
      Object.entries(finishMap).sort(([a], [b]) => a.localeCompare(b)),
    ),
    varnishMap: Object.fromEntries(
      Object.entries(varnishMap).sort(([a], [b]) => a.localeCompare(b)),
    ),
  };
}

/**
 * Extract `.foil-inner` rule blocks from a CSS stylesheet (minified OK).
 * Brace-matched so `url("data:…")` / nested parens do not truncate values.
 */
export function parseFoilInnerRulesFromCss(
  css: string,
): Record<string, Record<string, string>> {
  const out: Record<string, Record<string, string>> = {};
  let i = 0;
  while (i < css.length) {
    const open = css.indexOf("{", i);
    if (open < 0) break;
    const selector = css.slice(i, open).replace(/\s+/g, " ").trim();
    let depth = 0;
    let j = open;
    for (; j < css.length; j++) {
      const ch = css[j];
      if (ch === "{") depth++;
      else if (ch === "}") {
        depth--;
        if (depth === 0) {
          j++;
          break;
        }
      }
    }
    const body = css.slice(open + 1, j - 1);
    i = j;
    if (!selector.includes("foil-inner")) continue;
    const props: Record<string, string> = {};
    // Split declarations on `;` outside of parentheses / quotes.
    for (const decl of splitCssDeclarations(body)) {
      const colon = decl.indexOf(":");
      if (colon < 0) continue;
      const prop = decl.slice(0, colon).trim().toLowerCase();
      const value = decl.slice(colon + 1).trim();
      if ((LOOK_PROPS as readonly string[]).includes(prop) && value) {
        props[prop] = value;
      }
    }
    if (Object.keys(props).length > 0) {
      out[selector] = props;
    }
  }
  return out;
}

function splitCssDeclarations(body: string): string[] {
  const parts: string[] = [];
  let start = 0;
  let depth = 0;
  let quote: string | null = null;
  for (let i = 0; i < body.length; i++) {
    const ch = body[i]!;
    if (quote) {
      if (ch === quote && body[i - 1] !== "\\") quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      continue;
    }
    if (ch === "(") depth++;
    else if (ch === ")") depth = Math.max(0, depth - 1);
    else if (ch === ";" && depth === 0) {
      parts.push(body.slice(start, i).trim());
      start = i + 1;
    }
  }
  const tail = body.slice(start).trim();
  if (tail) parts.push(tail);
  return parts;
}

/** Merge several CSS sheets (later sheets win on same selector). */
export function parseFoilInnerRulesFromCssSheets(
  sheets: readonly string[],
): Record<string, Record<string, string>> {
  const merged: Record<string, Record<string, string>> = {};
  for (const sheet of sheets) {
    Object.assign(merged, parseFoilInnerRulesFromCss(sheet));
  }
  return merged;
}

export function textureStemsFromRecipes(
  recipes: LorcanaWebRecipesFile,
): Set<string> {
  const stems = new Set<string>();
  const re = new RegExp(
    `${LORCANA_WEB_TEXTURE_BASE.replace(/\//g, "\\/")}\\/([a-z0-9]+)\\.(?:jpe?g|png|webp)`,
    "gi",
  );
  for (const look of Object.values(recipes.looks)) {
    for (const m of look.backgroundImage.matchAll(re)) {
      if (m[1]) stems.add(m[1].toLowerCase());
    }
  }
  return stems;
}

export function recipesFromCssSheets(
  sheets: readonly string[],
): LorcanaWebRecipesFile {
  return recipesFromSelectorRules(parseFoilInnerRulesFromCssSheets(sheets));
}
