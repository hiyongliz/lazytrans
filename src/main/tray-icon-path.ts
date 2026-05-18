import { existsSync } from 'node:fs'

export function resolveTrayIconPath(
  candidates: readonly string[],
  fileExists: (path: string) => boolean = existsSync
): string {
  for (const candidate of candidates) {
    if (candidate && fileExists(candidate)) {
      return candidate
    }
  }
  return ''
}
