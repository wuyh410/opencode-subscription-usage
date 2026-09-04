# OpenCode Codex Usage

[English](#english) | [简体中文](#简体中文)

## English

A TUI plugin that displays ChatGPT Codex subscription usage in the OpenCode sidebar.

> [!WARNING]
> This project is **not published to npm**. The package currently using the name
> `opencode-codex-usage` on npm belongs to a different project and author. Do not run
> `npx opencode-codex-usage` or `opencode plugin opencode-codex-usage`. Install only from
> this repository's [GitHub Releases](https://github.com/yanh00NG/opencode-codex-usage/releases)
> or from source.

### Features

- Shows the percentage used for the 5-hour and weekly Codex limits
- Shows both reset times in your local time zone
- Fetches usage when OpenCode starts
- Refreshes about 2 seconds and 15 seconds after a session becomes idle, allowing for usage-reporting delay
- Refreshes every minute as a fallback
- Makes no model requests and consumes no additional Codex model quota

### Requirements

- OpenCode 1.18.23 or later (also verified with 1.18.27)
- An OpenAI account connected in OpenCode using the `ChatGPT Plus/Pro` login method
- A terminal wide enough for OpenCode to show its sidebar

### Install From GitHub Release

This method requires Node.js 20 or later.

1. Download `opencode-codex-usage-0.2.0.tgz` from the
   [v0.2.0 release](https://github.com/yanh00NG/opencode-codex-usage/releases/tag/v0.2.0).
2. Run the following commands in the download directory:

```powershell
npm install --global .\opencode-codex-usage-0.2.0.tgz
opencode-codex-usage install
```

Quit and restart OpenCode after installation. OpenCode loads TUI plugins only at startup.

### Install Without Node.js

The attached `.tgz` contains the prebuilt plugin. PowerShell and `tar` are required, but Node.js is not.

```powershell
tar -xzf .\opencode-codex-usage-0.2.0.tgz
pwsh -NoProfile -ExecutionPolicy Bypass -File .\package\install.ps1
```

The automatically generated `Source code` archives on the GitHub release do not contain `dist/`.
Use the attached `.tgz` for the no-Node.js installation method.

Quit and restart OpenCode after installation.

### Install From Source

```powershell
git clone https://github.com/yanh00NG/opencode-codex-usage.git
cd opencode-codex-usage
npm ci
npm run build
node .\bin\opencode-codex-usage.mjs install
```

Quit and restart OpenCode after installation.

### Uninstall

If installed with npm or from source:

```powershell
opencode-codex-usage uninstall
npm uninstall --global opencode-codex-usage
```

If installed without Node.js, remove the following plugin file and its exact entry from the `plugin` array
in `tui.json` or `tui.jsonc`:

```text
~/.config/opencode/tui-plugins/codex-usage-sidebar.js
./tui-plugins/codex-usage-sidebar.js
```

Quit and restart OpenCode after uninstalling.

### How It Works and Privacy

The plugin reads the OpenAI OAuth credential already stored by OpenCode and requests:

```text
https://chatgpt.com/backend-api/wham/usage
```

The access token and account ID are sent only to `chatgpt.com` as required for that request. The plugin
does not print, persist, or send credentials to any third party. Usage data is kept only in memory.

The response's `primary_window` is shown as the 5-hour limit and `secondary_window` as the weekly limit.
This is an internal ChatGPT/Codex endpoint, not a documented public API, so its URL or response format may
change without notice.

### Troubleshooting

#### The sidebar is missing

Restart OpenCode and widen the terminal. OpenCode hides the sidebar when the terminal is too narrow.

#### `Connect OpenAI with ChatGPT Plus/Pro`

Connect OpenAI in OpenCode and select the `ChatGPT Plus/Pro` login method.

#### `OpenAI login expired`

Send a normal OpenAI model request in OpenCode so OpenCode can refresh its OAuth token. The plugin retries
after the session finishes and during the next periodic refresh.

#### Usage does not change immediately

The upstream usage endpoint can take a few seconds to record a completed request. The plugin checks again
about 2 seconds and 15 seconds after session completion, then once per minute.

### Development

```powershell
npm ci
npm run typecheck
npm test
npm pack
```

Installer tests use isolated temporary configuration directories and do not modify your real OpenCode
configuration.

## 简体中文

一个在 OpenCode 侧边栏中显示 ChatGPT Codex 订阅用量的 TUI 插件。

> [!WARNING]
> 本项目**尚未发布到 npm**。npm 上当前名为 `opencode-codex-usage` 的包属于另一个项目和作者。
> 请勿运行 `npx opencode-codex-usage` 或 `opencode plugin opencode-codex-usage`。请仅从本仓库的
> [GitHub Releases](https://github.com/yanh00NG/opencode-codex-usage/releases) 或源码安装。

### 功能

- 显示 Codex 5 小时和每周额度的已使用百分比
- 按本地时区显示两个额度窗口的重置时间
- OpenCode 启动时查询用量
- 会话进入空闲状态约 2 秒和 15 秒后刷新，以兼顾上游用量统计延迟
- 每分钟进行一次兜底刷新
- 不调用模型，不消耗额外的 Codex 模型额度

### 要求

- OpenCode 1.18.23 或更高版本（也已在 1.18.27 上验证）
- 已在 OpenCode 中通过 `ChatGPT Plus/Pro` 登录方式连接 OpenAI
- 终端宽度足以让 OpenCode 显示侧边栏

### 从 GitHub Release 安装

此方法需要 Node.js 20 或更高版本。

1. 从 [v0.2.0 Release](https://github.com/yanh00NG/opencode-codex-usage/releases/tag/v0.2.0)
   下载 `opencode-codex-usage-0.2.0.tgz`。
2. 在下载目录中运行：

```powershell
npm install --global .\opencode-codex-usage-0.2.0.tgz
opencode-codex-usage install
```

安装后请完全退出并重新启动 OpenCode。OpenCode 只在启动时加载 TUI 插件。

### 不安装 Node.js

Release 附带的 `.tgz` 已包含构建后的插件。此方法需要 PowerShell 和 `tar`，但不需要 Node.js。

```powershell
tar -xzf .\opencode-codex-usage-0.2.0.tgz
pwsh -NoProfile -ExecutionPolicy Bypass -File .\package\install.ps1
```

GitHub Release 自动生成的 `Source code` 压缩包不包含 `dist/`。免 Node.js 安装必须使用 Release
中单独上传的 `.tgz` 附件。

安装后请完全退出并重新启动 OpenCode。

### 从源码安装

```powershell
git clone https://github.com/yanh00NG/opencode-codex-usage.git
cd opencode-codex-usage
npm ci
npm run build
node .\bin\opencode-codex-usage.mjs install
```

安装后请完全退出并重新启动 OpenCode。

### 卸载

如果通过 npm 本地包或源码安装：

```powershell
opencode-codex-usage uninstall
npm uninstall --global opencode-codex-usage
```

如果使用免 Node.js 方式安装，请删除以下插件文件，并从 `tui.json` 或 `tui.jsonc` 的 `plugin`
数组中删除对应的精确配置项：

```text
~/.config/opencode/tui-plugins/codex-usage-sidebar.js
./tui-plugins/codex-usage-sidebar.js
```

卸载后请完全退出并重新启动 OpenCode。

### 工作方式与隐私

插件读取 OpenCode 已保存在本机的 OpenAI OAuth 凭据，并请求：

```text
https://chatgpt.com/backend-api/wham/usage
```

访问令牌和账户 ID 仅按接口要求发送给 `chatgpt.com`。插件不会打印、持久化凭据，也不会将其
发送给任何第三方；用量数据只保存在内存中。

响应中的 `primary_window` 显示为 5 小时额度，`secondary_window` 显示为每周额度。该接口是
ChatGPT/Codex 的内部接口，不是公开文档化的 API，其地址或响应格式可能随时变化。

### 常见问题

#### 侧边栏没有出现

重新启动 OpenCode，并增大终端宽度。终端过窄时 OpenCode 会隐藏侧边栏。

#### 显示 `Connect OpenAI with ChatGPT Plus/Pro`

在 OpenCode 中连接 OpenAI，并选择 `ChatGPT Plus/Pro` 登录方式。

#### 显示 `OpenAI login expired`

在 OpenCode 中正常发送一次 OpenAI 模型请求，让 OpenCode 刷新 OAuth Token。插件会在会话结束后
和后续定时刷新时重试。

#### 用量没有立即变化

上游用量接口可能需要几秒钟记录刚完成的请求。插件会在会话结束约 2 秒和 15 秒后再次查询，
之后每分钟查询一次。

### 开发

```powershell
npm ci
npm run typecheck
npm test
npm pack
```

安装和卸载测试使用隔离的临时配置目录，不会修改真实的 OpenCode 配置。

## License

MIT
