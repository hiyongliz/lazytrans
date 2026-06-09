import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('renderer html entry', () => {
  it('loads the React bootstrap entry instead of the App component module', () => {
    const html = readFileSync(resolve('index.html'), 'utf8')

    expect(html).toContain('src="/src/main.tsx"')
    expect(html).not.toContain('src="/src/App.tsx"')
  })
})
