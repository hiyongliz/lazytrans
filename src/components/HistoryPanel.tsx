import { useEffect, useMemo, useRef, useState, type ReactElement } from 'react'
import { Check, Copy, Download, Search, Trash2, X } from 'lucide-react'

import type { HistoryEntry } from '@/lib/types'
import { displayDirection, filterHistory, formatHistoryTimestamp } from '@/lib/app-behavior'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'

interface HistoryPanelProps {
  entries: readonly HistoryEntry[]
  query: string
  onQueryChange: (next: string) => void
  onReuse: (entry: HistoryEntry) => void
  onCopy: (entry: HistoryEntry) => void | Promise<void>
  onRemove: (entry: HistoryEntry) => void | Promise<void>
  onClear: () => void | Promise<void>
  clearArmed: boolean
  onArmClear: () => void
  onCancelClear: () => void
  onExport: (format: 'json' | 'markdown') => void | Promise<void>
  exportMessage: string
  onClose: () => void
}

export function HistoryPanel({
  entries,
  query,
  onQueryChange,
  onReuse,
  onCopy,
  onRemove,
  onClear,
  clearArmed,
  onArmClear,
  onCancelClear,
  onExport,
  exportMessage,
  onClose
}: HistoryPanelProps): ReactElement {
  const filtered = useMemo(() => filterHistory(entries, query), [entries, query])
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const copyResetRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (copyResetRef.current) clearTimeout(copyResetRef.current)
    }
  }, [])

  const handleCopy = (entry: HistoryEntry): void => {
    void Promise.resolve(onCopy(entry)).then(() => {
      setCopiedId(entry.id)
      if (copyResetRef.current) clearTimeout(copyResetRef.current)
      copyResetRef.current = setTimeout(() => setCopiedId(null), 1200)
    })
  }

  return (
    <div className="no-drag flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-2 border-b px-3 py-2">
        <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <Input
          type="search"
          value={query}
          placeholder={`搜索 ${entries.length} 条历史…`}
          className="h-7 border-0 bg-transparent px-0 text-xs shadow-none focus-visible:ring-0"
          onChange={(event) => onQueryChange(event.target.value)}
        />
        {clearArmed ? (
          <>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              className="h-7 gap-1 px-2 text-xs"
              onClick={() => void onClear()}
            >
              <Trash2 className="h-3.5 w-3.5" />
              确认清空
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={onCancelClear}
            >
              取消
            </Button>
          </>
        ) : (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 gap-1 px-2 text-xs text-muted-foreground"
            onClick={onArmClear}
            disabled={entries.length === 0}
            title="清空全部历史"
          >
            <Trash2 className="h-3.5 w-3.5" />
            清空
          </Button>
        )}
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={onClose}
          aria-label="关闭历史面板"
          title="收起"
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>
      {(entries.length > 0 || exportMessage) && (
        <div className="flex items-center gap-2 border-b px-3 py-1.5">
          <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
            导出
          </span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-6 gap-1 px-2 text-[11px]"
            disabled={entries.length === 0}
            onClick={() => void onExport('json')}
          >
            <Download className="h-3 w-3" />
            JSON
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-6 gap-1 px-2 text-[11px]"
            disabled={entries.length === 0}
            onClick={() => void onExport('markdown')}
          >
            <Download className="h-3 w-3" />
            Markdown
          </Button>
          {exportMessage && (
            <span className="min-w-0 flex-1 truncate text-[10px] text-muted-foreground">
              {exportMessage}
            </span>
          )}
        </div>
      )}
      <ScrollArea className="min-h-0 flex-1">
        {filtered.length === 0 ? (
          <p className="px-3 py-6 text-center text-xs text-muted-foreground">
            {entries.length === 0 ? '还没有历史记录' : '没有匹配的记录'}
          </p>
        ) : (
          <ul className="divide-y">
            {filtered.map((entry) => (
              <li
                key={entry.id}
                className="group cursor-pointer px-3 py-2 hover:bg-accent/60 focus-within:bg-accent/60"
                role="button"
                tabIndex={0}
                onClick={() => onReuse(entry)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault()
                    onReuse(entry)
                  }
                }}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-foreground">{entry.sourceText}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {entry.translatedText}
                    </p>
                    <p className="mt-0.5 truncate text-[10px] uppercase tracking-wide text-muted-foreground/70">
                      <span className="mr-1 rounded bg-muted px-1 py-px text-muted-foreground">
                        {displayDirection(entry.direction)}
                      </span>
                      {formatHistoryTimestamp(entry.createdAt)} · {entry.model}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-0.5 text-muted-foreground/60 transition-opacity group-hover:text-foreground">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      onClick={(event) => {
                        event.stopPropagation()
                        handleCopy(entry)
                      }}
                      aria-label={copiedId === entry.id ? '已复制译文' : '复制译文'}
                      title={copiedId === entry.id ? '已复制' : '复制译文'}
                    >
                      {copiedId === entry.id ? (
                        <Check className="h-3 w-3 text-primary" />
                      ) : (
                        <Copy className="h-3 w-3" />
                      )}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 text-muted-foreground hover:text-destructive"
                      onClick={(event) => {
                        event.stopPropagation()
                        void onRemove(entry)
                      }}
                      aria-label="删除该条"
                      title="删除"
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </ScrollArea>
    </div>
  )
}
