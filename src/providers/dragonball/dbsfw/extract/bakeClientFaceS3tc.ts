/**
 * Bake `art.client.webp`: WebGL uploads Unity S3TC mip0 + LINEAR, composites
 * Frost stack, readPixels → WebP.
 *
 * Color space (DECISION `display-bytes`): every leaf in the same display-byte
 * space — DXT always as non-sRGB S3TC, costRing/badge (RGBA32 / BC7→WebP) as
 * `RGBA` via `createImageBitmap({ colorSpaceConversion: "none" })`. Unity
 * stores sRGB bytes (`m_ColorSpace=1`); we composite those bytes like the lab
 * HTML, never sRGB-sample DXT while leaving gem/badge as raw RGBA.
 *
 * CPU decodeBc3 + bilinear leaves DXT 4×4 tramage on the shelf (CssFoilFace).
 * Every extract must end here — never leave a CPU aplat as the product face.
 */

import { spawn, type ChildProcess } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";

import { writeLosslessRgbaWebp } from "@/lib/media/losslessWebp";

export type S3tcBakePlate = {
  file: string;
  width: number;
  height: number;
  /** GL compressed format name from layers.s3tc.json */
  format: string;
};

export type ClientFaceGpuBakeInput = {
  destWebp: string;
  width: number;
  height: number;
  /** Absolute paths, Frost order already resolved by caller. */
  layers: {
    picture?: S3tcBakePlate | null;
    frame?: S3tcBakePlate | null;
    middle?: S3tcBakePlate | null;
    /** Prefer S3TC (FrameTex z=2). RGBA WebP only as last resort. */
    frameTop?: S3tcBakePlate | { file: string } | null;
    text?: S3tcBakePlate | null;
    costRing?: { file: string } | null;
    badge?: { file: string } | null;
  };
};

function isS3tcBakePlate(
  plate: S3tcBakePlate | { file: string } | null | undefined,
): plate is S3tcBakePlate {
  return Boolean(
    plate &&
      typeof plate === "object" &&
      "width" in plate &&
      "height" in plate &&
      "format" in plate,
  );
}

export type ClientFaceGpuBakeResult =
  | { ok: true }
  | { ok: false; reason: string };

function findChrome(explicit?: string): string | null {
  if (explicit && existsSync(explicit)) return explicit;
  const candidates = [
    process.env.CHROME_PATH,
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
  ];
  for (const c of candidates) {
    if (c && existsSync(c)) return c;
  }
  return null;
}

/** Catalogue bake: always non-sRGB S3TC (display-byte composite). */
function glFormatConst(name: string): string {
  const n = name.trim();
  if (/DXT1/i.test(n)) return "COMPRESSED_RGBA_S3TC_DXT1_EXT";
  if (/DXT5|BC3/i.test(n)) return "COMPRESSED_RGBA_S3TC_DXT5_EXT";
  return "COMPRESSED_RGBA_S3TC_DXT5_EXT";
}

