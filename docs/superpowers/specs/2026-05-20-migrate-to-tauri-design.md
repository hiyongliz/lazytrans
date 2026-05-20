# LazyTrans 迁移到 Tauri 2 设计

日期：2026-05-20

## 背景与现状

LazyTrans 当前是 Electron 应用，启动后占用：

| 进程 | RSS |
|---|---|
| Main | 114 MB |
| Renderer | 93 MB |
| GPU Helper | 47 MB |
| Network Service | 22 MB |
| **合计** | **≈ 277 MB** |

打包产物 `LazyTrans.app`：**287 MB**，其中 `Contents/Frameworks/` 276 MB（Chromium + Node runtime），业务代码（`Contents/Resources/`）仅 11 MB。

对一个"选中即翻译"的菜单栏小工具，这个开销是 Electron 的"出厂税"，靠裁剪 locales / `compression: maximum` 等小修补最多省 30 MB，无法量级下降。

## 目标

- 将打包体积压到 **< 30 MB**
- 将运行时常驻内存压到 **< 100 MB**（理想 < 70 MB）
- **行为与 UI 1:1 复刻**当前 Electron 版本
- 维持 macOS-only 支持范围，不扩平台

## 非目标

- 不扩展到 Windows / Linux
- 不重构现有 React UI（App.tsx 原样复用）
- 不引入新功能
- 不替换前端框架

## 决策汇总

| 维度 | 决策 |
|---|---|
| 框架 | **Tauri 2**（Rust 主进程 + WebView） |
| 平台 | macOS only |
| 前端 | **原样复用** React 19 + Tailwind + shadcn/ui + App.tsx；只新写 `lazy-trans.ts` 桥 |
| 仓库 | 同仓库 `tauri/` 子目录并存，跑通后提到根目录、删除老 Electron 代码 |
| 原生能力 | **全部 Rust/Swift 原生**（accessibility-sys + core-graphics + objc2），不再走 osascript |
| 切片策略 | Spike-first：先验最不确定的"非激活浮窗"和"AX 读取"，再走垂直切片 |

## 仓库结构

```
lazytrans/
├── src/                       # 老 Electron 代码（保留可发版，迁移完成后删）
├── out/                       # Electron 构建产物
├── package.json               # Electron 入口，保留
├── electron.vite.config.ts    # 保留
├── tauri/                     # 新增：Tauri 项目根
│   ├── src-tauri/             # Rust 主进程
│   │   ├── Cargo.toml
│   │   ├── tauri.conf.json
│   │   ├── build.rs
│   │   └── src/
│   │       ├── main.rs        # 入口、setup、命令注册
│   │       ├── commands.rs    # #[tauri::command] 集中定义
│   │       ├── errors.rs      # AppError + serde 序列化
│   │       ├── env.rs         # .env 多路径加载
│   │       ├── translator/    # 翻译 + SSE + 缓存 + 音标
│   │       ├── selection/     # AX + 模拟 ⌘C
│   │       ├── tray.rs        # 托盘菜单 + template image
│   │       ├── shortcuts.rs   # 全局快捷键 + fallback
│   │       ├── window.rs      # 浮窗创建/显示/跟手定位
│   │       ├── window_state.rs # bounds 防抖持久化
│   │       └── store/         # history / preferences / settings
│   ├── src/                   # 前端（从 src/renderer 复制）
│   │   ├── App.tsx            # 原样
│   │   ├── lib/lazy-trans.ts  # 新写：替代 preload，封装 invoke/listen
│   │   ├── lib/types.ts       # 手写与 Rust struct 对齐
│   │   └── ...                # 其余原样
│   ├── package.json
│   ├── vite.config.ts
│   ├── tsconfig.json
│   ├── tailwind.config.js
│   └── index.html
└── docs/superpowers/
    ├── specs/2026-05-20-migrate-to-tauri-design.md  # 本文档
    └── plans/2026-05-20-migrate-to-tauri.md         # 后续 plan
```

`tauri/` 是独立 Vite + Rust 工程，外层 `npm run dev` 继续跑 Electron，`tauri/` 内 `npm run tauri dev` 跑 Tauri，两者互不干扰，便于行为对照。

## 阶段总览

