# 状态栏 Tray 图标修复 — 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复 LazyTrans 在 macOS menubar 上 tray 图标显示为透明的问题,让图标在 dev 模式与打包后均稳定可见,并随系统外观自动反色。

**Architecture:** 用 Lucide Languages 图标渲染出符合 macOS HIG 的 22×22 / 44×44 单色 + alpha template PNG,放进 `build/`;`src/main/tray.ts` 显式 `setTemplateImage(true)`;`src/main/index.ts` 抽 `resolveTrayIconPath` 纯函数处理 dev/打包路径优先级;`package.json` 加 `extraResources` 把 PNG 复制到 `.app/Contents/Resources/`。

**Tech Stack:** Electron 42 / electron-vite 4 / electron-builder 26 / Vitest 3 / React 19(未触及) / Lucide React 1.14。

**Spec:** `docs/superpowers/specs/2026-05-18-statusbar-icon-design.md`

---

## File Structure

新建文件:

- `build/trayIconTemplate.svg` — Lucide Languages 单色 SVG 源,`stroke="#000"`,viewBox 保留 24×24。
- `build/trayIconTemplate.png` — 22×22 单色 + alpha,从 SVG 渲染产出。
- `build/trayIconTemplate@2x.png` — 44×44 单色 + alpha,从 SVG 渲染产出。
- `src/main/tray-icon-path.test.ts` — `resolveTrayIconPath` 纯函数单元测试。

修改文件:

- `src/main/tray.ts` — 创建 Tray 前显式 `image.setTemplateImage(true)`。
- `src/main/tray.test.ts` — `createImage` mock 改为返回带 `setTemplateImage` 的对象,新增断言验证调用。
- `src/main/index.ts` — 新导出 `resolveTrayIconPath(candidates, fileExists)` 纯函数,`getTrayIconPath()` 改为调用它并指向 `trayIconTemplate.png`。
- `package.json` — `build` 字段新增 `extraResources`,把 PNG 复制到 `Contents/Resources/`。

---

### Task 1:创建 Lucide Languages SVG 源文件

**Files:**
- Create: `build/trayIconTemplate.svg`

- [ ] **Step 1: 写 SVG 源文件**

路径数据来自 `node_modules/lucide-react/dist/esm/icons/languages.mjs`。SVG 必须用 `stroke="#000"`,viewBox 保留 lucide 默认 24×24,其余 stroke 属性沿用 lucide。

写入 `build/trayIconTemplate.svg`:

```svg
<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#000" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <path d="m5 8 6 6"/>
  <path d="m4 14 6-6 2-3"/>
  <path d="M2 5h12"/>
  <path d="M7 2h1"/>
  <path d="m22 22-5-10-5 10"/>
  <path d="M14 18h6"/>
</svg>
```

- [ ] **Step 2: 验证文件落地**

Run: `head -1 build/trayIconTemplate.svg`
Expected: 输出以 `<svg xmlns=` 开头的行。

- [ ] **Step 3: Commit**

```bash
git add build/trayIconTemplate.svg
git commit -m "feat: 新增 tray icon SVG 源(Lucide Languages, stroke=#000)"
```

---

### Task 2:从 SVG 生成 22×22 / 44×44 template PNG

**Files:**
- Create: `build/trayIconTemplate.png`
- Create: `build/trayIconTemplate@2x.png`

- [ ] **Step 1: 渲染 22×22 PNG**

Run:
```bash
npx -y @resvg/resvg-cli@2 build/trayIconTemplate.svg \
  -o build/trayIconTemplate.png --width 22 --height 22 --background=transparent
```

Expected:命令成功退出,无 stderr;`ls -la build/trayIconTemplate.png` 显示文件已生成且大小非零。

- [ ] **Step 2: 渲染 44×44 PNG**

Run:
```bash
npx -y @resvg/resvg-cli@2 build/trayIconTemplate.svg \
  -o build/trayIconTemplate@2x.png --width 44 --height 44 --background=transparent
```

Expected:命令成功,文件已生成。

- [ ] **Step 3: 校验图像规格**

