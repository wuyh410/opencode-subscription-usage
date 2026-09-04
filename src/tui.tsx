/** @jsxImportSource @opentui/solid */
import type { TuiPluginApi, TuiPluginModule } from "@opencode-ai/plugin/tui"
import { readFile } from "node:fs/promises"
import { homedir } from "node:os"
import { join } from "node:path"
import { createMemo, createSignal, Match, Switch, type Accessor } from "solid-js"

const REFRESH_INTERVAL_MS = 5 * 60 * 1000
const REQUEST_TIMEOUT_MS = 10 * 1000

type LimitWindow = {
  usedPercent: number
  resetAt: number
}

type Usage = {
  fiveHour: LimitWindow
  weekly: LimitWindow
}

type UsageState =
  | { status: "loading" }
  | { status: "ready"; usage: Usage }
  | { status: "error"; message: string }

type OAuthCredential = {
  type?: string
  access?: string
  accountId?: string
}

type UsageResponse = {
  rate_limit?: {
    primary_window?: unknown
    secondary_window?: unknown
  }
}

function accountIdFromToken(token: string) {
  try {
    const payload = JSON.parse(Buffer.from(token.split(".")[1] ?? "", "base64url").toString("utf8")) as Record<
      string,
      unknown
    >
    const auth = payload["https://api.openai.com/auth"] as Record<string, unknown> | undefined
    return (payload.chatgpt_account_id as string | undefined) ?? (auth?.chatgpt_account_id as string | undefined)
  } catch {
    return undefined
  }
}

function parseWindow(value: unknown, name: string): LimitWindow {
  if (!value || typeof value !== "object") throw new Error(`${name} limit is unavailable`)
  const input = value as Record<string, unknown>
  const usedPercent = Number(input.used_percent)
  const resetAt = Number(input.reset_at)
  if (!Number.isFinite(usedPercent) || !Number.isFinite(resetAt)) {
    throw new Error(`${name} limit is invalid`)
  }
  return { usedPercent, resetAt }
}

async function readOpenAIAuth(): Promise<OAuthCredential | undefined> {
  const injected = process.env.OPENCODE_AUTH_CONTENT
  const content = injected ?? (await readFile(join(homedir(), ".local", "share", "opencode", "auth.json"), "utf8"))
  return (JSON.parse(content) as { openai?: OAuthCredential }).openai
}

async function fetchUsage(signal: AbortSignal): Promise<Usage> {
  const credential = await readOpenAIAuth()
  if (credential?.type !== "oauth" || !credential.access) {
    throw new Error("Connect OpenAI with ChatGPT Plus/Pro")
  }

  const headers: Record<string, string> = {
    Accept: "application/json",
    Authorization: `Bearer ${credential.access}`,
  }
  const accountId = credential.accountId ?? accountIdFromToken(credential.access)
  if (accountId) headers["ChatGPT-Account-Id"] = accountId

  const response = await fetch("https://chatgpt.com/backend-api/wham/usage", { headers, signal })
  if (!response.ok) {
    if (response.status === 401) throw new Error("OpenAI login expired")
    throw new Error(`Usage request failed (${response.status})`)
  }

  const body = (await response.json()) as UsageResponse
  return {
    fiveHour: parseWindow(body.rate_limit?.primary_window, "5h"),
    weekly: parseWindow(body.rate_limit?.secondary_window, "Weekly"),
  }
}

function resetTime(epochSeconds: number, weekly: boolean) {
  const options: Intl.DateTimeFormatOptions = weekly
    ? { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }
    : { hour: "2-digit", minute: "2-digit" }
  return new Intl.DateTimeFormat(undefined, options).format(new Date(epochSeconds * 1000))
}

function percent(value: number) {
  return `${Math.round(value)}% used`
}

function UsageView(props: { api: TuiPluginApi; state: Accessor<UsageState> }) {
  const theme = () => props.api.theme.current
  const error = createMemo(() => {
    const state = props.state()
    return state.status === "error" ? state.message : undefined
  })
  const usage = createMemo(() => {
    const state = props.state()
    return state.status === "ready" ? state.usage : undefined
  })
  const color = (value: number) => {
    if (value >= 90) return theme().error
    if (value >= 75) return theme().warning
    return theme().textMuted
  }

  return (
    <box>
      <text fg={theme().text}>
        <b>Codex usage</b>
      </text>
      <Switch>
        <Match when={props.state().status === "loading"}>
          <text fg={theme().textMuted}>Loading...</text>
        </Match>
        <Match when={error()}>
          {(message) => (
            <text fg={theme().error} wrapMode="word">
              {message()}
            </text>
          )}
        </Match>
        <Match when={usage()}>
          {(current) => (
            <>
              <box flexDirection="row" justifyContent="space-between">
                <text fg={theme().textMuted}>5h</text>
                <text fg={color(current().fiveHour.usedPercent)}>{percent(current().fiveHour.usedPercent)}</text>
              </box>
              <text fg={theme().textMuted}>Resets {resetTime(current().fiveHour.resetAt, false)}</text>
              <box flexDirection="row" justifyContent="space-between">
                <text fg={theme().textMuted}>Weekly</text>
                <text fg={color(current().weekly.usedPercent)}>{percent(current().weekly.usedPercent)}</text>
              </box>
              <text fg={theme().textMuted}>Resets {resetTime(current().weekly.resetAt, true)}</text>
            </>
          )}
        </Match>
      </Switch>
    </box>
  )
}

const tui = async (api: TuiPluginApi) => {
  const [state, setState] = createSignal<UsageState>({ status: "loading" })
  let activeRequest: Promise<void> | undefined

  const refresh = () => {
    if (activeRequest) return activeRequest
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
    activeRequest = fetchUsage(controller.signal)
      .then((usage) => {
        setState({ status: "ready", usage })
      })
      .catch((error: unknown) => {
        const message =
          error instanceof Error && error.name === "AbortError"
            ? "Usage request timed out"
            : error instanceof Error
              ? error.message
              : String(error)
        setState({ status: "error", message })
      })
      .finally(() => {
        clearTimeout(timeout)
        activeRequest = undefined
      })
    return activeRequest
  }

  api.slots.register({
    order: 150,
    slots: {
      sidebar_content() {
        return <UsageView api={api} state={state} />
      },
    },
  })

  const interval = setInterval(() => void refresh(), REFRESH_INTERVAL_MS)
  const stopIdleRefresh = api.event.on("session.idle", () => void refresh())
  api.lifecycle.onDispose(() => {
    clearInterval(interval)
    stopIdleRefresh()
  })

  void refresh()
}

export default {
  id: "codex-usage-sidebar",
  tui,
} satisfies TuiPluginModule & { id: string }