| 阶段 | 目标 | 预估 | 验收 |
|---|---|---|---|
| **0a Spike – 浮窗行为** | 起一个 `decorations:false / always_on_top / focused:false / transparent:true` 的窗口，触发快捷键时显示，确认前台 app 焦点不被夺走 | 0.5d | 选中 Chrome 文本 → 触发快捷键 → 浮窗出现 → `pbpaste` 拿到选中文本 |
| **0b Spike – AX 读取** | Rust 直调 AXUIElement / AXFocusedUIElement / AXSelectedText | 0.5d | 不模拟 ⌘C 也能在 Rust 单测里读到当前选中文本 |
| **1 主链路** | 快捷键 → 浮窗 → OpenAI SSE 流式 → 显示。`lazy-trans.ts` 最小子集 | 1d | 触发快捷键能看到流式译文 |
| **2 选中文本接入** | Spike 0a/0b 合到主链路；剪贴板兜底；abort 信号 | 0.5d | 选中翻译、取消翻译都正常 |
| **3 托盘 + 单实例** | 托盘菜单（template 图标）、单实例锁、Dock 隐藏 | 0.5d | 行为与 Electron 版一致 |
| **4 持久化 + 设置** | preferences / history / window-state / api settings 全部跑通 | 1d | UI 操作能持久化到 `~/Library/Application Support/` |
| **5 验证与切换** | 体积/内存对比、回归清单、删除老代码、`tauri/` 提到根目录 | 0.5d | 量化指标达成 + 回归清单全过 |

**总预估：4.5 天**（不含未知阻塞）。Spike 0a 是 go/no-go 门：失败需要回到 brainstorming 改设计。

## Rust 主进程架构

### 依赖（`tauri/src-tauri/Cargo.toml`）

```toml
[dependencies]
tauri = { version = "2", features = ["tray-icon", "macos-private-api"] }
tauri-plugin-global-shortcut = "2"
tauri-plugin-clipboard-manager = "2"
tauri-plugin-single-instance = "2"
tauri-plugin-shell = "2"

tokio = { version = "1", features = ["full"] }
futures-util = "0.3"

reqwest = { version = "0.12", features = ["stream", "json", "rustls-tls"], default-features = false }
eventsource-stream = "0.2"

serde = { version = "1", features = ["derive"] }
serde_json = "1"

thiserror = "1"

objc2 = "0.5"
objc2-app-kit = "0.2"
objc2-foundation = "0.2"
accessibility-sys = "0.1"
core-graphics = "0.24"
core-foundation = "0.10"

dotenvy = "0.15"

[features]
default = ["custom-protocol"]
custom-protocol = ["tauri/custom-protocol"]
```

`rustls-tls` 替代 OpenSSL，避免动态链接 + 减少最终包体积。

### 模块划分

每个 Rust 模块对应一个 TS 文件，单测同名对照：

```
src-tauri/src/
├── main.rs              ↔ src/main/index.ts
├── commands.rs          ↔ src/main/index.ts 的 IPC handler 部分
├── errors.rs            ↔ src/main/translation-errors.ts
├── env.rs               ↔ src/main/env.ts
├── translator/
│   ├── mod.rs           ↔ src/main/translator.ts
│   ├── sse.rs           ↔ translator.ts 的 consumeServerSentEvents
│   ├── cache.rs         ↔ src/main/translate-cache.ts
│   ├── phonetic.rs      ↔ translator.ts 的 fetchPhonetic
│   └── prompts.rs       ↔ translator.ts 的 SYSTEM_PROMPT 常量
├── selection/
│   ├── mod.rs           ↔ src/main/selection.ts
│   ├── ax.rs            ↔ AXSelectedText 部分
│   ├── simulated_copy.rs ↔ 模拟 ⌘C + 剪贴板轮询
│   └── permissions.rs   ↔ 新增：AXIsProcessTrusted 检测
├── tray.rs              ↔ src/main/tray.ts + tray-icon-path.ts
├── shortcuts.rs         ↔ src/main/shortcuts.ts
├── window.rs            ↔ src/main/window.ts
├── window_state.rs      ↔ src/main/window-state.ts
└── store/
    ├── mod.rs           ↔ 通用 JSON 原子读写
    ├── preferences.rs   ↔ src/main/preferences.ts
    ├── history.rs       ↔ src/main/history.ts
    └── settings.rs      ↔ src/main/settings.ts
```

