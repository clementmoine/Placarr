/**
 * Make a Metal-translated Fusion World fragment link against the shared foil
 * quad. The quad already writes `vs_INTERP0` (uv), `vs_NORMAL0` and
 * `vs_TEXCOORD4` (world position). Unity's buffer structs become plain
 * uniforms so the renderer can drive `_Time` and `_WorldSpaceCameraPos`.
 */

const STRUCT_RE = /struct\s+(\w+)\s*\{([^}]*)\}\s*;?/g;

type Field = { type: string; name: string; array: string };

function structFields(body: string): Field[] {
  const fields: Field[] = [];
  for (const raw of body.split(";")) {
    const line = raw.replace(/\/\*[\s\S]*?\*\//g, "").trim().replace(/\s+/g, " ");
    const match = /^([\w]+)\s+([\w]+)(\[[^\]]+\])?$/.exec(line);
    if (!match) continue;
    fields.push({ type: match[1]!, name: match[2]!, array: match[3] ?? "" });
  }
  return fields;
}

function vectorCompare(src: string): string {
  const ops: ReadonlyArray<[string, string]> = [
    [">=", "greaterThanEqual"],
    ["<=", "lessThanEqual"],
    [">", "greaterThan"],
    ["<", "lessThan"],
  ];
  let out = src;
  for (const [op, fn] of ops) {
    const escaped = op.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const expr = "abs\\([^()]+\\)|vec[234]\\([^()]*\\)|\\(-[\\w.]+\\)|[\\w.]+";
    out = out.replace(
      new RegExp(`\\((${expr})\\s*${escaped}\\s*(${expr})\\)`, "g"),
      (full, left: string, right: string) => {
        const vector = /\.[xyzw]{2,}|^vec[234]\(/.test(left) || /\.[xyzw]{2,}|^vec[234]\(/.test(right);
        if (!vector) return full;
        return `${fn}(${left}, ${right})`;
      },
    );
  }
  return out;
}

/**
 * WebGL2 often exposes only 16 fragment texture units. Prefer face + holo +
 * packed EffectsLayer arrays over distortion / leader / cubemap chrome.
 */
const SAMPLER_KEEP = [
  "_MainTex",
  "_FrontTex",
  "_MiddleTex",
  "_CharaTex",
  "_MasksTex",
  "_FoilMask",
  "_HoloMask",
  "_HoloMap",
  "_RainbowTexture",
  "_FrameTex",
  "_Frame2Tex",
  "_Mask",
  "_EffectsLayersTex",
  "_EffectsLayersMotion",
  "_EffectsLayer1Tex",
  "_EffectsLayer1Motion",
  "_EffectsLayer2Tex",
  "_EffectsLayer2Motion",
  "_CostNumberTex",
];

/** Never spend a portable unit on these — even when keep has room. */
const SAMPLER_DROP = [
  "_DistortionTexture",
  "_DistortionMask",
  "_LeaderIconMask",
];

function shouldDropSampler(name: string): boolean {
  return (
    SAMPLER_DROP.includes(name) ||
    /cubemap/i.test(name) ||
    /Texture2DAsset_/i.test(name)
  );
}

/** Insert decls after `#version` + `precision` — never before `#version`. */
function insertAfterGlslPreamble(src: string, decls: string): string {
  const lines = src.split("\n");
  let i = 0;
  if (lines[0]?.startsWith("#version")) i = 1;
  while (i < lines.length && /^\s*(precision\b|$)/.test(lines[i]!)) i += 1;
  // sampler2DArray needs an explicit precision in ES 3.00.
  const needsArrayPrecision =
    /\bsampler2DArray\b/.test(decls) &&
    !/precision\s+\w+\s+sampler2DArray\s*;/.test(src);
  const block = [
    needsArrayPrecision ? "precision highp sampler2DArray;" : "",
    decls.replace(/\n$/, ""),
  ]
    .filter(Boolean)
    .join("\n");
  lines.splice(i, 0, block);
  return lines.join("\n");
}

/**
 * Pack Frost `_EffectsLayer{1…6}Tex` (and Motion) into two `sampler2DArray`
 * units so layers 3–6 stay reachable under the 16-unit floor.
 */
export function packFrostEffectsLayers(src: string): string {
  const texLayers = [
    ...src.matchAll(/^uniform sampler2D (_EffectsLayer([1-6])Tex);$/gm),
  ];
  const motionLayers = [
    ...src.matchAll(/^uniform sampler2D (_EffectsLayer([1-6])Motion);$/gm),
  ];
  if (texLayers.length === 0 && motionLayers.length === 0) return src;

  let out = src;
  const decls: string[] = [];
  if (texLayers.length > 0) {
    out = out.replace(
      /^uniform sampler2D _EffectsLayer[1-6]Tex;\n/gm,
      "",
    );
    decls.push("uniform sampler2DArray _EffectsLayersTex;");
    for (const m of texLayers) {
      const name = m[1]!;
      const layer = Number(m[2]) - 1;
      out = rewriteLayerSamples(out, name, "_EffectsLayersTex", layer);
    }
  }
  if (motionLayers.length > 0) {
    out = out.replace(
      /^uniform sampler2D _EffectsLayer[1-6]Motion;\n/gm,
      "",
    );
    decls.push("uniform sampler2DArray _EffectsLayersMotion;");
    for (const m of motionLayers) {
      const name = m[1]!;
      const layer = Number(m[2]) - 1;
      out = rewriteLayerSamples(out, name, "_EffectsLayersMotion", layer);
    }
  }
  return decls.length ? insertAfterGlslPreamble(out, `${decls.join("\n")}\n`) : out;
}

function rewriteLayerSamples(
  src: string,
  from: string,
  toArray: string,
  layer: number,
): string {
  const call = new RegExp(`(texture(?:Lod)?)\\(\\s*${from}\\s*,`, "g");
  let out = "";
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = call.exec(src))) {
    const fn = match[1]!;
    const coordStart = match.index + match[0].length;
    let depth = 0;
    let end = coordStart;
    let firstComma = -1;
    for (; end < src.length; end++) {
      const ch = src[end];
      if (ch === "(") depth += 1;
      else if (ch === ")") {
        if (depth === 0) break;
        depth -= 1;
      } else if (ch === "," && depth === 0 && firstComma < 0) {
        firstComma = end;
      }
    }
    const coordEnd = firstComma >= 0 ? firstComma : end;
    const coord = src.slice(coordStart, coordEnd).trim();
    const rest = firstComma >= 0 ? src.slice(firstComma, end) : "";
    out += src.slice(last, match.index);
    out += `${fn}(${toArray}, vec3((${coord}).xy, ${layer}.0)${rest}`;
    last = end;
    call.lastIndex = end;
  }
  return out + src.slice(last);
}

