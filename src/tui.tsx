/** @jsxImportSource @opentui/solid */
import type { TuiPluginApi, TuiPluginModule } from "@opencode-ai/plugin/tui"
import { createMemo, createSignal, Match, Show, Switch, type Accessor } from "solid-js"
import { fetchUsage, type Usage } from "./codex-usage.js"

const REFRESH_INTERVAL_MS = 60 * 1000
const REQUEST_TIMEOUT_MS = 10 * 1000
const POST_SESSION_REFRESH_DELAYS_MS = [2_000, 15_000]

type UsageState =
  | { status: "hidden" }
  | { status: "ready"; usage: Usage }
  | { status: "error"; message: string }

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
  const [state, setState] = createSignal<UsageState>({ status: "hidden" })
  let activeRequest: Promise<void> | undefined
  let refreshAgain = false
  let disposed = false
  const pendingRefreshes = new Set<ReturnType<typeof setTimeout>>()

  const refresh = () => {
    if (activeRequest) {
      refreshAgain = true
      return activeRequest
    }
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
    activeRequest = fetchUsage(controller.signal)
      .then((usage) => {
        setState(usage ? { status: "ready", usage } : { status: "hidden" })
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
        if (refreshAgain && !disposed) {
          refreshAgain = false
          void refresh()
        }
      })
    return activeRequest
  }

  const schedulePostSessionRefresh = () => {
    for (const timer of pendingRefreshes) clearTimeout(timer)
    pendingRefreshes.clear()
    for (const delay of POST_SESSION_REFRESH_DELAYS_MS) {
      const timer = setTimeout(() => {
        pendingRefreshes.delete(timer)
        void refresh()
      }, delay)
      pendingRefreshes.add(timer)
    }
  }

  api.slots.register({
    order: 150,
    slots: {
      sidebar_content() {
        return (
          <Show when={state().status !== "hidden"}>
            <UsageView api={api} state={state} />
          </Show>
        )
      },
    },
  })

  const interval = setInterval(() => void refresh(), REFRESH_INTERVAL_MS)
  const stopIdleRefresh = api.event.on("session.idle", schedulePostSessionRefresh)
  api.lifecycle.onDispose(() => {
    disposed = true
    refreshAgain = false
    clearInterval(interval)
    for (const timer of pendingRefreshes) clearTimeout(timer)
    pendingRefreshes.clear()
    stopIdleRefresh()
  })

  void refresh()
}

export default {
  id: "codex-usage-sidebar",
  tui,
} satisfies TuiPluginModule & { id: string }