function bakeHtml(opts: {
  width: number;
  height: number;
  layers: ClientFaceGpuBakeInput["layers"];
}): string {
  const L = opts.layers;
  const slots: {
    key: string;
    kind: "s3tc" | "rgba";
    url: string;
    w?: number;
    h?: number;
    format?: string;
  }[] = [];
  const pushS3tc = (key: string, plate: S3tcBakePlate | null | undefined) => {
    if (!plate) return;
    slots.push({
      key,
      kind: "s3tc",
      url: `./${path.basename(plate.file)}`,
      w: plate.width,
      h: plate.height,
      format: glFormatConst(plate.format),
    });
  };
  const pushRgba = (key: string, plate: { file: string } | null | undefined) => {
    if (!plate) return;
    slots.push({
      key,
      kind: "rgba",
      url: `./${path.basename(plate.file)}`,
    });
  };
  // Frost catalogue stack (UI on top) — same order as frostCatalogueComposeOrder.
  // DXT → S3TC+LINEAR; costRing (RGBA32) + badge (BC7→WebP) → Image textures.
  pushS3tc("pic", L.picture);
  pushS3tc("frame", L.frame);
  pushS3tc("middle", L.middle);
  if (isS3tcBakePlate(L.frameTop)) pushS3tc("frameTop", L.frameTop);
  else pushRgba("frameTop", L.frameTop);
  pushS3tc("text", L.text);
  pushRgba("costRing", L.costRing);
  pushRgba("badge", L.badge);

  const slotJson = JSON.stringify(slots);
  return `<!doctype html><html><body style="margin:0;background:#000">
<canvas id="c" width="${opts.width}" height="${opts.height}"></canvas>
<script type="module">
const slots=${slotJson};
const W=${opts.width}, H=${opts.height};
async function loadBin(url){const r=await fetch(url); if(!r.ok) throw new Error(url+" "+r.status); return new Uint8Array(await r.arrayBuffer());}
async function loadImage(url){
  const r=await fetch(url); if(!r.ok) throw new Error(url+" "+r.status);
  // No browser CMS — Unity already stored sRGB bytes (m_ColorSpace=1).
  const bmp=await createImageBitmap(await r.blob(), {colorSpaceConversion:"none", premultiplyAlpha:"none"});
  // ImageBitmap ignores UNPACK_FLIP_Y_WEBGL — flip into a canvas so RGBA
  // plates share GL orientation with Unity S3TC (or gems land at the bottom).
  const c=document.createElement("canvas");
  c.width=bmp.width; c.height=bmp.height;
  const ctx=c.getContext("2d");
  ctx.translate(0, bmp.height); ctx.scale(1, -1); ctx.drawImage(bmp, 0, 0);
  bmp.close();
  return c;
}
function compile(gl,type,src){const s=gl.createShader(type); gl.shaderSource(s,src); gl.compileShader(s); if(!gl.getShaderParameter(s,gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s;}
const vs=\`#version 300 es
in vec2 aPos; out vec2 vUv; void main(){ vUv=aPos*0.5+0.5; gl_Position=vec4(aPos,0.,1.); }\`;
const fs=\`#version 300 es
precision highp float; in vec2 vUv;
uniform sampler2D u0,u1,u2,u3,u4,u5,u6; uniform int uCount; out vec4 o;
vec4 over(vec4 u, vec4 c){ float a=c.a+u.a*(1.-c.a); if(a<1e-5) return vec4(0.); return vec4((c.rgb*c.a+u.rgb*u.a*(1.-c.a))/a,a); }
vec4 samp(int i){ if(i==0) return texture(u0,vUv); if(i==1) return texture(u1,vUv); if(i==2) return texture(u2,vUv); if(i==3) return texture(u3,vUv); if(i==4) return texture(u4,vUv); if(i==5) return texture(u5,vUv); return texture(u6,vUv); }
void main(){ vec4 c=vec4(1.0,1.0,1.0,1.0); for(int i=0;i<7;i++){ if(i>=uCount) break; c=over(c,samp(i)); } o=vec4(c.rgb,1.); }\`;
try{
  const canvas=document.getElementById("c");
  const gl=canvas.getContext("webgl2",{alpha:false,antialias:true,preserveDrawingBuffer:true});
  if(!gl) throw new Error("no webgl2");
  const s3tc=gl.getExtension("WEBGL_compressed_texture_s3tc");
  if(!s3tc) throw new Error("no S3TC");
  // Display-byte space only — never sRGB-sample DXT (would disagree with RGBA gems).
  const formatMap={
    COMPRESSED_RGBA_S3TC_DXT1_EXT: s3tc.COMPRESSED_RGBA_S3TC_DXT1_EXT,
    COMPRESSED_RGB_S3TC_DXT1_EXT: s3tc.COMPRESSED_RGB_S3TC_DXT1_EXT,
    COMPRESSED_RGBA_S3TC_DXT5_EXT: s3tc.COMPRESSED_RGBA_S3TC_DXT5_EXT,
  };
  const p=gl.createProgram();
  gl.attachShader(p,compile(gl,gl.VERTEX_SHADER,vs));
  gl.attachShader(p,compile(gl,gl.FRAGMENT_SHADER,fs));
  gl.linkProgram(p); if(!gl.getProgramParameter(p,gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
  gl.useProgram(p);
  const buf=gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER,buf);
  gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,1,1]),gl.STATIC_DRAW);
  const loc=gl.getAttribLocation(p,"aPos"); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc,2,gl.FLOAT,false,0,0);
  function uploadCompressed(data,formatName,w,h){
    const fmt=formatMap[formatName]; if(!fmt) throw new Error("format "+formatName);
    const t=gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D,t);
    while(gl.getError()!==gl.NO_ERROR){}
    gl.compressedTexImage2D(gl.TEXTURE_2D,0,fmt,w,h,0,data);
    const err=gl.getError(); if(err!==gl.NO_ERROR) throw new Error("compressed err="+err+" "+formatName);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
    return t;
  }
  function uploadImage(img){
    const t=gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D,t);
    // Canvas already Y-flipped to GL/Unity orientation — do not UNPACK_FLIP_Y.
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,0);
    gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,img);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
    return t;
  }
  const textures=[];
  for(const slot of slots){
    if(slot.kind==="s3tc"){
      const data=await loadBin(slot.url);
      textures.push(uploadCompressed(data,slot.format,slot.w,slot.h));
    } else {
      textures.push(uploadImage(await loadImage(slot.url)));
    }
  }
  for(let i=0;i<7;i++){
    const name="u"+i;
    gl.uniform1i(gl.getUniformLocation(p,name), i);
    gl.activeTexture(gl.TEXTURE0+i);
    if(i<textures.length) gl.bindTexture(gl.TEXTURE_2D, textures[i]);
    else {
      const t=gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D,t);
      gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,1,1,0,gl.RGBA,gl.UNSIGNED_BYTE,new Uint8Array([0,0,0,0]));
    }
  }
  gl.uniform1i(gl.getUniformLocation(p,"uCount"), textures.length);
  gl.viewport(0,0,W,H); gl.clearColor(1,1,1,1); gl.clear(gl.COLOR_BUFFER_BIT); gl.disable(gl.BLEND); gl.drawArrays(gl.TRIANGLE_STRIP,0,4);
  const pixels=new Uint8Array(W*H*4);
  gl.readPixels(0,0,W,H,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
  const flipped=new Uint8Array(pixels.length);
  const row=W*4;
  for(let y=0;y<H;y++) flipped.set(pixels.subarray((H-1-y)*row,(H-y)*row), y*row);
  window.__bakeRgba=flipped;
  window.__bakeW=W; window.__bakeH=H;
  window.__bakeOk=true;
  document.title="BAKE_OK";
} catch(e){
  window.__bakeOk=false;
  window.__bakeErr=String(e&&e.message?e.message:e);
  document.title="BAKE_ERR";
  console.error(e);
}
</script></body></html>`;
}

