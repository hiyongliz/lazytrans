import { describe, expect, it, vi } from 'vitest'

import { resolveTrayIconPath } from './tray-icon-path'

describe('resolveTrayIconPath', () => {
  it('returns the first candidate that exists', () => {
    const fileExists = vi.fn((path: string) => path === '/exists/here.png')
    const result = resolveTrayIconPath(
      ['/missing.png', '/exists/here.png', '/other.png'],
      fileExists
    )
    expect(result).toBe('/exists/here.png')
  })

  it('returns an empty string when no candidate exists', () => {
    const fileExists = vi.fn(() => false)
    const result = resolveTrayIconPath(['/a.png', '/b.png'], fileExists)
    expect(result).toBe('')
  })

  it('skips falsy candidates without calling fileExists on them', () => {
    const fileExists = vi.fn((path: string) => path === '/exists.png')
    const result = resolveTrayIconPath(
      ['', '/exists.png'],
      fileExists
    )
    expect(result).toBe('/exists.png')
    expect(fileExists).not.toHaveBeenCalledWith('')
  })
})
