import type { KeyboardEvent as ReactKeyboardEvent, ReactElement, ReactNode, RefObject } from 'react'
import { ArrowRightLeft, Check, ChevronDown, Keyboard, Loader2, Monitor, Moon, Sun } from 'lucide-react'

import type { ApiSettings, Preferences, PromptStyle, ThemePreference, TranslateDirection } from '@/lib/types'
import { PROVIDER_PRESETS, findProviderByBaseUrl } from '@/lib/providers'
import { displayPromptStyle, displayTheme } from '@/lib/app-behavior'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

type SettingsStatus =
  | 'idle'
  | 'loading'
  | 'testing'
  | 'saved'
  | 'tested'
  | 'preset-applied'
  | 'error'

interface SettingsPanelProps {
  preferences: Preferences
  settingsDraft: ApiSettings
  settingsStatus: SettingsStatus
  settingsMessage: string
  settingsBusy: boolean
  shortcutLabel: string
  promptStyleOptions: readonly PromptStyle[]
  themeOptions: readonly ThemePreference[]
  apiKeyRef: RefObject<HTMLInputElement | null>
  isThemePickerOpen: boolean
  isRecordingShortcut: boolean
  onToggleThemePicker: () => void
  onPickTheme: (theme: ThemePreference) => void | Promise<void>
  onSelectPromptStyle: (style: PromptStyle) => void | Promise<void>
  onToggleShortcutRecorder: () => void
  onShortcutRecord: (event: ReactKeyboardEvent<HTMLButtonElement>) => void
  onResetShortcut: () => void | Promise<void>
  onToggleAutoHide: () => void | Promise<void>
  onApplyProviderPreset: (presetId: string) => void
  onUpdateSettingsDraft: (key: keyof ApiSettings, value: string) => void
  onTestApiSettings: () => void | Promise<void>
  onSaveApiSettings: () => void | Promise<void>
}

