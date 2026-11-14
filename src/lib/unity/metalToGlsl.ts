/**
 * Unity hlslcc Metal → GLSL ES 3.00.
 *
 * Covers the subset the Mac player actually emits: buffer structs, stage_in
 * varyings, texture.sample / bias / level, fma, rsqrt, saturate, select,
 * as_type, and discard_fragment. Not a general Metal compiler.
 */

import {
  metalSourcesFromBlob,
  type MetalProgramSource,
} from "@/lib/unity/metalBlob";

export type TranslatedMetal = {
  stage: "vertex" | "fragment";
  glsl: string;
};

const TYPE_WORDS: ReadonlyArray<[string, string]> = [
  ["float4x4", "mat4"],
  ["float3x3", "mat3"],
  ["float4", "vec4"],
  ["float3", "vec3"],
  ["float2", "vec2"],
  ["half4", "vec4"],
  ["half3", "vec3"],
  ["half2", "vec2"],
  ["uint4", "uvec4"],
  ["uint3", "uvec3"],
  ["uint2", "uvec2"],
  ["int4", "ivec4"],
  ["int3", "ivec3"],
  ["int2", "ivec2"],
  ["bool4", "bvec4"],
  ["bool3", "bvec3"],
  ["bool2", "bvec2"],
  ["uint32_t", "uint"],
  ["int32_t", "int"],
  ["half", "float"],
];

