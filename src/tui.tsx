/** @jsxImportSource @opentui/solid */
import { Plugin } from "@opencode/plugin/tui"
import { createMemo, createSignal, Match, Show, Switch, type Accessor } from "solid-js"
import type { Usage } from "./codex-usage.js"
import { CodexUsage } from "./rpc.js"

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

function UsageView(props: { api: Plugin.Context; state: Accessor<UsageState> }) {
  const theme = () => props.api.theme.text
  const error = createMemo(() => {
    const state = props.state()
    return state.status === "error" ? state.message : undefined
  })
  const usage = createMemo(() => {
    const state = props.state()
    return state.status === "ready" ? state.usage : undefined
  })
  const color = (value: number) => {
    if (value >= 90) return theme().feedback.error.base
    if (value >= 75) return theme().feedback.warning.base
    return theme().muted
  }

  return (
    <box>
      <text fg={theme().base}>
        <b>Codex usage</b>
      </text>
      <Switch>
        <Match when={error()}>
          {(message) => (
            <text fg={theme().feedback.error.base} wrapMode="word">
              {message()}
            </text>
          )}
        </Match>
        <Match when={usage()}>
          {(current) => (
            <>
              <box flexDirection="row" justifyContent="space-between">
                <text fg={theme().muted}>5h</text>
                <text fg={color(current().fiveHour.usedPercent)}>{percent(current().fiveHour.usedPercent)}</text>
              </box>
              <text fg={theme().muted}>Resets {resetTime(current().fiveHour.resetAt, false)}</text>
              <box flexDirection="row" justifyContent="space-between">
                <text fg={theme().muted}>Weekly</text>
                <text fg={color(current().weekly.usedPercent)}>{percent(current().weekly.usedPercent)}</text>
              </box>
              <text fg={theme().muted}>Resets {resetTime(current().weekly.resetAt, true)}</text>
            </>
          )}
        </Match>
      </Switch>
    </box>
  )
}

const setup = (api: Plugin.Context) => {
  const client = api.client.rpc(CodexUsage)
  const [state, setState] = createSignal<UsageState>({ status: "hidden" })
  let activeRequest: Promise<void> | undefined
  let refreshAgain = false
  let disposed = false
  let controller: AbortController | undefined
  const pendingRefreshes = new Set<ReturnType<typeof setTimeout>>()

  const refresh = () => {
    if (disposed) return
    if (activeRequest) {
      refreshAgain = true
      return activeRequest
    }
    controller = new AbortController()
    const request = controller
    const timeout = setTimeout(() => request.abort(), REQUEST_TIMEOUT_MS)
    activeRequest = client.get({}, {
      signal: request.signal,
      location: api.location ?? api.data.location.default(),
    })
      .then((result) => {
        if (disposed) return
        const usage = result as Usage | null
        setState(usage ? { status: "ready", usage } : { status: "hidden" })
      })
      .catch((error: unknown) => {
        if (disposed) return
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
        controller = undefined
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

  const removeSlot = api.ui.slot({
    append: "sidebar.content",
    render: () => (
      <Show when={state().status !== "hidden"}>
        <UsageView api={api} state={state} />
      </Show>
    ),
  })

  const interval = setInterval(() => void refresh(), REFRESH_INTERVAL_MS)
  const stopIdleRefresh = api.data.on("session.idle", schedulePostSessionRefresh)
  const stopCredentialRefresh = api.data.on("credential.updated", () => void refresh())
  const stopAccountRefresh = api.data.on("credential.switched", () => void refresh())

  void refresh()
  return () => {
    disposed = true
    refreshAgain = false
    clearInterval(interval)
    controller?.abort()
    for (const timer of pendingRefreshes) clearTimeout(timer)
    pendingRefreshes.clear()
    stopIdleRefresh()
    stopCredentialRefresh()
    stopAccountRefresh()
    removeSlot()
  }
}

export default Plugin.define({
  id: "codex-usage-sidebar",
  setup,
})
