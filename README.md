# OpenCode Codex Usage

在 OpenCode 右侧栏显示 ChatGPT Codex 订阅的 5 小时和每周用量。

## 功能

- 显示 `5h` 和 `Weekly` 已使用百分比
- 显示两个额度窗口的本地重置时间
- OpenCode 启动时自动查询
- 每次会话结束后自动更新
- 每 5 分钟后台刷新
- 不调用模型，不消耗额外 Codex 额度
- 不打印 Token，也不将 Token 发送给 OpenAI 之外的第三方

## 要求

- OpenCode 1.18.23 或更高版本
- 已通过 OpenCode `/connect` 使用 `ChatGPT Plus/Pro` 登录 OpenAI
- 终端宽度足以显示 OpenCode 右侧栏

## 从本地安装包安装

先安装生成的 `.tgz`：

```powershell
npm install --global .\opencode-codex-usage-0.1.0.tgz
opencode-codex-usage install
```

退出并重新启动 OpenCode 后生效。

## 不安装 Node.js

在项目目录中运行 PowerShell 安装脚本：

```powershell
pwsh -NoProfile -ExecutionPolicy Bypass -File .\install.ps1
```

也可以指定 OpenCode 配置目录：

```powershell
pwsh -NoProfile -ExecutionPolicy Bypass -File .\install.ps1 -ConfigDir "D:\path\to\opencode"
```

脚本直接安装已经构建好的 `dist/tui.js`，不调用 `node`、`npm` 或 `npx`。退出并重新启动 OpenCode 后生效。

## 从源码安装

```powershell
npm install
npm run build
node .\bin\opencode-codex-usage.mjs install
```

## 卸载

```powershell
opencode-codex-usage uninstall
npm uninstall --global opencode-codex-usage
```

退出并重新启动 OpenCode，以卸载当前运行中的插件实例。

卸载程序只会删除：

- `~/.config/opencode/tui-plugins/codex-usage-sidebar.js`
- `tui.json` 或 `tui.jsonc` 中由本包添加的插件项

其他插件、配置和 OpenAI 登录凭据不会被删除。

## 发布后安装

包发布到 npm 后，可以直接运行：

```powershell
npx -y opencode-codex-usage install
```

包也提供标准 OpenCode TUI 入口 `./tui`，因此发布后可使用官方安装器：

```powershell
opencode plugin opencode-codex-usage --global
```

OpenCode 官方安装器目前没有对应的卸载命令；卸载仍使用：

```powershell
npx -y opencode-codex-usage uninstall
```

## 工作方式

插件读取 OpenCode 保存在本机的 OpenAI OAuth 凭据，并请求 Codex 使用情况接口：

```text
https://chatgpt.com/backend-api/wham/usage
```

返回数据中的 `primary_window` 对应 5 小时额度，`secondary_window` 对应每周额度。

该接口是 ChatGPT/Codex 的内部接口，不是公开稳定 API，未来 OpenAI 可能修改地址或响应格式。

## 常见问题

### 侧栏没有出现

确认已经重启 OpenCode，并增大终端宽度。OpenCode 在较窄的终端中会隐藏右侧栏。

### 显示 `Connect OpenAI with ChatGPT Plus/Pro`

在 OpenCode 中运行 `/connect`，选择 OpenAI，然后选择 `ChatGPT Plus/Pro` 完成登录。

### 显示 `OpenAI login expired`

先在 OpenCode 中正常发送一次 OpenAI 模型请求，让 OpenCode 刷新 OAuth Token。插件会在会话结束后重新查询。

## 开发

```powershell
npm run typecheck
npm test
npm pack
```

安装和卸载测试使用隔离的临时配置目录，不会修改真实 OpenCode 配置。

## License

MIT
