export interface TranslateCacheKey {
  text: string
  model: string
  baseUrl: string
  direction?: string
  kind?: string
}

const DEFAULT_CAPACITY = 100

export class TranslateCache {
  private readonly capacity: number
  private readonly entries: Map<string, string>

  constructor(capacity: number = DEFAULT_CAPACITY) {
    if (capacity <= 0) {
      throw new Error('TranslateCache capacity must be positive')
    }

    this.capacity = capacity
    this.entries = new Map()
  }

  get(key: TranslateCacheKey): string | undefined {
    const cacheKey = serializeKey(key)
    const value = this.entries.get(cacheKey)
    if (value === undefined) {
      return undefined
    }

    // Refresh recency by re-inserting at the tail.
    this.entries.delete(cacheKey)
    this.entries.set(cacheKey, value)
    return value
  }

  set(key: TranslateCacheKey, value: string): void {
    const cacheKey = serializeKey(key)
    if (this.entries.has(cacheKey)) {
      this.entries.delete(cacheKey)
    }
    this.entries.set(cacheKey, value)

    while (this.entries.size > this.capacity) {
      const oldestKey = this.entries.keys().next().value
      if (oldestKey === undefined) {
        break
      }
      this.entries.delete(oldestKey)
    }
  }

  clear(): void {
    this.entries.clear()
  }

  get size(): number {
    return this.entries.size
  }
}

function serializeKey(key: TranslateCacheKey): string {
  return [
    key.kind ?? 'translation',
    key.model,
    key.baseUrl,
    key.direction ?? 'auto',
    key.text
  ].join('\t')
}

export const translateCache = new TranslateCache()
