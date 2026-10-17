// Types for ico.mjs, which stays plain JavaScript so Electron can run the
// icon script without a TypeScript step.
export function pngSize(png: Buffer): { width: number; height: number }
export function buildIco(pngs: Buffer[]): Buffer