type CdpConn = {
  send: (method: string, params?: object) => Promise<unknown>;
  close: () => void;
};

async function openCdp(wsUrl: string): Promise<CdpConn> {
  const ws = new WebSocket(wsUrl);
  let id = 0;
  const pending = new Map<
    number,
    { resolve: (v: unknown) => void; reject: (e: Error) => void }
  >();
  await new Promise<void>((resolve, reject) => {
    ws.addEventListener("error", () => reject(new Error("cdp websocket error")));
    ws.addEventListener("open", () => resolve());
  });
  ws.addEventListener("message", (ev) => {
    const msg = JSON.parse(String(ev.data)) as {
      id?: number;
      result?: unknown;
      error?: { message?: string };
    };
    if (msg.id == null) return;
    const slot = pending.get(msg.id);
    if (!slot) return;
    pending.delete(msg.id);
    if (msg.error) {
      slot.reject(new Error(msg.error.message ?? "cdp error"));
      return;
    }
    slot.resolve(msg.result);
  });
  const send = (method: string, params?: object) => {
    const msgId = ++id;
    return new Promise<unknown>((res, rej) => {
      pending.set(msgId, { resolve: res, reject: rej });
      ws.send(JSON.stringify({ id: msgId, method, params }));
    });
  };
  await send("Runtime.enable");
  return {
    send,
    close: () => {
      try {
        ws.close();
      } catch {
        /* ignore */
      }
    },
  };
}

async function cdpEvaluate(conn: CdpConn, expression: string): Promise<unknown> {
  const result = (await conn.send("Runtime.evaluate", {
    expression,
    returnByValue: true,
    awaitPromise: true,
  })) as { result?: { value?: unknown; subtype?: string; description?: string } };
  if (result?.result?.subtype === "error") {
    throw new Error(result.result.description ?? "cdp evaluate error");
  }
  return result?.result?.value;
}

async function waitForTitle(
  conn: CdpConn,
  want: RegExp,
  timeoutMs: number,
): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const title = await cdpEvaluate(conn, "document.title");
    if (typeof title === "string" && want.test(title)) return title;
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error("timeout waiting for bake title");
}

