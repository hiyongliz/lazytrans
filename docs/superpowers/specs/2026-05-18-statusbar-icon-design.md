# 状态栏(menubar tray)图标修复设计

日期:2026-05-18

## 背景与现状

LazyTrans 是一个 macOS 划词翻译 Electron 应用。`app.dock.hide()` 隐藏了 dock,所以应用唯一可见入口是 menubar 上的 tray 图标。

现状代码:

- `src/main/tray.ts` 已实现 `createTrayMenu()`,生成菜单(显示 LazyTrans / 最近翻译 / 清空历史 / 设置 / 退出),并把 `nativeImage.createFromPath(iconPath)` 创建的图像传给 `new Tray()`。
- `src/main/index.ts` 的 `setupTray()` 调用 `createTrayMenu(getTrayIconPath(), ...)`;`getTrayIconPath()` 先找 `app.getAppPath()/build/icon.icns`,再找 `process.resourcesPath/icon.icns`,都失败返回 `''`。
- `build/icon.icns` 是 2.3 MB / 1024×1024 的彩色应用图标,`build/icon.png` 同源。

观察到的问题:menubar 上图标完全透明,无法看到。

根因(综合静态分析 + .icns 内容核验):

1. **打包必坏。** `package.json` 的 `build.files` 只包含 `out/**/*` 与 `package.json`,`build/icon.icns` 不会进入 `.app/Contents/Resources/`。`getTrayIconPath()` 在打包后只能命中 `process.resourcesPath/icon.icns`,该文件不存在,fallback 返回 `''`,`nativeImage.createFromPath('')` 返回空图像,Tray 显示空白。
2. **dev 模式下子图标对比度过低 + 未声明 template。** `iconutil -c iconset` 解包后,`icon.icns` 内的 16×16 子图标内容是**浅色低对比度的"译"字**(见 `build/icon.icns` 抽取产物)。Electron 在 menubar 取到的就是这个子图标,但代码层未调用 `image.setTemplateImage(true)`,系统不会把它当模板图自动反色,叠加 menubar 半透明背景后近似透明、几乎不可见。即便加上 `setTemplateImage(true)`,这张图的形状本身也不适合做 menubar 单色图。

`app.getAppPath()` 在 dev 模式下指向项目根(electron-vite `spawn(electron, ['.'])` 行为,cwd 为项目根),所以 dev 路径解析本身没问题;根因只在"图标内容 + 未声明 template"。

## 目标

- macOS menubar 上稳定显示 LazyTrans 的 tray 图标,dev 模式与打包后行为一致。
- 图标随系统深色 / 浅色模式自动反色(template image)。
- 修复同时不破坏现有 Tray 菜单与点击行为,不改动应用主图标资源。

## 非目标

- 不改动 `build/icon.icns` / `build/icon.png`(继续作为 .app 主图标使用)。
- 不引入翻译状态指示(idle / translating / error 切换 tray 图标),留作后续功能。
- 不动 `app.dock.hide()` 行为。
- 不抽取独立的 paths 模块。
- 不为 `@resvg/resvg-cli` 增加 devDependency,生成图标用 `npx` 一次性执行。

## 设计

### 1. 图标素材

新增三个文件到 `build/`:

- `build/trayIconTemplate.svg` — 取自 Lucide `Languages` 图标(路径数据可从 `node_modules/lucide-react/dist/esm/icons/languages.mjs` 直接拷贝)。SVG 必须满足以下硬约束:
  - 保留 lucide 默认 `viewBox="0 0 24 24"`(允许 22×22 渲染略满,符合 lucide 设计预期)
  - 显式 `stroke="#000"`(不留 `currentColor`),保证 resvg / 任何 SVG→PNG 工具产出可见黑色像素 + 完整 alpha 通道
  - 其它 stroke 属性沿用 lucide:`stroke-width="2"`、`stroke-linecap="round"`、`stroke-linejoin="round"`、`fill="none"`
- `build/trayIconTemplate.png` — 22×22 单色 + alpha。
- `build/trayIconTemplate@2x.png` — 44×44 单色 + alpha。

文件名后缀 `Template` 让 macOS 自动识别为模板图,代码层再显式 `setTemplateImage(true)` 兜底。

生成 PNG 的一次性命令(本地执行,失败兜底见下文):

