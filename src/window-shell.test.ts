import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('window shell', () => {
  it('does not leave a transparent outer padding around the floating window', () => {
    const app = readFileSync(resolve('src/App.tsx'), 'utf8')

    expect(app).not.toContain('<main className="h-full w-full p-2">')
  })
})