Run:
```bash
sips -g pixelWidth -g pixelHeight -g hasAlpha build/trayIconTemplate.png build/trayIconTemplate@2x.png
```

Expected:
- `trayIconTemplate.png`:pixelWidth=22, pixelHeight=22, hasAlpha=yes
- `trayIconTemplate@2x.png`:pixelWidth=44, pixelHeight=44, hasAlpha=yes

任何一项不满足都不要继续,先排查 resvg 输出。

- [ ] **Step 4: Commit**

```bash
git add build/trayIconTemplate.png build/trayIconTemplate@2x.png
git commit -m "feat: 添加 tray icon template PNG(22/44 单色 + alpha)"
```

---

### Task 3:为 tray.ts 写一条"createTrayMenu 调 setTemplateImage(true)"的失败测试

**Files:**
- Modify: `src/main/tray.test.ts`

LazyTrans 测试基础:Vitest 3,`tray.test.ts` 已有完整 mock 框架。

- [ ] **Step 1: 修改 createImage mock 让它返回带 setTemplateImage 的对象**

在 `src/main/tray.test.ts` 的 `describe('tray menu construction', ...)` 块内,找到现有测试 `it('builds the tray with the icon, tooltip, and a click handler that triggers onShow', ...)`。修改其中 `createImage` 的 mock 实现并加新断言。

替换该 `it(...)` 整段为:

```ts
it('builds the tray with the icon, tooltip, and a click handler that triggers onShow', () => {
    const trayInstance = {
      setContextMenu: vi.fn(),
      setToolTip: vi.fn(),
      on: vi.fn()
    }
    const TrayCtor = vi.fn(() => trayInstance) as unknown as typeof import('electron').Tray
    const MenuCtor = { buildFromTemplate: vi.fn((template) => template) }
    const imageInstance = { setTemplateImage: vi.fn() } as unknown as Electron.NativeImage
    const createImage = vi.fn(() => imageInstance)

    const callbacks = makeCallbacks()
    const handle = createTrayMenu('/path/to/icon.png', callbacks, {
      TrayCtor,
      MenuCtor,
      createImage
    })

    expect(createImage).toHaveBeenCalledWith('/path/to/icon.png')
    expect(imageInstance.setTemplateImage).toHaveBeenCalledWith(true)
    expect(TrayCtor).toHaveBeenCalledWith(imageInstance)
    expect(trayInstance.setToolTip).toHaveBeenCalledWith('LazyTrans')
    expect(MenuCtor.buildFromTemplate).toHaveBeenCalled()
    expect(trayInstance.setContextMenu).toHaveBeenCalled()

    const clickHandler = trayInstance.on.mock.calls.find(
      (args) => args[0] === 'click'
    )?.[1] as (() => void) | undefined
    clickHandler?.()
    expect(callbacks.onShow).toHaveBeenCalled()

    handle.refresh()
    expect(trayInstance.setContextMenu).toHaveBeenCalledTimes(2)
  })
```

- [ ] **Step 2: 跑测试验证它失败**

Run: `npx vitest run src/main/tray.test.ts -t "builds the tray"`
Expected:FAIL,失败信息类似 `expected imageInstance.setTemplateImage to have been called with true`(因为 tray.ts 还没调它)。

确认测试因预期原因失败,再进入 Task 4。

---

### Task 4:在 tray.ts 内显式调用 setTemplateImage(true)

**Files:**
- Modify: `src/main/tray.ts`

- [ ] **Step 1: 修改 createTrayMenu 内的 image 初始化**

打开 `src/main/tray.ts`,定位 `createTrayMenu` 函数体内 `const image = createImage(iconPath)` 一行(约第 43 行)。在它之后、`const tray = new TrayCtor(image)` 之前,加一行 `image.setTemplateImage(true)`。

修改后的相关片段应为:

```ts
  const image = createImage(iconPath)
  image.setTemplateImage(true)
  const tray = new TrayCtor(image)
  tray.setToolTip('LazyTrans')
```

- [ ] **Step 2: 跑 Task 3 测试验证通过**