export function SettingsPanel({
  preferences,
  settingsDraft,
  settingsStatus,
  settingsMessage,
  settingsBusy,
  shortcutLabel,
  promptStyleOptions,
  themeOptions,
  apiKeyRef,
  isThemePickerOpen,
  isRecordingShortcut,
  onToggleThemePicker,
  onPickTheme,
  onSelectPromptStyle,
  onToggleShortcutRecorder,
  onShortcutRecord,
  onResetShortcut,
  onToggleAutoHide,
  onApplyProviderPreset,
  onUpdateSettingsDraft,
  onTestApiSettings,
  onSaveApiSettings
}: SettingsPanelProps): ReactElement {
  const activeProviderId = findProviderByBaseUrl(settingsDraft.baseUrl)?.id

  return (
    <div
      className="no-drag absolute left-2 right-2 top-12 z-40 max-h-[calc(100%-3.5rem)] overflow-y-auto rounded-md border bg-card/95 px-3 py-3 shadow-lg backdrop-blur"
      role="dialog"
      aria-label="设置"
    >
      <form
        className="space-y-2"
        onSubmit={(event) => {
          event.preventDefault()
          void onSaveApiSettings()
        }}
      >
        <SettingsSectionTitle>通用</SettingsSectionTitle>

        <SettingRow label="主题">
          <div className="relative">
            <Button
              type="button"
              variant={isThemePickerOpen ? 'secondary' : 'ghost'}
              size="sm"
              className="h-7 gap-1 px-2 text-xs"
              onClick={onToggleThemePicker}
              aria-label="选择主题"
              title={`主题：${displayTheme(preferences.theme)}`}
            >
              <ThemeIcon theme={preferences.theme} className="h-3.5 w-3.5" />
              <span>{displayTheme(preferences.theme)}</span>
              <ChevronDown className="h-3 w-3 shrink-0" />
            </Button>
            {isThemePickerOpen && (
              <div
                className="absolute right-0 top-9 z-20 min-w-[112px] rounded-md border bg-popover text-popover-foreground shadow-md"
                onMouseLeave={onToggleThemePicker}
              >
                {themeOptions.map((theme) => (
                  <button
                    key={theme}
                    type="button"
                    className={cn(
                      'flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs hover:bg-accent',
                      theme === preferences.theme && 'font-medium text-primary'
                    )}
                    onClick={() => void onPickTheme(theme)}
                  >
                    <ThemeIcon theme={theme} className="h-3.5 w-3.5" />
                    <span>{displayTheme(theme)}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </SettingRow>

        <SettingRow label="风格">
          {promptStyleOptions.map((style) => (
            <Button
              key={style}
              type="button"
              variant={style === preferences.promptStyle ? 'secondary' : 'ghost'}
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={() => void onSelectPromptStyle(style)}
            >
              {displayPromptStyle(style)}
            </Button>
          ))}
        </SettingRow>

        <SettingRow label="快捷键">
          <Button
            type="button"
            variant={isRecordingShortcut ? 'default' : 'secondary'}
            size="sm"
            className={cn(
              'h-7 gap-1 px-2 text-xs',
              isRecordingShortcut && 'ring-2 ring-primary ring-offset-1 ring-offset-background'
            )}
            onClick={onToggleShortcutRecorder}
            onKeyDown={isRecordingShortcut ? onShortcutRecord : undefined}
            title="点击后按下想要的组合键"
          >
            {isRecordingShortcut ? (
              <>
                <span className="h-2 w-2 animate-pulse rounded-full bg-primary-foreground" />
                按下组合键…
              </>
            ) : (
              <>
                <Keyboard className="h-3.5 w-3.5" />
                {shortcutLabel}
              </>
            )}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs text-muted-foreground"
            onClick={() => void onResetShortcut()}
            title="恢复默认快捷键"
          >
            默认
          </Button>
        </SettingRow>

        <SettingRow label="失焦隐藏">
          <button
            type="button"
            role="switch"
            aria-checked={preferences.autoHideOnBlur}
            aria-label="失焦自动隐藏"
            onClick={() => void onToggleAutoHide()}
            className={cn(
              'relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors',
              preferences.autoHideOnBlur ? 'bg-primary' : 'bg-muted'
            )}
          >
            <span
              className={cn(
                'inline-block h-4 w-4 transform rounded-full bg-background shadow transition-transform',
                preferences.autoHideOnBlur ? 'translate-x-4' : 'translate-x-0.5'
              )}
            />
          </button>
        </SettingRow>

        <div className="border-t pt-1" />
        <SettingsSectionTitle>API</SettingsSectionTitle>

        <SettingRow label="预设" align="start">
          {PROVIDER_PRESETS.map((preset) => (
            <Button
              key={preset.id}
              type="button"
              variant={activeProviderId === preset.id ? 'secondary' : 'ghost'}
              size="sm"
              className="h-6 gap-1 px-2 text-xs"
              onClick={() => onApplyProviderPreset(preset.id)}
              title={preset.hint ?? preset.baseUrl}
            >
              {preset.name}
              {preset.hint && (
                <span className="rounded bg-muted px-1 py-0 text-[10px] text-muted-foreground">
                  本地
                </span>
              )}
            </Button>
          ))}
        </SettingRow>

        <SettingsField label="Key">
          <Input
            ref={apiKeyRef}
            type="password"
            value={settingsDraft.apiKey}
            placeholder="sk-..."
            autoComplete="off"
            onChange={(event) => onUpdateSettingsDraft('apiKey', event.target.value)}
          />
        </SettingsField>

        <SettingsField label="URL">
          <Input
            type="url"
            value={settingsDraft.baseUrl}
            placeholder="默认 https://api.openai.com/v1"
            onChange={(event) => onUpdateSettingsDraft('baseUrl', event.target.value)}
          />
        </SettingsField>

        <SettingsField label="Model">
          <Input
            type="text"
            value={settingsDraft.model}
            placeholder="默认 gpt-4.1-mini"
            onChange={(event) => onUpdateSettingsDraft('model', event.target.value)}
          />
        </SettingsField>

        <div className="flex items-center justify-between pt-1">
          <span
            className={cn(
              'text-xs',
              settingsStatus === 'error'
                ? 'text-destructive'
                : settingsStatus === 'saved' ||
                    settingsStatus === 'tested' ||
                    settingsStatus === 'preset-applied'
                  ? 'text-primary'
                  : 'text-muted-foreground'
            )}
          >
            {settingsMessage || ' '}
          </span>
          <div className="flex items-center gap-1.5">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={settingsBusy}
              onClick={() => void onTestApiSettings()}
            >
              {settingsStatus === 'testing' ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <ArrowRightLeft className="h-4 w-4" />
              )}
              测试
            </Button>
            <Button type="submit" size="sm" disabled={settingsBusy}>
              {settingsStatus === 'loading' ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Check className="h-4 w-4" />
              )}
              保存
            </Button>
          </div>
        </div>
      </form>
    </div>
  )
}

interface SettingsFieldProps {
  label: string
  children: ReactElement
}

function SettingsField({ label, children }: SettingsFieldProps): ReactElement {
  return (
    <label className="grid grid-cols-[68px_1fr] items-center gap-2">
      <span className="text-xs uppercase tracking-wide text-muted-foreground">{label}</span>
      {children}
    </label>
  )
}

interface SettingRowProps {
  label: string
  align?: 'center' | 'start'
  children: ReactNode
}

function SettingRow({ label, align = 'center', children }: SettingRowProps): ReactElement {
  return (
    <div
      className={cn(
        'grid grid-cols-[68px_1fr] gap-2',
        align === 'start' ? 'items-start' : 'items-center'
      )}
    >
      <span
        className={cn(
          'text-xs text-muted-foreground',
          align === 'start' && 'pt-1.5'
        )}
      >
        {label}
      </span>
      <div className="flex min-w-0 flex-wrap items-center justify-end gap-1">{children}</div>
    </div>
  )
}

function SettingsSectionTitle({ children }: { children: ReactNode }): ReactElement {
  return (
    <p className="pt-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
      {children}
    </p>
  )
}

interface ThemeIconProps {
  theme: ThemePreference
  className?: string
}

function ThemeIcon({ theme, className }: ThemeIconProps): ReactElement {
  if (theme === 'light') return <Sun className={className} />
  if (theme === 'dark') return <Moon className={className} />
  return <Monitor className={className} />
}
