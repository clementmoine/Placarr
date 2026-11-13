/**
 * Unity GLES fragment → body a WebGL2 program can compile.
 *
 * Both dumps share the same steps: drop the `#ifdef FRAGMENT` guard and turn
 * off HLSLCC uniform-location defines. Some bundles also embed control bytes;
 * pass `stripControlChars` when those bytes must not reach the compiler.
 * Shader Graph sources keep them (`stripControlChars: false`) so punctuation
 * in the dump is left intact.
 */

const FRAGMENT_GUARD = "#ifdef FRAGMENT";

export type WebglFragmentOptions = {
  /**
   * Drop bytes below 0x20 other than newline and tab.
   * Default true — matches card-shader dumps that pad with control characters.
   */
  stripControlChars?: boolean;
};

function disableUnityLocationDefines(frag: string): string {
  return frag
    .replace(
      "#define HLSLCC_ENABLE_UNIFORM_BUFFERS 1",
      "#define HLSLCC_ENABLE_UNIFORM_BUFFERS 0",
    )
    .replace(
      "#define UNITY_SUPPORTS_UNIFORM_LOCATION 1",
      "#define UNITY_SUPPORTS_UNIFORM_LOCATION 0",
    );
}

function dropControlChars(frag: string): string {
  return [...frag]
    .filter((ch) => ch === "\n" || ch === "\t" || ch.charCodeAt(0) >= 32)
    .join("");
}

/** Strip a Unity fragment for WebGL2. */
export function toWebgl2Fragment(
  src: string,
  options?: WebglFragmentOptions,
): string {
  const strip = options?.stripControlChars !== false;
  if (!strip) {
    const at = src.indexOf(FRAGMENT_GUARD);
    let frag = src.slice(at + FRAGMENT_GUARD.length);
    frag = frag.slice(0, frag.lastIndexOf("#endif")).replace(/^\n/, "");
    return disableUnityLocationDefines(frag);
  }

  let frag: string;
  const at = src.indexOf(FRAGMENT_GUARD);
  if (at >= 0) {
    frag = src.slice(at + FRAGMENT_GUARD.length);
    const end = frag.lastIndexOf("#endif");
    if (end >= 0) frag = frag.slice(0, end);
    frag = frag.replace(/^\n/, "");
  } else {
    frag = src;
    const stripped = frag.replace(/[\x00\x17\r\n\t ]+$/, "");
    if (stripped.endsWith("#endif")) {
      frag = stripped.slice(0, stripped.lastIndexOf("#endif"));
    }
  }
  return disableUnityLocationDefines(dropControlChars(frag)).trimEnd() + "\n";
}