Run: `npx vitest run src/main/tray.test.ts -t "builds the tray"`
Expected:PASS。

- [ ] **Step 3: 跑整个 tray.test.ts 确认未破坏其他测试**

Run: `npx vitest run src/main/tray.test.ts`
Expected:所有测试 PASS。

- [ ] **Step 4: Commit**

```bash
git add src/main/tray.ts src/main/tray.test.ts
git commit -m "feat: tray 图像声明为 template image, menubar 自动反色适配深浅色"
```

---

### Task 5:为 resolveTrayIconPath 写失败测试

**Files:**
- Create: `src/main/tray-icon-path.test.ts`

- [ ] **Step 1: 创建测试文件**

写入 `src/main/tray-icon-path.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest'

import { resolveTrayIconPath } from './index'

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
```

- [ ] **Step 2: 跑测试验证它失败**

Run: `npx vitest run src/main/tray-icon-path.test.ts`
Expected:FAIL,失败信息提示 `resolveTrayIconPath` 未导出(模块解析报错)。

确认是预期的失败再进入 Task 6。

---

### Task 6:在 index.ts 抽 resolveTrayIconPath 纯函数并改写 getTrayIconPath

**Files:**
- Modify: `src/main/index.ts`

- [ ] **Step 1: 改写 getTrayIconPath 并新增 export**

打开 `src/main/index.ts`,定位现有 `getTrayIconPath` 函数(约第 544-554 行)。整段替换为:

```ts
export function resolveTrayIconPath(
  candidates: readonly string[],
  fileExists: (path: string) => boolean = existsSync
): string {
  for (const candidate of candidates) {
    if (candidate && fileExists(candidate)) {
      return candidate
    }
  }
  return ''
}

function getTrayIconPath(): string {
  const resolved = resolveTrayIconPath([
    join(app.getAppPath(), 'build/trayIconTemplate.png'),
    join(process.resourcesPath, 'trayIconTemplate.png')
  ])
  if (!resolved) {
    console.warn('Tray icon asset missing; menubar will fall back to empty image.')
  }
  return resolved
}
```

注意:`existsSync` 与 `join` 在文件顶部已 import,不必再加。

- [ ] **Step 2: 跑 Task 5 测试验证通过**

Run: `npx vitest run src/main/tray-icon-path.test.ts`
Expected:三条测试全部 PASS。

- [ ] **Step 3: 跑 typecheck 确认 export 与 import 类型对得上**

Run: `npm run typecheck`
Expected:无错误输出,退出码 0。

- [ ] **Step 4: 跑整个测试套件验证未破坏其他测试**

Run: `npm test`
Expected:全部 PASS。

- [ ] **Step 5: Commit**

```bash
git add src/main/index.ts src/main/tray-icon-path.test.ts
git commit -m "refactor: 抽 resolveTrayIconPath 纯函数, tray 图标指向 template PNG"
```

---

### Task 7:在 package.json 加 extraResources 让 PNG 进入 .app/Contents/Resources/

**Files:**
- Modify: `package.json`

- [ ] **Step 1: 修改 build 字段**

打开 `package.json`,定位 `"build"` 对象(约第 17-36 行)。在 `"files"` 数组之后、`"directories"` 之前,新增 `extraResources` 字段。

修改后的 `build` 对象应为:

```json
  "build": {
    "appId": "com.lazy.lazytrans",
    "productName": "LazyTrans",
    "asar": true,
    "files": [
      "out/**/*",
      "package.json"
    ],
    "extraResources": [
      { "from": "build/trayIconTemplate.png",    "to": "trayIconTemplate.png" },
      { "from": "build/trayIconTemplate@2x.png", "to": "trayIconTemplate@2x.png" }
    ],
    "directories": {
      "output": "release"
    },
    "mac": {
      "category": "public.app-category.productivity",
      "icon": "build/icon.icns",
      "identity": null,
      "target": [
        "dir"
      ]
    }
  },
```

- [ ] **Step 2: 验证 JSON 合法**

Run: `node -e "JSON.parse(require('fs').readFileSync('package.json','utf8'))"`
Expected:无输出,退出码 0。