function capSamplers(src: string, max = 16): string {
  const arrayDecls = [
    ...src.matchAll(/^uniform sampler2DArray (\w+);/gm),
  ].map((m) => m[1]!);
  const decls = [...src.matchAll(/^uniform sampler2D (\w+);/gm)].map(
    (m) => m[1]!,
  );
  const budget = Math.max(0, max - arrayDecls.length);
  const forceDrop = new Set(decls.filter((name) => shouldDropSampler(name)));
  const keep = new Set(
    SAMPLER_KEEP.filter(
      (name) => decls.includes(name) && !forceDrop.has(name),
    ).slice(0, budget),
  );
  for (const name of decls) {
    if (keep.size >= budget) break;
    if (forceDrop.has(name)) continue;
    keep.add(name);
  }
  const drop = decls.filter((name) => !keep.has(name));
  let out = src;
  for (const name of drop) {
    out = out.replace(new RegExp(`^uniform sampler2D ${name};\\n`, "m"), "");
    out = replaceSamplerCalls(out, name);
  }
  return out;
}

function replaceSamplerCalls(src: string, name: string): string {
  const call = new RegExp(`texture(?:Lod)?\\(\\s*${name}\\s*,`, "g");
  let out = "";
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = call.exec(src))) {
    let depth = 1;
    let end = match.index + match[0].length;
    for (; end < src.length && depth > 0; end++) {
      if (src[end] === "(") depth += 1;
      else if (src[end] === ")") depth -= 1;
    }
    out += src.slice(last, match.index);
    // Cubemap / dropped plates: white, not black. Frost holo does
    // `albedo *= luminance(cubemap)` — a zero stub logs to -inf and
    // paints NaN neon edges over a crushed plate.
    out += /cubemap/i.test(name) ? "vec4(1.0)" : "vec4(0.0)";
    last = end;
    call.lastIndex = end;
  }
  return out + src.slice(last);
}

export function repairClientGlsl(src: string): string {
  let out = src.replaceAll("mtl_FragCoord", "gl_FragCoord");
  out = out.replace(/uniform\s+vec4\s+gl_FragCoord\s*;\s*/g, "");
  out = out.replace(/[\w.]+\.get_num_mip_levels\(\)/g, "1u");
  out = vectorCompare(out);
  out = out.replace(
    /\((\w+)\s*>=\s*\(-\1\)\)/g,
    "greaterThanEqual($1, -$1)",
  );
  out = out.replace(
    /\((vec[234])\(([^()]*)\)\s*(==|!=)\s*(vec[234])\(([^()]*)\)\)/g,
    (_all, leftType: string, left: string, op: string, rightType: string, right: string) => {
      const fn = op === "==" ? "equal" : "notEqual";
      return `${fn}(${leftType}(${left}), ${rightType}(${right}))`;
    },
  );
  out = out.replace(
    /(\w+)\.([xyzw]{2,4})\s*=\s*(\w+)\.([xyzw]+)\s*(\|\||&&)\s*(\w+)\.([xyzw]+)\s*;/g,
    (_all, dest: string, destSw: string, left: string, leftSw: string, op: string, right: string, rightSw: string) => {
      const n = destSw.length;
      const glue = op === "||" ? "||" : "&&";
      const terms: string[] = [];
      for (let i = 0; i < n; i++) {
        const l = leftSw[Math.min(i, leftSw.length - 1)];
        const r = rightSw[Math.min(i, rightSw.length - 1)];
        terms.push(`${left}.${l}${glue}${right}.${r}`);
      }
      return `${dest}.${destSw} = bvec${n}(${terms.join(", ")});`;
    },
  );
  return capSamplers(out);
}

