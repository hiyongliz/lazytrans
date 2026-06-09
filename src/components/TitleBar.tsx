import type { MouseEvent, ReactElement } from 'react'
import { ChevronDown, Clock, Languages, Settings, X } from 'lucide-react'

import type { TranslationState, TranslateDirection } from '@/lib/types'
import { displayDirection } from '@/lib/app-behavior'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface TitleBarProps {
  status: TranslationState['status']
  statusLabel: string
  manualDirection: TranslateDirection
  primaryDirections: readonly TranslateDirection[]
  targetLanguages: readonly TranslateDirection[]
  isLangPickerOpen: boolean
  isHistoryOpen: boolean
  isSettingsOpen: boolean
  onStartDrag: (event: MouseEvent<HTMLElement>) => void | Promise<void>
  onClose: (event?: MouseEvent<HTMLButtonElement>) => void
  onToggleLangPicker: () => void
  onCloseLangPicker: () => void
  onSelectDirection: (direction: TranslateDirection) => void | Promise<void>
  onToggleHistory: () => void
  onToggleSettings: () => void
}

const DOT_TONE: Record<TranslationState['status'], string> = {
  idle: 'bg-muted-foreground/40',
  loading: 'bg-amber-500 animate-pulse',
  success: 'bg-primary',
  empty: 'bg-muted-foreground/40',
  error: 'bg-destructive',
  cancelled: 'bg-amber-500/60'
}

export function TitleBar({
  status,
  statusLabel,
  manualDirection,
  primaryDirections,
  targetLanguages,
  isLangPickerOpen,
  isHistoryOpen,
  isSettingsOpen,
  onStartDrag,
  onClose,
  onToggleLangPicker,
  onCloseLangPicker,
  onSelectDirection,
  onToggleHistory,
  onToggleSettings
}: TitleBarProps): ReactElement {
  return (
    <header
      data-tauri-drag-region
      onMouseDown={(event) => void onStartDrag(event)}
      className="drag-region grid h-11 shrink-0 grid-cols-[auto_1fr_auto] items-center gap-2 border-b px-2"
    >
      <div className="no-drag flex items-center gap-0.5">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={onClose}
          aria-label="关闭"
          title="关闭"
        >
          <X className="h-4 w-4" />
        </Button>
        <div className="relative">
          <Button
            type="button"
            variant={manualDirection === 'auto' ? 'ghost' : 'secondary'}
            size="sm"
            className="h-7 gap-1 px-2 text-xs"
            onClick={onToggleLangPicker}
            aria-label="选择翻译目标"
            title={`翻译目标：${displayDirection(manualDirection)}`}
          >
            <Languages className="h-3.5 w-3.5" />
            <span>{displayDirection(manualDirection)}</span>
            <ChevronDown className="h-3 w-3 shrink-0" />
          </Button>
          {isLangPickerOpen && (
            <div
              className="absolute left-0 top-9 z-40 w-44 overflow-hidden rounded-md border bg-popover text-popover-foreground shadow-md"
              onMouseLeave={onCloseLangPicker}
            >
              <div className="flex flex-col">
                {primaryDirections.map((dir) => (
                  <button
                    key={dir}
                    type="button"
                    className={cn(
                      'px-3 py-1.5 text-left text-xs hover:bg-accent',
                      dir === manualDirection && 'font-medium text-primary'
                    )}
                    onClick={() => void onSelectDirection(dir)}
                  >
                    {displayDirection(dir)}
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-2 border-t">
                {targetLanguages.map((dir) => (
                  <button
                    key={dir}
                    type="button"
                    className={cn(
                      'px-3 py-1.5 text-left text-xs hover:bg-accent',
                      dir === manualDirection && 'font-medium text-primary'
                    )}
                    onClick={() => void onSelectDirection(dir)}
                  >
                    {displayDirection(dir)}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="pointer-events-none flex min-w-0 items-center justify-center gap-2">
        <span className={cn('inline-block h-1.5 w-1.5 rounded-full', DOT_TONE[status])} aria-hidden />
        <span className="truncate text-xs text-muted-foreground">{statusLabel}</span>
      </div>

      <div className="no-drag flex items-center justify-end gap-0.5">
        <Button
          type="button"
          variant={isHistoryOpen ? 'secondary' : 'ghost'}
          size="icon"
          className="h-7 w-7"
          onClick={onToggleHistory}
          aria-label="历史记录"
          title="历史记录"
        >
          <Clock className="h-3.5 w-3.5" />
        </Button>
        <Button
          type="button"
          variant={isSettingsOpen ? 'secondary' : 'ghost'}
          size="icon"
          className="h-7 w-7"
          onClick={onToggleSettings}
          aria-label="设置"
          title="设置"
        >
          <Settings className="h-4 w-4" />
        </Button>
      </div>
    </header>
  )
}
