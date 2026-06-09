# LazyTrans

LazyTrans（懒译）是一个基于 Tauri 2 的极简 macOS 划词翻译工具。启动后应用会注册全局快捷键 `Option + D`，读取当前 App 中的选中文本，调用 OpenAI Chat Completions API，并在轻量悬浮窗口中显示原文和译文。

第一版只做 MVP：不包含 OCR、截图翻译和插件系统。

## 安装依赖

```bash
npm install
```

## 本地运行

```bash
OPENAI_API_KEY="your_api_key" npm run tauri:dev
```

也可以创建 `.env` 文件：

```bash
export OPENAI_API_KEY="your_api_key"
export TRANSLATE_API_BASE_URL="https://api.openai.com/v1"
export TRANSLATE_MODEL="gpt-4.1-mini"
```

## 打包 macOS 应用

```bash
npm run tauri:build
```

产物会生成在：

```text
src-tauri/target/release/bundle/macos/LazyTrans.app
```

当前打包产物是本地未签名版本，适合自己机器测试。首次运行时 macOS 可能需要在“隐私与安全性”里允许打开，并在“辅助功能”里给 LazyTrans 授权。

打包后的应用会按顺序尝试读取这些 `.env`：

```text
当前工作目录/.env
LazyTrans.app/Contents/MacOS/.env
LazyTrans.app/Contents/Resources/.env
Tauri 应用数据目录/.env
```

也可以配置更多环境变量：

```bash
OPENAI_API_KEY="your_api_key" \
TRANSLATE_API_BASE_URL="https://api.openai.com/v1" \
TRANSLATE_MODEL="gpt-4.1-mini" \
npm run tauri:dev
```

## 环境变量

- `OPENAI_API_KEY`：OpenAI API Key。
- `TRANSLATE_API_KEY`：可选，优先级高于 `OPENAI_API_KEY`，用于覆盖供应商 API Key。
- `TRANSLATE_API_BASE_URL`：可选，默认 `https://api.openai.com/v1`。
- `TRANSLATE_API_URL`：可选，等同于 `TRANSLATE_API_BASE_URL`，兼容部分供应商命名。
- `TRANSLATE_MODEL`：可选，默认 `gpt-4.1-mini`。

接口按 OpenAI Chat Completions 协议请求：

```text
POST {TRANSLATE_API_BASE_URL}/chat/completions
```

## 应用内 API 设置

点击窗口右上角的设置按钮，可以在应用内配置：

- API Key
- Base URL
- Model

应用内设置会保存到 macOS 用户数据目录，并优先于 `.env` 生效。保存后不需要重启应用，下一次翻译会直接使用新的接口配置。

如果首次启动时没有配置 API Key，窗口会自动打开设置面板并聚焦到 Key 输入框。Base URL 和 Model 可以留空，应用会使用默认值：

```text
Base URL: https://api.openai.com/v1
Model: gpt-4.1-mini
```

设置面板里的“测试”按钮会用当前配置发起一次轻量翻译请求，便于确认 Key、Base URL 和 Model 是否可用。

## macOS 辅助功能权限

LazyTrans 通过 `osascript` 模拟 `Command + C` 获取当前选中文本。首次使用时，macOS 可能会要求授予辅助功能权限。

如果快捷键触发后提示 `osascript 执行失败`，请打开：

```text
系统设置 -> 隐私与安全性 -> 辅助功能
```

然后允许当前终端应用或 LazyTrans 控制电脑。开发模式下通常需要给 Terminal、iTerm、Warp、VS Code 等启动 `npm run tauri:dev` 的应用授权。

## 快捷键

1. 在任意 macOS App 中选中文本。
2. 按 `Option + D`。
3. LazyTrans 会临时模拟 `Command + C` 读取选区，并恢复原剪贴板文本。
4. 悬浮窗口会显示原文、译文、状态或错误信息。

翻译方向会自动判断：中文翻译成英文，非中文翻译成中文。译文使用程序员风格，会尽量保留代码、命令、API、变量名、错误信息和常见技术术语。

如果 `Option + D` 被系统或其他应用占用，LazyTrans 会自动改用 `Command + Shift + D`，并在窗口里显示当前生效的快捷键。如果两个快捷键都注册失败，终端会输出注册失败原因。

没有选中文本时，窗口会显示“没有获取到选中文本”。

窗口会一直保留输入框。选中文本时，输入框会自动填入选区并翻译；没有选中文本时，输入框会自动填入当前剪贴板文本。按 `Enter` 会提交翻译，`Shift + Enter` 会换行。

翻译请求会流式显示结果。请求过程中可以点击停止按钮取消；结果区支持复制译文、复制原文、重新翻译，输入框支持一键清空。按 `Esc` 可以关闭悬浮窗口。