### 错误模型（`errors.rs`）

```rust
#[derive(Debug, thiserror::Error, serde::Serialize)]
#[serde(tag = "code", content = "message")]
pub enum AppError {
    #[error("missing_api_key: {0}")]
    MissingApiKey(String),
    #[error("network: {0}")]
    Network(String),
    #[error("timeout: {0}")]
    Timeout(String),
    #[error("api: {0}")]
    Api(String),
    #[error("api_response_invalid: {0}")]
    ApiResponseInvalid(String),
    #[error("cancelled")]
    Cancelled,
    #[error("io: {0}")]
    Io(String),
    #[error("selection: {0}")]
    Selection(String),
    #[error("accessibility_denied")]
    AccessibilityDenied,
    #[error("input_monitoring_denied")]
    InputMonitoringDenied,
}
pub type Result<T> = std::result::Result<T, AppError>;
```

序列化后前端拿到 `{ code: "missing_api_key", message: "..." }`，对应现有 `translation-errors.ts` 的 `code` 字段。

### 并发与取消

- 单一 `active_request: Mutex<Option<RequestHandle>>`，新请求来时 abort 上一个（沿用 TS 版"最后一次为准"语义）
- `RequestHandle { id: u64, cancel: tokio::sync::oneshot::Sender<()> }`
- `translate_text_stream` 接受 `CancellationToken`，SSE 流读循环每次 chunk 后检查
- `reqwest::Client` 的 future drop 自动 cancel HTTP 连接

### 全局状态（`AppState`）

```rust
pub struct AppState {
    pub config_paths: ConfigPaths,
    pub translate_cache: Mutex<TranslateCache>,
    pub history: RwLock<Vec<HistoryEntry>>,
    pub preferences: RwLock<Preferences>,
    pub api_settings: RwLock<ApiSettings>,
    pub active_request: Mutex<Option<RequestHandle>>,
    pub shortcut_label: RwLock<String>,
    pub manual_input_text: RwLock<String>,
}
```

通过 `tauri::Builder::manage(AppState::new(...))` 注入；命令里 `State<'_, AppState>` 拿取。

### 行数预估

