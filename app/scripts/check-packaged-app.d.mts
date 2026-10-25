// Types for check-packaged-app.mjs, which stays plain JavaScript so
// electron-builder can load it as a hook without a TypeScript step.
export function sourceFilesIn(paths: string[]): string[]
export default function checkPackagedApp(context: { appOutDir: string }): void
