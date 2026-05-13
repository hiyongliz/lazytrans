import { describe, expect, it } from 'vitest'

import { TranslateCache } from './translate-cache'

describe('translate cache', () => {
  it('returns undefined for unseen keys', () => {
    const cache = new TranslateCache(3)
    expect(
      cache.get({ text: 'hello', model: 'gpt', baseUrl: 'https://api/v1' })
    ).toBeUndefined()
  })

  it('round-trips a value through set and get', () => {
    const cache = new TranslateCache(3)
    cache.set({ text: 'hello', model: 'gpt', baseUrl: 'https://api/v1' }, '你好')
    expect(
      cache.get({ text: 'hello', model: 'gpt', baseUrl: 'https://api/v1' })
    ).toBe('你好')
  })

  it('distinguishes keys by model and baseUrl', () => {
    const cache = new TranslateCache(5)
    cache.set({ text: 'hello', model: 'a', baseUrl: 'u' }, '1')
    cache.set({ text: 'hello', model: 'b', baseUrl: 'u' }, '2')
    cache.set({ text: 'hello', model: 'a', baseUrl: 'v' }, '3')

    expect(cache.get({ text: 'hello', model: 'a', baseUrl: 'u' })).toBe('1')
    expect(cache.get({ text: 'hello', model: 'b', baseUrl: 'u' })).toBe('2')
    expect(cache.get({ text: 'hello', model: 'a', baseUrl: 'v' })).toBe('3')
  })

  it('evicts the oldest entry when capacity is exceeded', () => {
    const cache = new TranslateCache(2)
    cache.set({ text: 'a', model: 'gpt', baseUrl: 'u' }, '1')
    cache.set({ text: 'b', model: 'gpt', baseUrl: 'u' }, '2')
    cache.set({ text: 'c', model: 'gpt', baseUrl: 'u' }, '3')

    expect(cache.get({ text: 'a', model: 'gpt', baseUrl: 'u' })).toBeUndefined()
    expect(cache.get({ text: 'b', model: 'gpt', baseUrl: 'u' })).toBe('2')
    expect(cache.get({ text: 'c', model: 'gpt', baseUrl: 'u' })).toBe('3')
  })

  it('refreshes recency on get so the most recently accessed entry survives eviction', () => {
    const cache = new TranslateCache(2)
    cache.set({ text: 'a', model: 'gpt', baseUrl: 'u' }, '1')
    cache.set({ text: 'b', model: 'gpt', baseUrl: 'u' }, '2')

    cache.get({ text: 'a', model: 'gpt', baseUrl: 'u' })

    cache.set({ text: 'c', model: 'gpt', baseUrl: 'u' }, '3')

    expect(cache.get({ text: 'a', model: 'gpt', baseUrl: 'u' })).toBe('1')
    expect(cache.get({ text: 'b', model: 'gpt', baseUrl: 'u' })).toBeUndefined()
    expect(cache.get({ text: 'c', model: 'gpt', baseUrl: 'u' })).toBe('3')
  })

  it('overwrites an existing key in place without growing size', () => {
    const cache = new TranslateCache(2)
    cache.set({ text: 'a', model: 'gpt', baseUrl: 'u' }, '1')
    cache.set({ text: 'a', model: 'gpt', baseUrl: 'u' }, '1-updated')

    expect(cache.size).toBe(1)
    expect(cache.get({ text: 'a', model: 'gpt', baseUrl: 'u' })).toBe(
      '1-updated'
    )
  })

  it('rejects non-positive capacity', () => {
    expect(() => new TranslateCache(0)).toThrow()
    expect(() => new TranslateCache(-1)).toThrow()
  })

  it('clears all entries', () => {
    const cache = new TranslateCache(2)
    cache.set({ text: 'a', model: 'gpt', baseUrl: 'u' }, '1')
    cache.clear()

    expect(cache.size).toBe(0)
    expect(cache.get({ text: 'a', model: 'gpt', baseUrl: 'u' })).toBeUndefined()
  })
})