- [ ] **Step 3: Commit**

```bash
git add package.json
git commit -m "build: extraResources 把 tray icon template PNG 复制到 Resources/"
```

---

### Task 8:dev 模式人工验证(必做)

**Files:** 无代码改动。

- [ ] **Step 1: 跑 dev**

Run: `npm run dev`
Expected:Electron 启动,主窗口出现,**menubar 右上角可见双语图标(Languages 形状,A 字与楔形)**。

如果看不到:停在这一步,把 dev 控制台日志(包括是否打出 `Tray icon asset missing` warning)反馈回来后再继续。

- [ ] **Step 2: 切换系统深 / 浅色模式验证图标自动反色**

操作:`系统设置 → 外观 → 浅色 / 深色 / 自动` 切换。

Expected:
- 浅色:图标渲染为深色,在白色 menubar 上清晰可见。
- 深色:图标渲染为浅色,在深色 menubar 上清晰可见。

- [ ] **Step 3: 验证 macOS auto menubar(跟随壁纸)**

操作:换一张浅色壁纸,再换一张深色壁纸,各观察一次 menubar。

Expected:两种壁纸下图标都清晰可辨。

- [ ] **Step 4: 关闭 dev**

按 Ctrl+C 终止 `npm run dev`。

dev 模式验证通过后再进入 Task 9。

---

### Task 9:打包后人工验证(必做)

**Files:** 无代码改动。

- [ ] **Step 1: 打包**

Run: `npm run dist:mac`
Expected:`release/mac-arm64/LazyTrans.app` 生成成功(若在 Intel Mac 上构建目录可能是 `mac` 而非 `mac-arm64`,后续路径相应替换)。

- [ ] **Step 2: 确认 PNG 资源进入 .app**

Run: `ls release/mac-arm64/LazyTrans.app/Contents/Resources/trayIconTemplate*.png`
Expected:列出两个文件 `trayIconTemplate.png` 与 `trayIconTemplate@2x.png`。如缺失,回 Task 7 检查 `extraResources` 配置。

- [ ] **Step 3: 启动打包产物验证图标可见**

Run: `open release/mac-arm64/LazyTrans.app`
Expected:menubar 出现双语图标,行为同 Task 8。

- [ ] **Step 4: 退出应用**

通过 menubar 菜单选"退出 LazyTrans"。

---

## Self-Review

**1. Spec coverage:**
- 设计 §1 图标素材 → Task 1 + Task 2 ✓
- 设计 §2 tray.ts `setTemplateImage(true)` → Task 3 + Task 4 ✓
- 设计 §2 index.ts `resolveTrayIconPath` 抽函数 + `getTrayIconPath` 改路径 → Task 5 + Task 6 ✓
- 设计 §2 package.json `extraResources` → Task 7 ✓
- 设计 §3 测试改动(tray.test.ts 加 setTemplateImage 断言 + 新建 tray-icon-path.test.ts) → Task 3 + Task 5 ✓
- 设计 §4 错误处理(空 path 写 warn,Tray 仍可创建) → Task 6 Step 1 ✓
- 设计 §"验证步骤" 自动:typecheck + test → Task 6 Step 3-4 ✓
- 设计 §"验证步骤" 人工:dev 可见 / 深浅色反色 / auto menubar / dist:mac / 资源存在 → Task 8 + Task 9 ✓

**2. Placeholder scan:** 无 TBD / TODO / "implement later";所有代码块给出完整内容;所有 Run 命令含 Expected 输出。

**3. Type consistency:**
- `resolveTrayIconPath` 在 Task 5 测试与 Task 6 实现中签名一致:`(candidates: readonly string[], fileExists: (path: string) => boolean) => string`。
- `setTemplateImage(true)` 在 Task 3 测试与 Task 4 实现中调用方式一致。
- PNG 文件名 `trayIconTemplate.png` / `trayIconTemplate@2x.png` 在 Task 1-7 中一致。
- `getTrayIconPath` 候选顺序(dev 在前 / resources 在后)在 Task 6 实现与 Task 9 验证中对齐。