function zeroOf(type: string): string {
  if (type === "uint") return "0u";
  if (type === "int") return "0";
  if (type === "float") return "0.0";
  if (type === "bool") return "false";
  return `${type}(0)`;
}

function rewriteDemotedSamples(src: string, demoted: Set<string>): string {
  const call = /texture(?:Lod)?\(\s*/g;
  let out = "";
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = call.exec(src))) {
    const nameStart = match.index + match[0].length;
    const nameMatch = /^(\w+)\s*,\s*/.exec(src.slice(nameStart));
    if (!nameMatch || !demoted.has(nameMatch[1]!)) continue;
    const coordStart = nameStart + nameMatch[0].length;
    let depth = 0;
    let end = coordStart;
    for (; end < src.length; end++) {
      const ch = src[end];
      if (ch === "(") depth += 1;
      else if (ch === ")") {
        if (depth === 0) break;
        depth -= 1;
      } else if (ch === "," && depth === 0) break;
    }
    const coord = src.slice(coordStart, end);
    out += src.slice(last, match.index);
    out += `texture(${nameMatch[1]}, (${coord}).xy`;
    last = end;
    call.lastIndex = end;
  }
  return out + src.slice(last);
}

/**
 * @returns GLSL that declares only the shared quad varyings plus locals for
 * the Metal interpolators the vertex stage does not emit.
 */
export function adaptClientFragment(source: string): string {
  const structs = new Map<string, Field[]>();
  let src = source.replace(STRUCT_RE, (_all, name: string, body: string) => {
    structs.set(name, structFields(body));
    return "";
  });

  const emitted = new Set<string>();
  for (const [structName, fields] of structs) {
    const uniform = new RegExp(`uniform\\s+${structName}\\s+(\\w+)\\s*;`);
    const found = uniform.exec(src);
    if (!found) continue;
    const instance = found[1]!;
    const lines: string[] = [];
    for (const field of fields) {
      let name = field.name;
      if (name === "_TimeParameters") name = "_Time";
      if (emitted.has(name)) continue;
      emitted.add(name);
      lines.push(`uniform ${field.type} ${name}${field.array};`);
      src = src.replaceAll(`${instance}.${field.name}`, name);
    }
    src = src.replace(found[0], lines.join("\n"));
  }

  const inputs: { type: string; name: string }[] = [];
  src = src.replace(/^in\s+([\w]+)\s+([\w]+)\s*;\s*$/gm, (_all, type: string, name: string) => {
    inputs.push({ type, name });
    return "";
  });

  const locals: string[] = [];
  let needsUv = false;
  let needsNormal = false;
  let needsWorld = false;
  for (const input of inputs) {
    if (input.name === "INTERP0") {
      needsUv = true;
      src = src.replace(/\bINTERP0\b/g, "vs_INTERP0");
      continue;
    }
    if (input.name === "INTERP1" && input.type === "vec4") {
      locals.push("vec4 INTERP1 = vec4(1.0);");
      continue;
    }
    if (input.name === "INTERP1" && input.type === "vec3") {
      needsNormal = true;
      locals.push("vec3 INTERP1 = vs_NORMAL0;");
      continue;
    }
    if (input.name === "INTERP2" && input.type === "vec3") {
      needsWorld = true;
      locals.push("vec3 INTERP2 = vs_TEXCOORD4.xyz;");
      continue;
    }
    if (input.name === "INTERP3" && input.type === "vec3") {
      needsNormal = true;
      locals.push("vec3 INTERP3 = vs_NORMAL0;");
      continue;
    }
    locals.push(`${input.type} ${input.name} = ${zeroOf(input.type)};`);
  }

  const varyings = [
    needsUv ? "in vec4 vs_INTERP0;" : "",
    needsNormal ? "in vec3 vs_NORMAL0;" : "",
    needsWorld ? "in vec4 vs_TEXCOORD4;" : "",
  ].filter(Boolean);

  src = src.replace(
    "void main() {",
    `${varyings.join("\n")}\nvoid main() {\n${locals.join("\n")}`,
  );

  // Pack Frost EffectsLayer1…6 into two array units before demoting other
  // arrays (FrameTex) / cubemaps — those still become sampler2D plates.
  src = packFrostEffectsLayers(src);

  const keepArray = new Set([
    "_EffectsLayersTex",
    "_EffectsLayersMotion",
  ]);
  const demoted = new Set<string>();
  src = src.replace(
    /uniform\s+(sampler2DArray|samplerCube|sampler2DShadow)\s+(\w+)\s*;/g,
    (_all, type: string, name: string) => {
      if (type === "sampler2DArray" && keepArray.has(name)) {
        return `uniform sampler2DArray ${name};`;
      }
      demoted.add(name);
      return `uniform sampler2D ${name};`;
    },
  );
  if (demoted.size > 0) src = rewriteDemotedSamples(src, demoted);

  return repairClientGlsl(src.replace(/\n{3,}/g, "\n\n"));
}
