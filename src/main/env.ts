import { existsSync, readFileSync } from 'node:fs'

export function loadDotEnvFile(
  path = '.env',
  env: NodeJS.ProcessEnv = process.env
): void {
  if (!existsSync(path)) {
    return
  }

  const values = parseDotEnv(readFileSync(path, 'utf8'))
  for (const [key, value] of Object.entries(values)) {
    if (env[key] === undefined) {
      env[key] = value
    }
  }
}

export function loadDotEnvFiles(
  paths: string[],
  env: NodeJS.ProcessEnv = process.env
): void {
  for (const path of paths) {
    loadDotEnvFile(path, env)
  }
}

export function parseDotEnv(content: string): Record<string, string> {
  const values: Record<string, string> = {}

  for (const line of content.split(/\r?\n/)) {
    const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)?\s*$/)
    if (!match) {
      continue
    }

    values[match[1]] = parseDotEnvValue(match[2] ?? '')
  }

  return values
}

function parseDotEnvValue(value: string): string {
  const trimmed = value.trim()
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1)
  }

  return trimmed
}