function matchingParen(src: string, open: number): number {
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    const ch = src[i];
    if (ch === "(") depth += 1;
    else if (ch === ")") {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function matchingBrace(src: string, open: number): number {
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    const ch = src[i];
    if (ch === "{") depth += 1;
    else if (ch === "}") {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function splitArgs(inner: string): string[] {
  const args: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < inner.length; i++) {
    const ch = inner[i];
    if (ch === "(" || ch === "<") depth += 1;
    else if (ch === ")" || ch === ">") depth -= 1;
    else if (ch === "," && depth === 0) {
      args.push(inner.slice(start, i).trim());
      start = i + 1;
    }
  }
  const tail = inner.slice(start).trim();
  if (tail) args.push(tail);
  return args;
}

function rewriteNamedCalls(
  src: string,
  name: string,
  build: (args: string[]) => string,
): string {
  let out = "";
  let i = 0;
  const needle = `${name}(`;
  while (i < src.length) {
    const at = src.indexOf(needle, i);
    if (at < 0) {
      out += src.slice(i);
      break;
    }
    const before = at > 0 ? src[at - 1]! : "";
    if (before && /[\w]/.test(before)) {
      out += src.slice(i, at + 1);
      i = at + 1;
      continue;
    }
    const open = at + name.length;
    const close = matchingParen(src, open);
    if (close < 0) {
      out += src.slice(i);
      break;
    }
    const args = splitArgs(src.slice(open + 1, close)).map((arg) =>
      rewriteNamedCalls(arg, name, build),
    );
    out += src.slice(i, at) + build(args);
    i = close + 1;
  }
  return out;
}

function rewriteMethod(
  src: string,
  method: string,
  build: (receiver: string, args: string[]) => string,
): string {
  const needle = `.${method}`;
  let out = "";
  let i = 0;
  while (i < src.length) {
    const at = src.indexOf(needle, i);
    if (at < 0) {
      out += src.slice(i);
      break;
    }
    let cursor = at + needle.length;
    while (cursor < src.length && src[cursor] === " ") cursor += 1;
    if (src[cursor] !== "(") {
      out += src.slice(i, at + 1);
      i = at + 1;
      continue;
    }
    let start = at - 1;
    while (start >= 0 && /[\w]/.test(src[start]!)) start -= 1;
    const receiver = src.slice(start + 1, at);
    if (!receiver) {
      out += src.slice(i, at + 1);
      i = at + 1;
      continue;
    }
    const close = matchingParen(src, cursor);
    if (close < 0) {
      out += src.slice(i);
      break;
    }
    const args = splitArgs(src.slice(cursor + 1, close));
    out += src.slice(i, start + 1) + build(receiver, args);
    i = close + 1;
  }
  return out;
}

function lodCall(receiver: string, args: string[]): string {
  const coord = args[1] ?? "vec2(0.0)";
  const extra = args[2]?.trim();
  const wrapped = extra ? /^(bias|level)\(([\s\S]*)\)$/.exec(extra) : null;
  if (wrapped?.[1] === "level") return `textureLod(${receiver}, ${coord}, ${wrapped[2]})`;
  if (wrapped?.[1] === "bias") return `texture(${receiver}, ${coord}, ${wrapped[2]})`;
  return `texture(${receiver}, ${coord})`;
}

function compareCall(receiver: string, args: string[]): string {
  const coord = args[1] ?? "vec2(0.0)";
  const ref = args[2] ?? "0.0";
  return `texture(${receiver}, vec3(${coord}, ${ref}))`;
}

function selectMask(first: string, cond: string): string {
  const swizzle = /\.([xyzw]{2,4})\s*$/.exec(cond.trim());
  const width = swizzle?.[1]?.length;
  if (/\bbvec4\b|\bvec4\s*\(/.test(first) || /\bbvec4\b/.test(cond) || width === 4) {
    return `vec4(${cond})`;
  }
  if (/\bbvec3\b|\bvec3\s*\(/.test(first) || /\bbvec3\b/.test(cond) || width === 3) {
    return `vec3(${cond})`;
  }
  if (/\bbvec2\b|\bvec2\s*\(/.test(first) || /\bbvec2\b/.test(cond) || width === 2) {
    return `vec2(${cond})`;
  }
  return `float(${cond})`;
}

function replaceTypes(src: string): string {
  let out = src;
  for (const [from, to] of TYPE_WORDS) {
    out = out.replace(new RegExp(`\\b${from}\\b`, "g"), to);
  }
  return out;
}

function preprocess(source: string): string {
  const lines = source.replace(/\r\n/g, "\n").split("\n").filter((line) => {
    const trimmed = line.trim();
    if (trimmed.startsWith("#include")) return false;
    if (trimmed.startsWith("using namespace")) return false;
    if (trimmed.startsWith("constant uint")) return false;
    if (trimmed.startsWith("constant const")) return false;
    if (trimmed.startsWith("#ifndef") || trimmed.startsWith("#define")) return false;
    if (trimmed.startsWith("#endif") || trimmed.startsWith("constexpr")) return false;
    return true;
  });
  let src = lines.join("\n");
  src = src.replace(/\[\[\s*stage_in\s*\]\]/g, " /*stage_in*/ ");
  src = src.replace(/\[\[[^\]]*\]\]/g, " ");
  src = src.replace(/texture2d_array\s*<[^>]*>/g, "sampler2DArray");
  src = src.replace(/texturecube\s*<[^>]*>/g, "samplerCube");
  src = src.replace(/texture2d\s*<[^>]*>/g, "sampler2D");
  src = src.replace(/depth2d_array\s*<[^>]*>/g, "sampler2DArrayShadow");
  src = src.replace(/depthcube\s*<[^>]*>/g, "samplerCubeShadow");
  src = src.replace(/depth2d\s*<[^>]*>/g, "sampler2DShadow");
  src = src.replace(/\bconstant\s+/g, "");
  src = src.replace(
    /\b(float[234]?|half[234]?|int[234]?|uint[234]?|bool[234]?|vec[234]|bvec[234]|ivec[234]|uvec[234]|mat[234])\s*&/g,
    "$1 ",
  );
  src = src.replace(/(\w+_Type)\s*&/g, "$1 ");
  src = src.replace(/\bdevice\s+/g, "");
  src = replaceTypes(src);
  src = rewriteMethod(src, "sample_compare", compareCall);
  src = rewriteMethod(src, "sample", lodCall);
  src = src.replace(/as_type\s*<\s*float\s*>\s*\(/g, "intBitsToFloat(");
  src = src.replace(/as_type\s*<\s*half\s*>\s*\(/g, "intBitsToFloat(");
  src = src.replace(/as_type\s*<\s*int\s*>\s*\(/g, "floatBitsToInt(");
  src = src.replace(/as_type\s*<\s*uint\s*>\s*\(/g, "floatBitsToUint(");
  src = rewriteNamedCalls(src, "saturate", ([value]) => `clamp(${value ?? "0.0"}, 0.0, 1.0)`);
  src = rewriteNamedCalls(
    src,
    "fma",
    ([a, b, c]) => `((${a ?? "0.0"})*(${b ?? "0.0"})+(${c ?? "0.0"}))`,
  );
  src = rewriteNamedCalls(
    src,
    "select",
    ([a, b, c]) => `mix(${a ?? "0.0"}, ${b ?? "0.0"}, ${selectMask(a ?? "", c ?? "false")})`,
  );
  src = rewriteNamedCalls(src, "discard_fragment", () => "discard");
  src = src.replace(/\brsqrt\s*\(/g, "inversesqrt(");
  src = src.replace(/\bdfdx\s*\(/g, "dFdx(");
  src = src.replace(/\bdfdy\s*\(/g, "dFdy(");
  src = src.replace(/(\d+\.\d+)f\b/g, "$1");
  return src;
}

type Field = { type: string; name: string; array: string };

function dropStruct(src: string, structName: string): string {
  const at = src.indexOf(`struct ${structName}`);
  if (at < 0) return src;
  const open = src.indexOf("{", at);
  const close = src.indexOf("}", open);
  if (open < 0 || close < 0) return src;
  let end = close + 1;
  if (src[end] === ";") end += 1;
  return `${src.slice(0, at)}${src.slice(end)}`;
}

function structFields(src: string, structName: string): Field[] {
  const at = src.indexOf(`struct ${structName}`);
  if (at < 0) return [];
  const open = src.indexOf("{", at);
  const close = src.indexOf("}", open);
  if (open < 0 || close < 0) return [];
  const fields: Field[] = [];
  for (const raw of src.slice(open + 1, close).split(";")) {
    const line = raw.replace(/\/\*[\s\S]*?\*\//g, "").trim().replace(/\s+/g, " ");
    const match = /^([\w]+)\s+([\w]+)(\[[^\]]+\])?$/.exec(line);
    if (!match) continue;
    fields.push({ type: match[1]!, name: match[2]!, array: match[3] ?? "" });
  }
  return fields;
}

function targetName(member: string): string | null {
  if (member === "mtl_Position") return "gl_Position";
  const match = /^SV_TARGET(\d+)$/i.exec(member);
  if (!match) return null;
  const index = Number(match[1]);
  return index === 0 ? "fragColor" : `fragColor${index}`;
}

type Entry = {
  stage: "vertex" | "fragment";
  args: string;
  body: string;
  preamble: string;
};

function findEntry(src: string): Entry | null {
  const match = /(^|\n)(fragment|vertex)\s+[\w]+\s+[\w]+\s*\(/.exec(src);
  if (!match || match.index == null) return null;
  const keywordAt = match.index + (match[1] ? match[1].length : 0);
  const open = src.indexOf("(", keywordAt);
  const close = matchingParen(src, open);
  if (open < 0 || close < 0) return null;
  const brace = src.indexOf("{", close);
  const end = matchingBrace(src, brace);
  if (brace < 0 || end < 0) return null;
  const stage = match[2] === "vertex" ? "vertex" : "fragment";
  return {
    stage,
    args: src.slice(open + 1, close),
    body: src.slice(brace + 1, end),
    preamble: src.slice(0, keywordAt).trim(),
  };
}

function replaceMemberAccess(body: string, owner: string, fields: Field[], rename: (name: string) => string): string {
  const ordered = [...fields].sort((a, b) => b.name.length - a.name.length);
  let out = body;
  for (const field of ordered) {
    out = out.replaceAll(`${owner}.${field.name}`, rename(field.name));
  }
  return out;
}

function translatePrepared(src: string): TranslatedMetal | null {
  const entry = findEntry(src);
  if (!entry) return null;

  const args = splitArgs(entry.args);
  const uniforms: string[] = [];
  let inputType = "";
  let inputName = "";
  for (const arg of args) {
    const cleaned = arg.replace(/\/\*stage_in\*\//, "").trim().replace(/\s+/g, " ");
    const isInput = arg.includes("stage_in");
    const match = /^([\w]+)\s+([\w]+)$/.exec(cleaned);
    if (!match) continue;
    const type = match[1]!;
    const name = match[2]!;
    if (isInput) {
      inputType = type;
      inputName = name;
      continue;
    }
    if (type === "sampler") continue;
    uniforms.push(`uniform ${type} ${name};`);
  }

  const inputs = inputName ? structFields(entry.preamble, inputType) : [];
  const outputMatch = /\b(Mtl_FragmentOut|Mtl_VertexOut)\s+(\w+)\s*;/.exec(entry.body);
  const outputType = outputMatch?.[1] ?? "";
  const outputName = outputMatch?.[2] ?? "";
  const outputs = outputType ? structFields(entry.preamble, outputType) : [];

  let body = entry.body;
  if (outputMatch) body = body.replace(outputMatch[0], "");
  body = body.replace(/return\s+output\s*;/g, "");
  if (inputName) body = replaceMemberAccess(body, inputName, inputs, (name) => name);
  if (outputName) {
    body = replaceMemberAccess(body, outputName, outputs, (name) => targetName(name) ?? name);
  }

  const inLines = inputs.map((field) => `in ${field.type} ${field.name}${field.array};`);
  const outLines: string[] = [];
  for (const field of outputs) {
    const target = targetName(field.name);
    if (target === "gl_Position") continue;
    if (target) outLines.push(`out ${field.type} ${target};`);
    else outLines.push(`out ${field.type} ${field.name}${field.array};`);
  }

  let preamble = entry.preamble;
  for (const structName of ["Mtl_FragmentIn", "Mtl_FragmentOut", "Mtl_VertexIn", "Mtl_VertexOut"]) {
    preamble = dropStruct(preamble, structName);
  }

  const glsl = [
    "#version 300 es",
    "precision highp float;",
    "precision highp int;",
    preamble.trim(),
    ...uniforms,
    ...inLines,
    ...outLines,
    "void main() {",
    body.trim(),
    "}",
    "",
  ].filter((part) => part !== "").join("\n");

  return { stage: entry.stage, glsl };
}

/** Translate one Unity Metal program to a GLSL ES 3.00 shader. */
export function translateMetalSource(source: string): TranslatedMetal | null {
  return translatePrepared(preprocess(source));
}

function scoreFragment(source: string): number {
  let score = source.length;
  if (/HoloMap|_Holo|Foil|_Mask/.test(source)) score += 1_000_000_000;
  return score;
}

/**
 * Fragment to feed the existing extractor: the variant that samples a holo
 * or mask texture when there is one, otherwise the longest fragment.
 */
export function preferredMetalFragment(data: Uint8Array): string | null {
  const fragments = metalSourcesFromBlob(data).filter((program) => program.stage === "fragment");
  if (fragments.length === 0) return null;
  fragments.sort((a, b) => scoreFragment(b.source) - scoreFragment(a.source));
  return fragments[0]!.source;
}

export function translatePreferredFragment(data: Uint8Array): string | null {
  const source = preferredMetalFragment(data);
  if (!source) return null;
  return translateMetalSource(source)?.glsl ?? null;
}

export type { MetalProgramSource };