```bash
npx @resvg/resvg-cli@2 build/trayIconTemplate.svg \
  -o build/trayIconTemplate.png    --width 22 --height 22 --background=transparent
npx @resvg/resvg-cli@2 build/trayIconTemplate.svg \
  -o build/trayIconTemplate@2x.png --width 44 --height 44 --background=transparent
```

如果 `@resvg/resvg-cli` 不可用,任意工具(Figma 导出 / `sharp` 脚本 / `rsvg-convert`)产出符合规格的 PNG 即可,产物以提交进仓库为准。

`build/icon.icns` 与 `build/icon.png` 保留不动,继续作为 .app 主图标。

### 2. 代码改动

**`src/main/tray.ts`**:在创建 `Tray` 前显式设置模板图属性。

```ts
const image = createImage(iconPath)
image.setTemplateImage(true)
const tray = new TrayCtor(image)
```

Mock 中的 `createImage` 需要返回包含 `setTemplateImage` 的对象。

**`src/main/index.ts`**:把 `getTrayIconPath()` 内的 fallback 逻辑抽成同文件可导出的纯函数,便于单测,失去候选时打印 warning(便于排查),而不是静默返回空。

```ts
export function resolveTrayIconPath(
  candidates: readonly string[],
  fileExists: (path: string) => boolean = existsSync
): string {
  for (const candidate of candidates) {
    if (candidate && fileExists(candidate)) return candidate
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

`resolveTrayIconPath` 是纯函数(候选数组 + 注入 `fileExists`),不依赖 Electron 运行时,可在 Vitest 下直接测试。

@2x 资源不需要在代码中显式声明:Electron / macOS 在加载 `foo.png` 时会自动尝试 `foo@2x.png`,只要同目录存在。

**`package.json`** 的 `build` 字段新增 `extraResources`,把 PNG 复制到 `.app/Contents/Resources/`:

```json
"build": {
  "appId": "com.lazy.lazytrans",
  "productName": "LazyTrans",
  "asar": true,
  "files": ["out/**/*", "package.json"],
  "extraResources": [
    { "from": "build/trayIconTemplate.png",    "to": "trayIconTemplate.png" },
    { "from": "build/trayIconTemplate@2x.png", "to": "trayIconTemplate@2x.png" }
  ],
  "directories": { "output": "release" },
  "mac": {
    "category": "public.app-category.productivity",
    "icon": "build/icon.icns",
    "identity": null,
    "target": ["dir"]
  }
}
```

### 3. 测试改动

`src/main/tray.test.ts`:

- `createImage` mock 返回带 `setTemplateImage: vi.fn()` 的对象。
- 新增断言:`createTrayMenu(...)` 后,该 mock 被以 `true` 调用过一次。

新增 `src/main/tray-icon-path.test.ts`(或追加到 `tray.test.ts` 末尾的 describe 块):

- 第一候选存在时返回该候选。
- 所有候选都不存在时返回空字符串。
- 跳过 falsy 候选(空字符串)。

`resolveTrayIconPath` 是纯函数 + 注入 `fileExists`,无需 mock 文件系统。

### 4. 错误处理

- `setupTray()` 维持现有 try-catch,失败时仍写错误日志,不阻塞应用启动。
- 图标资源缺失时 `getTrayIconPath()` 写 `console.warn`,Tray 创建仍可完成(empty image),保留菜单可用。

## 验证步骤

自动:

```bash
npm run typecheck
npm test
```

人工:

1. `npm run dev` 启动,menubar 右上角可见双语图标。
2. 系统外观切换深 / 浅色模式,图标自动反色。
3. macOS 14+ 的 menubar 自动模式(跟随壁纸):分别在浅色壁纸 / 深色壁纸下检查图标可见。
4. `npm run dist:mac` 后启动 `release/mac-arm64/LazyTrans.app`,menubar 同样可见。
5. `ls release/mac-arm64/LazyTrans.app/Contents/Resources/trayIconTemplate*.png` 两份资源都存在。

## 风险

- `@resvg/resvg-cli` 在某些网络环境下 `npx` 拉取失败。规避:任何工具生成符合规格的 PNG 都可接受,产物以仓库中提交的 PNG 为准。
- macOS 上 `Template` 后缀自动识别行为在不同 Electron 版本不稳定,因此并用显式 `image.setTemplateImage(true)` 作为兜底。
- 修改 `build.extraResources` 后,首次重新打包后请人工检查 `.app/Contents/Resources/` 是否包含两份 PNG。
