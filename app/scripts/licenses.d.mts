// Types for licenses.mjs, which stays plain JavaScript so `node` can run it
// during the build without a TypeScript step.
export interface LicenseException {
  license: string
  file: string
}
export const ALLOWED_LICENSES: Set<string>
export const LICENSE_EXCEPTIONS: Record<string, LicenseException>
export function isAllowedLicense(expression: unknown): boolean
export function licenseFilesIn(dir: string): string[]
export function productionPackageDirs(appDir: string): string[]
export function bundledPackageDirs(recordDir: string): string[]
export function collectComponents(
  dirs: string[],
  exceptions?: Record<string, LicenseException>,
  baseDir?: string
): {
  components: { name: string; version: string; license: unknown; files: string[] }[]
  problems: string[]
}