| 模块 | 对照 TS | 预估 Rust |
|---|---|---|
| translator/* | translator.ts (475) | ~500 |
| selection/* | selection.ts (110) | ~250（含 AX FFI 样板） |
| store/* | history+preferences+settings+window-state (~400) | ~400 |
| commands.rs | preload + IPC 部分 (~250) | ~150 |
| tray/shortcuts/window/main | (~1100) | ~700 |
| **合计** | ~2350 | **~2000** |

## 前端 bridge 与 IPC 映射

### 设计目标

**`App.tsx` 一行不改**。所有变化收敛在 `tauri/src/lib/lazy-trans.ts`，它在 `window.lazyTrans` 上挂出与现有 preload 一模一样的形状。

### IPC 命令映射

| 现有 IPC channel | preload API | Tauri 命令 | 参数 | 返回 |
|---|---|---|---|---|
| `translation:manual-translate` | `translateInput` | `translate_input` | `{ text: String }` | `()` |
| `translation:cancel` | `cancelTranslation` | `cancel_translation` | `{}` | `()` |
| `translation:update-manual-input` | `updateManualInput` | `update_manual_input` | `{ text: String }` | `()` |
| `window:hide` | `hideWindow` | `hide_window` | `{}` | `()` |
| `settings:get-api` | `getApiSettings` | `get_api_settings` | `{}` | `ApiSettings` |
| `settings:save-api` | `saveApiSettings` | `save_api_settings` | `{ settings }` | `ApiSettings` |
| `settings:test-api` | `testApiSettings` | `test_api_settings` | `{ settings }` | `{ ok: bool }` |
| `system:open-accessibility-settings` | `openAccessibilitySettings` | `open_accessibility_settings` | `{}` | `()` |
| `history:list` | `listHistory` | `list_history` | `{}` | `Vec<HistoryEntry>` |
| `history:clear` | `clearHistory` | `clear_history` | `{}` | `()` |
| `history:remove` | `removeHistoryEntry` | `remove_history_entry` | `{ id }` | `Vec<HistoryEntry>` |
| `history:translate-id` | `translateHistoryEntry` | `translate_history_entry` | `{ id }` | `()` |
| `prefs:get` | `getPreferences` | `get_preferences` | `{}` | `Preferences` |
| `prefs:patch` | `patchPreferences` | `patch_preferences` | `{ patch }` | `Preferences` |

### 事件映射（main → renderer 推送）

| 现有 IPC event | Tauri event | payload |
|---|---|---|
| `translation:update` | `translation:update`（保留事件名） | `TranslationState` |
| `app:open-settings-request` | `app:open-settings-request` | `null` |

### `lazy-trans.ts` 草图

```typescript
import { invoke } from '@tauri-apps/api/core'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'
import type {
  ApiSettings, HistoryEntry, Preferences, TranslationState
} from './types'

type Unsubscribe = () => void

function subscribe<T>(name: string, cb: (payload: T) => void): Unsubscribe {
  let unlisten: UnlistenFn | undefined
  let cancelled = false
  listen<T>(name, (event) => cb(event.payload)).then((fn) => {
    if (cancelled) fn()
    else unlisten = fn
  })
  return () => {
    cancelled = true
    unlisten?.()
  }
}

export const lazyTrans = {
  onTranslationUpdate: (cb: (s: TranslationState) => void) =>
    subscribe('translation:update', cb),
  onOpenSettingsRequest: (cb: () => void) =>
    subscribe<null>('app:open-settings-request', () => cb()),

  translateInput:        (text: string) => invoke<void>('translate_input', { text }),
  cancelTranslation:     ()             => invoke<void>('cancel_translation'),
  updateManualInput:     (text: string) => invoke<void>('update_manual_input', { text }),
  hideWindow:            ()             => invoke<void>('hide_window'),
  getApiSettings:        ()             => invoke<ApiSettings>('get_api_settings'),
  saveApiSettings:       (s: ApiSettings) => invoke<ApiSettings>('save_api_settings', { settings: s }),
  testApiSettings:       (s: ApiSettings) => invoke<{ ok: boolean }>('test_api_settings', { settings: s }),
  openAccessibilitySettings: () => invoke<void>('open_accessibility_settings'),
  listHistory:           ()             => invoke<HistoryEntry[]>('list_history'),
  clearHistory:          ()             => invoke<void>('clear_history'),
  removeHistoryEntry:    (id: string)   => invoke<HistoryEntry[]>('remove_history_entry', { id }),
  translateHistoryEntry: (id: string)   => invoke<void>('translate_history_entry', { id }),
  getPreferences:        ()             => invoke<Preferences>('get_preferences'),
  patchPreferences:      (patch: Partial<Preferences>) =>
    invoke<Preferences>('patch_preferences', { patch })
}

declare global {
  interface Window { lazyTrans: typeof lazyTrans }
}

window.lazyTrans = lazyTrans
```

`main.tsx` 顶部 `import './lib/lazy-trans'`，在 React 渲染前完成挂载。

### 类型同步

`tauri/src/lib/types.ts` **手写**，与 Rust struct 一一对应。不引入 `ts-rs`（字段就十来个、改动频率低、增加 build step 不划算）。如后期发现类型漂移多再补。

### Rust 端 serde 约定

- 全部 struct 加 `#[serde(rename_all = "camelCase")]`，Rust 写 snake_case 字段、序列化为 camelCase（与现有 TS 类型完全一致，App.tsx 零改动）
- `Option<T>` 字段加 `#[serde(skip_serializing_if = "Option::is_none")]`，保持 `phonetic?` 这种"未提供就别出现"的语义

### 错误形状

`invoke` reject 时前端拿到 `{ code, message }`：

```typescript
{ code: 'missing_api_key', message: 'OPENAI_API_KEY 未配置' }
```

`buildErrorState` 在 Rust 主进程组装 `TranslationState` 通过 event 推送（不走命令 reject），与现有 TS 版一致。命令 reject 主要给 `test_api_settings` / `save_api_settings` 这种**同步反馈**场景。

## macOS 原生能力实现

### 浮窗（`window.rs`）

```rust
fn create_translate_window(app: &AppHandle) -> tauri::Result<WebviewWindow> {
    WebviewWindowBuilder::new(app, "translate", WebviewUrl::default())
        .title("LazyTrans")
        .inner_size(460.0, 520.0)
        .min_inner_size(360.0, 400.0)
        .decorations(false)
        .transparent(true)
        .always_on_top(true)
        .focused(false)              // 等价 Electron focusable:false
        .accept_first_mouse(true)
        .resizable(true)
        .maximizable(false)
        .minimizable(false)
        .skip_taskbar(true)
        .visible(false)
        .visible_on_all_workspaces(true)
        .build()
}
```

**关键差异点：**
- Electron `focusable:false` 是窗口属性；Tauri `focused(false)` 是"创建后不要聚焦"——**Spike 0a 要验证核心**：模拟 ⌘C 时焦点必须留在前台 app
- 如 `focused(false)` 不足以保留前台焦点，回退方案：用 `objc2-app-kit` 给 NSWindow 加 `NSWindowStyleMaskNonactivatingPanel`（NSPanel 子类化）

**跟手定位：**

```rust
fn cursor_position() -> (f64, f64) {
    use core_graphics::event::CGEvent;
    use core_graphics::event_source::{CGEventSource, CGEventSourceStateID};
    let src = CGEventSource::new(CGEventSourceStateID::HIDSystemState).unwrap();
    let event = CGEvent::new(src).unwrap();
    let p = event.location();
    (p.x, p.y)
}
```

遍历 `NSScreen::screens()` 找包含 cursor 的屏幕的 `visibleFrame`，clamp 逻辑沿用 `window.ts:positionWindowNearCursor`。

### 全局快捷键（`shortcuts.rs`）

```rust
use tauri_plugin_global_shortcut::{Code, Modifiers, Shortcut, ShortcutState};

const CANDIDATES: &[(Modifiers, Code, &str)] = &[
    (Modifiers::ALT,                              Code::KeyD, "Option + D"),
    (Modifiers::SUPER.union(Modifiers::SHIFT),    Code::KeyD, "Command + Shift + D"),
];
```

两级 fallback 与 `shortcuts.ts:TRANSLATE_SHORTCUTS` 完全对齐。

### AX 选中文本读取（`selection/ax.rs`）

```rust
pub fn read_selection_via_ax() -> Result<Option<String>, SelectionError> {
    unsafe {
        let system_wide = AXUIElementCreateSystemWide();
        if system_wide.is_null() { return Ok(None); }

        let mut focused_app: CFTypeRef = std::ptr::null();
        if AXUIElementCopyAttributeValue(
            system_wide,
            kAXFocusedApplicationAttribute as CFStringRef,
            &mut focused_app,
        ) != kAXErrorSuccess { return Ok(None); }

        let mut focused_el: CFTypeRef = std::ptr::null();
        if AXUIElementCopyAttributeValue(
            focused_app as AXUIElementRef,
            kAXFocusedUIElementAttribute as CFStringRef,
            &mut focused_el,
        ) != kAXErrorSuccess { return Ok(None); }

        let mut selected: CFTypeRef = std::ptr::null();
        if AXUIElementCopyAttributeValue(
            focused_el as AXUIElementRef,
            kAXSelectedTextAttribute as CFStringRef,
            &mut selected,
        ) != kAXErrorSuccess { return Ok(None); }

        Ok(cfstring_to_string(selected as CFStringRef))
    }
}
```

**权限检查（`selection/permissions.rs`）：**

```rust
pub fn is_accessibility_trusted() -> bool {
    unsafe { AXIsProcessTrusted() }
}
```

**检查时机：**
- `main.rs::setup` 启动时调用一次 → 仅日志 warn，**不弹窗**（避免应用一打开就糊脸）
- 每次触发翻译流程入口（`translate_input` / 快捷键 handler）开头再调一次 → 未授权直接抛 `AccessibilityDenied`，前端展示"打开系统设置"按钮的引导 UI（沿用现有 `system:open-accessibility-settings` 命令）

### 模拟 ⌘C（`selection/simulated_copy.rs`）

```rust
use core_graphics::event::{CGEvent, CGEventFlags, CGEventTapLocation, CGKeyCode};
use core_graphics::event_source::{CGEventSource, CGEventSourceStateID};

const KEY_C: CGKeyCode = 8;

pub fn simulate_cmd_c() -> Result<(), SelectionError> {
    let src = CGEventSource::new(CGEventSourceStateID::CombinedSessionState)
        .map_err(|_| SelectionError::EventSource)?;

    let down = CGEvent::new_keyboard_event(src.clone(), KEY_C, true)
        .map_err(|_| SelectionError::EventCreate)?;
    down.set_flags(CGEventFlags::CGEventFlagCommand);
    down.post(CGEventTapLocation::HID);

    let up = CGEvent::new_keyboard_event(src, KEY_C, false)
        .map_err(|_| SelectionError::EventCreate)?;
    up.set_flags(CGEventFlags::CGEventFlagCommand);
    up.post(CGEventTapLocation::HID);
    Ok(())
}
```

替代 `selection.ts` 里 `osascript "tell application System Events to keystroke c using command down"`。**优势**：~5ms（osascript ~50ms），无子进程。

**新增权限**：macOS Sequoia 起 CGEvent 注入需"输入监控"权限。首次 post 失败 → 检测 `CGPreflightListenEventAccess()` → 抛 `InputMonitoringDenied` → 前端引导用户开权限。

**兜底降级**：如果用户拒绝"输入监控"权限，`simulate_cmd_c` 自动降级到 `osascript -e 'tell application "System Events" to keystroke "c" using command down'`（沿用现有 `selection.ts` 的实现）。osascript 不需要输入监控权限（它走的是 AppleScript 自动化权限，首次会弹标准系统对话框）。降级时序参数不变。**这条降级链是设计内的兜底，不是 Spike 决定项**。

### 完整选中读取流程（`selection/mod.rs`）

```rust
pub async fn get_selected_text(
    clipboard: &impl ClipboardLike,
) -> Result<String, SelectionError> {
    // 1. 先试 AX
    if let Some(text) = read_selection_via_ax()? {
        if !text.trim().is_empty() {
            return Ok(text.trim().to_string());
        }
    }

    // 2. fallback: 备份剪贴板 → 模拟 ⌘C → 轮询 → 还原
    let previous = clipboard.read_text().unwrap_or_default();
    clipboard.write_text("");
    tokio::time::sleep(Duration::from_millis(90)).await; // FOCUS_RESTORE_DELAY_MS
    simulate_cmd_c()?;

    let result = wait_for_clipboard_change(
        clipboard, &previous,
        Duration::from_millis(320),  // POLL_TIMEOUT
        Duration::from_millis(20),   // POLL_INTERVAL
    ).await;

    clipboard.write_text(&previous); // 总是恢复
    Ok(result.trim().to_string())
}
```

时序参数与 `selection.ts` 完全相同，保证手感一致。

### 剪贴板

直接用 `tauri-plugin-clipboard-manager`，避免造轮子。`ClipboardLike` trait 抽象方便单测注入 mock。

### 托盘（`tray.rs`）

```rust
use tauri::tray::{TrayIconBuilder, MouseButton, MouseButtonState, TrayIconEvent};
use tauri::image::Image;

pub fn setup_tray(app: &AppHandle) -> tauri::Result<()> {
    let icon = Image::from_path(resolve_tray_icon_path(app)?)?;
    TrayIconBuilder::with_id("main")
        .icon(icon)
        .icon_as_template(true)          // 等价 setTemplateImage(true)
        .tooltip("LazyTrans")
        .menu(&build_menu(app)?)
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up, ..
            } = event {
                show_translate_window(&tray.app_handle());
            }
        })
        .build(app)?;
    Ok(())
}
```

- `resolve_tray_icon_path` 沿用 `tray-icon-path.ts` 的多候选搜索逻辑（dev: `tauri/build/`、prod: `Resources/`）
- `icon_as_template(true)` = macOS 自动深浅色反色

### 单实例锁 + Dock 隐藏（`main.rs`）

```rust
.plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
    show_translate_window(app);
}))
.setup(|app| {
    #[cfg(target_os = "macos")]
    {
        use objc2_app_kit::{NSApp, NSApplicationActivationPolicy};
        let ns_app = unsafe { NSApp() };
        unsafe { ns_app.setActivationPolicy(NSApplicationActivationPolicy::Accessory) };
    }
    Ok(())
})
```

`Accessory` 等价 Electron `app.dock.hide()`：Dock 不显示，窗口可见、菜单栏托盘可用。

### 系统设置跳转（`commands.rs`）

```rust
#[tauri::command]
async fn open_accessibility_settings(app: AppHandle) -> Result<(), AppError> {
    app.shell()
       .open("x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility", None)
       .map_err(|e| AppError::Io(e.to_string()))
}
```

### `.env` 加载（`env.rs`）

```rust
fn load_dotenv_files(app: &AppHandle) {
    let candidates = [
        std::env::current_dir().ok(),
        std::env::current_exe().ok().and_then(|p| p.parent().map(PathBuf::from)),
        Some(app.path().resource_dir().unwrap()),
        Some(app.path().app_data_dir().unwrap()),
    ];
    for path in candidates.into_iter().flatten() {
        let _ = dotenvy::from_path(path.join(".env"));
    }
}
```

多路径加载顺序与 `env.ts:loadDotEnvFiles` 一致。

## 持久化与数据迁移

### 文件清单

位置：`~/Library/Application Support/<bundle-id>/`

| 文件 | 内容 | 写入时机 |
|---|---|---|
| `settings.json` | apiKey / baseUrl / model | 设置面板"保存" |
| `preferences.json` | theme / manualDirection / recentModels / shortcutDowngradeAck | `patch_preferences` 时同步写 |
| `history.json` | 翻译历史 | 每次新增/删除/清空 |
| `window-state.json` | 窗口 bounds | 防抖 300ms 写 |
| `.env` | 可选，开发期手放 | 启动时只读 |

### Bundle ID 策略

- 最终发版用 `com.lazy.lazytrans`（与现 Electron 版完全相同，无缝替换）
- 开发期为避免与 Electron 实例数据互相覆盖，临时用 `com.lazy.lazytrans.dev`
- 切换前一个 commit 改回 `com.lazy.lazytrans`，并在 `main.rs::setup` 加迁移逻辑：检测旧路径存在且新路径不存在 → 拷贝四个 JSON

### 原子写（`store/mod.rs`）

```rust
pub fn write_json_atomic<T: Serialize>(path: &Path, value: &T) -> Result<()> {
    let tmp = path.with_extension("json.tmp");
    let bytes = serde_json::to_vec_pretty(value)?;
    std::fs::write(&tmp, bytes)?;
    std::fs::rename(&tmp, path)?;  // POSIX rename 原子
    Ok(())
}
```

读取失败（文件缺失/损坏）→ 返回 `Default::default()`，与现有 TS 版语义一致。

### bounds 防抖

沿用 300ms。用 `tokio::time::sleep` + `Mutex<Option<JoinHandle>>` 简易实现，新事件来时 `JoinHandle::abort` 上一个。

## 测试策略

### Rust 单测（`cargo test`）

| 模块 | 测试覆盖 |
|---|---|
| `translator/sse.rs` | SSE 块解析、`[DONE]` 终止、跨包边界拼接 |
| `translator/cache.rs` | LRU 命中/淘汰、不同 direction/baseUrl/model 不串 |
| `translator/mod.rs` | abort、timeout、错误分类（用 `wiremock` mock reqwest） |
| `selection/simulated_copy.rs` | 剪贴板备份/还原/轮询（mock `ClipboardLike` trait） |
| `selection/ax.rs` | 只测"未授权返回 None"分支；其余靠手动 |
| `shortcuts.rs` | 注册成功 / fallback / 全失败三态（mock `ShortcutRegistrar` trait） |
| `store/*` | 读写往返、损坏文件返回 Default、原子写不留残文件 |
| `tray.rs` | 模板菜单结构（不实际起 Tray） |
| `window_state.rs` | 防抖触发次数 |

目标覆盖率 ≥ 80%（沿用 `rules/common/testing.md`）。

### Vitest 测试处理

| 现有测试 | 去向 |
|---|---|
| `src/main/*.test.ts`（~30 个） | **删除**——逻辑迁到 Rust 后由 `cargo test` 接管 |
| `src/preload/index.test.ts` | **删除**——bridge 形状改了 |
| `src/renderer/src/app-behavior.test.ts` | **迁移**到 `tauri/src/`——前端逻辑没变 |
| `src/renderer/src/lib/speech.test.ts` | **迁移** |
| `src/renderer/src/index-html.test.ts` | **迁移** |

### 集成/端到端

不引入 Playwright（成本过高，收益小）。用一份回归清单作手动验证（见下文）。

## 验收门槛

### 量化指标（必须达成）

| 指标 | 当前 Electron | 目标 |
|---|---|---|
| `LazyTrans.app` 大小 | 287 MB | **< 30 MB** |
| 启动后总 RSS | 277 MB | **< 100 MB**（理想 < 70 MB） |
| 快捷键 → 浮窗出现 | ~50-100ms | ≤ 100ms |
| 选中 → 收到首字 stream | ~600ms | ≤ 600ms（取决于 API） |
| AX 路径读取耗时 | ~50ms（osascript） | < 10ms（Rust 原生） |

### 行为回归清单（手动验证）

- [ ] 首次启动：检测 AX 权限缺失 → 引导 → 开权限后正常
- [ ] Chrome 选中 → Alt+D → 浮窗弹出 → 流式译文显示
- [ ] PDF/终端/原生 app 选中 → AX 失败 fallback 到 ⌘C → 译文正常
- [ ] 浮窗显示时前台 app 焦点保留（光标在 Chrome 输入框还能继续打字）
- [ ] 快捷键被占用 → 降级到 ⌘⇧D + 弹一次降级提示
- [ ] 翻译中再次触发快捷键 → 旧请求取消，新请求开始
- [ ] 取消按钮 → 状态变 cancelled，可立刻再次翻译
- [ ] 单英文单词翻译 → 显示 IPA 音标
- [ ] 翻译结果走缓存（同文本/方向/模型不重发 API）
- [ ] 历史：新增、点击重翻、删除、清空
- [ ] 偏好：theme / 翻译方向 / 最近模型 在面板切换后持久化
- [ ] 设置：保存 / 测试连接 / 错误显示
- [ ] 窗口位置：移动后重启位置恢复
- [ ] 跨 Space：在全屏 app 上方仍能显示
- [ ] 托盘：点击图标、菜单各项、最近 10 条历史
- [ ] 单实例：第二次启动 → 焦点已有窗口
- [ ] Dock 不显示图标
- [ ] 退出：菜单退出 / Cmd+Q 正常清理

## 风险与缓解

| 风险 | 概率 | 影响 | 缓解 |
|---|---|---|---|
| `focused(false)` 不能完整保留前台焦点 | 中 | 高（核心交互失效） | Spike 0a 提前验证，失败回退 NSPanel 子类化 |
| CGEvent 模拟 ⌘C 需"输入监控"权限，UX 复杂 | 高 | 中 | 检测 `CGPreflightListenEventAccess()`，引导用户开权限；拒绝则降级 osascript |
| AX FFI 边界条件多（CFType 引用计数） | 中 | 中 | `unsafe` 块全部配 `CFRelease` 兜底；覆盖 null / 错误码的单测 |
| 透明窗口圆角/阴影与 Electron 不一致 | 低 | 低 | CSS 端调整 `border-radius` + `box-shadow`；可接受小差异 |
| SSE 解析在断连/不完整 chunk 上行为漂移 | 中 | 中 | 直接移植 `consumeServerSentEvents` 算法，配 fixture 单测 |
| Tauri 2 `tray-icon` template image 在某些 macOS 版本反色异常 | 低 | 低 | 用现有 `trayIconTemplate.png` 测试通过即可 |
| 老 Electron 用户升级后数据丢失 | 中 | 高 | 首次启动检测旧路径并迁移，备份原文件 |

## 最终切换步骤（阶段 5 末尾）

1. 跑完回归清单 + 量化指标达成
2. `tauri/build/` 内的图标合并到根 `build/`
3. 删除外层 `src/` `out/` `electron.vite.config.ts`，从根 `package.json` 移除 electron 相关依赖
4. `git mv` 把 `tauri/*` 提到根目录（保留 history）
5. 更新根 `package.json` / `README.md` / `CLAUDE.md`（如有）
6. 单条 commit：`refactor: migrate to Tauri 2 (drops Electron, app size 287MB→<30MB)`
