// `romanizr` ships its declarations under `cjs/*.d.ts`, but its package.json
// `exports` map only points the `import` condition at an untyped `.mjs` entry,
// so `moduleResolution: "bundler"` can't pick the types up. Mirror the real
// signatures here (see node_modules/romanizr/cjs/*.d.ts) to restore type safety.
declare module "romanizr" {
  export function deromanize(str: string): number;
  export function deromanizeText(str: string): string;
  export function romanize(num: number): string;
  export function romanizeText(str: string): string;
  export function matchDecimals(str: string): RegExpExecArray[];
  export function matchRomans(str: string): RegExpExecArray[];
}