export type ClientFaceGpuBaker = {
  bake: (input: ClientFaceGpuBakeInput) => Promise<ClientFaceGpuBakeResult>;
  close: () => void;
};

/**
 * Long-lived Chrome + static server for bulk extract. One process, many faces.
 */
async function freeListenPort(): Promise<number> {
  const probe = createServer();
  await new Promise<void>((resolve, reject) => {
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => resolve());
  });
  const addr = probe.address();
  const p = addr && typeof addr !== "string" ? addr.port : 0;
  await new Promise<void>((resolve) => probe.close(() => resolve()));
  return p;
}

async function openClientFaceGpuBakerOnce(opts?: {
  chromePath?: string;
}): Promise<ClientFaceGpuBaker | null> {
  const chrome = findChrome(opts?.chromePath);
  if (!chrome) return null;

  const root = mkdtempSync(path.join(tmpdir(), "fw-face-bake-root-"));
  const debugPort = await freeListenPort();
  if (!debugPort) return null;
  let server: Server | null = null;
  let child: ChildProcess | null = null;
  let port = 0;

  const cleanup = () => {
    try {
      child?.kill("SIGKILL");
    } catch {
      /* ignore */
    }
    try {
      server?.close();
    } catch {
      /* ignore */
    }
    try {
      rmSync(root, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  };

  try {
    server = createServer((req, res) => {
      const url = new URL(req.url ?? "/", "http://127.0.0.1");
      const rel = decodeURIComponent(url.pathname.slice(1) || "index.html");
      const file = path.join(root, rel);
      if (!file.startsWith(root) || !existsSync(file)) {
        res.writeHead(404);
        res.end("missing");
        return;
      }
      const ext = path.extname(file).toLowerCase();
      const type =
        ext === ".html"
          ? "text/html"
          : ext === ".webp"
            ? "image/webp"
            : "application/octet-stream";
      res.writeHead(200, {
        "Content-Type": type,
        "Cache-Control": "no-store",
      });
      res.end(readFileSync(file));
    });
    await new Promise<void>((resolve, reject) => {
      server!.once("error", reject);
      server!.listen(0, "127.0.0.1", () => resolve());
    });
    const addr = server.address();
    if (!addr || typeof addr === "string") {
      cleanup();
      return null;
    }
    port = addr.port;

    child = spawn(
      chrome,
      [
        `--remote-debugging-port=${debugPort}`,
        "--headless=new",
        "--use-angle=metal",
        "--enable-webgl",
        "--ignore-gpu-blocklist",
        "--no-first-run",
        "--no-default-browser-check",
        "--user-data-dir=" + path.join(root, "chrome-profile"),
        "about:blank",
      ],
      { stdio: "ignore" },
    );

    let versionReady = false;
    for (let i = 0; i < 100; i += 1) {
      if (child.exitCode != null) break;
      try {
        const ver = await fetch(
          `http://127.0.0.1:${debugPort}/json/version`,
        ).then((r) => r.json());
        if (ver) {
          versionReady = true;
          break;
        }
      } catch {
        /* retry */
      }
      await new Promise((r) => setTimeout(r, 50));
    }
    if (!versionReady) {
      if (process.env.FW_FACE_BAKE_DEBUG) {
        console.error(
          "[fw-face-bake] CDP not ready",
          { debugPort, exitCode: child.exitCode },
        );
      }
      cleanup();
      return null;
    }

    const bake = async (
      input: ClientFaceGpuBakeInput,
    ): Promise<ClientFaceGpuBakeResult> => {
      if (!input.layers.picture) {
        return { ok: false, reason: "missing picture S3TC" };
      }
      const job = `job-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const work = path.join(root, job);
      mkdirSync(work, { recursive: true });
      try {
        const L = input.layers;
        const copy = (src: string | undefined, name: string) => {
          if (!src || !existsSync(src)) return;
          writeFileSync(path.join(work, name), readFileSync(src));
        };
        if (L.picture) copy(L.picture.file, path.basename(L.picture.file));
        if (L.frame) copy(L.frame.file, path.basename(L.frame.file));
        if (L.middle) copy(L.middle.file, path.basename(L.middle.file));
        if (L.text) copy(L.text.file, path.basename(L.text.file));
        if (L.frameTop) copy(L.frameTop.file, path.basename(L.frameTop.file));
        if (L.costRing) copy(L.costRing.file, path.basename(L.costRing.file));
        if (L.badge) copy(L.badge.file, path.basename(L.badge.file));

        const relFile = (plate: { file: string } | null | undefined) =>
          plate ? { ...plate, file: path.basename(plate.file) } : null;
        const relS3tc = (plate: S3tcBakePlate | null | undefined) =>
          plate ? { ...plate, file: path.basename(plate.file) } : null;
        writeFileSync(
          path.join(work, "bake.html"),
          bakeHtml({
            width: input.width,
            height: input.height,
            layers: {
              picture: relS3tc(L.picture ?? null),
              frame: relS3tc(L.frame ?? null),
              middle: relS3tc(L.middle ?? null),
              text: relS3tc(L.text ?? null),
              frameTop: isS3tcBakePlate(L.frameTop)
                ? relS3tc(L.frameTop)
                : relFile(L.frameTop),
              costRing: relFile(L.costRing),
              badge: relFile(L.badge),
            },
          }),
        );

        const pages = await fetch(
          `http://127.0.0.1:${debugPort}/json/new?http://127.0.0.1:${port}/${job}/bake.html`,
          { method: "PUT" },
        ).then(
          (r) =>
            r.json() as Promise<{
              webSocketDebuggerUrl?: string;
              id?: string;
            }>,
        );
        const wsUrl = pages.webSocketDebuggerUrl;
        const targetId = pages.id;
        if (!wsUrl) return { ok: false, reason: "no page target" };

        const conn = await openCdp(wsUrl);
        try {
          const title = await waitForTitle(conn, /^BAKE_/, 20000);
          if (title === "BAKE_ERR") {
            const err = await cdpEvaluate(conn, "window.__bakeErr");
            return { ok: false, reason: String(err ?? "bake error") };
          }
          const payload = (await cdpEvaluate(
            conn,
            `(() => {
              const u8 = window.__bakeRgba;
              if (!u8) return null;
              let bin = "";
              const chunk = 0x8000;
              for (let i = 0; i < u8.length; i += chunk) {
                bin += String.fromCharCode.apply(null, u8.subarray(i, i + chunk));
              }
              return { w: window.__bakeW, h: window.__bakeH, b64: btoa(bin) };
            })()`,
          )) as { w: number; h: number; b64: string } | null;
          if (!payload?.b64) return { ok: false, reason: "no bake pixels" };
          const rgba = Buffer.from(payload.b64, "base64");
          mkdirSync(path.dirname(input.destWebp), { recursive: true });
          await writeLosslessRgbaWebp(
            rgba,
            payload.w,
            payload.h,
            input.destWebp,
          );
          return { ok: true };
        } finally {
          conn.close();
          if (targetId) {
            try {
              await fetch(
                `http://127.0.0.1:${debugPort}/json/close/${targetId}`,
              );
            } catch {
              /* ignore */
            }
          }
        }
      } catch (err) {
        return {
          ok: false,
          reason: err instanceof Error ? err.message : String(err),
        };
      } finally {
        try {
          rmSync(work, { recursive: true, force: true });
        } catch {
          /* ignore */
        }
      }
    };

    return { bake, close: cleanup };
  } catch (err) {
    cleanup();
    if (process.env.FW_FACE_BAKE_DEBUG) {
      console.error("[fw-face-bake] open failed", err);
    }
    return null;
  }
}

/**
 * Long-lived Chrome + static server for bulk extract. Retries a few times —
 * a stale debugging port / slow CDP boot otherwise forces CPU aplats.
 */
export async function openClientFaceGpuBaker(opts?: {
  chromePath?: string;
}): Promise<ClientFaceGpuBaker | null> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const baker = await openClientFaceGpuBakerOnce(opts);
    if (baker) return baker;
    await new Promise((r) => setTimeout(r, 250 * (attempt + 1)));
  }
  return null;
}

/** One-shot bake (opens Chrome, bakes once, closes). Prefer the session API. */
export async function bakeClientFaceS3tcGpu(
  input: ClientFaceGpuBakeInput,
): Promise<ClientFaceGpuBakeResult> {
  const baker = await openClientFaceGpuBaker();
  if (!baker) return { ok: false, reason: "chrome / CDP unavailable" };
  try {
    return await baker.bake(input);
  } finally {
    baker.close();
  }
}

export function chromeAvailableForFaceBake(): boolean {
  return findChrome() != null;
}
