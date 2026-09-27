/** @jsxImportSource @opentui/solid */
import type { Plugin } from "@opencode/plugin/tui"
import { createMemo, createSignal, Match, Show, Switch, type Accessor } from "solid-js"
import type { Usage } from "./codex-usage.js"
import type { GoUsage } from "./go-usage.js"
import { CodexUsage } from "./rpc.js"

const REFRESH_INTERVAL_MS = 60 * 1000
const REQUEST_TIMEOUT_MS = 10 * 1000
const POST_SESSION_REFRESH_DELAYS_MS = [2_000, 15_000]

type UsageState =
  | { status: "hidden" }
  | { status: "ready"; usage: Usage | GoUsage }
  | { status: "error"; message: string }

function resetTime(epochSeconds: number | null, weekly: boolean) {
  if (epochSeconds === null) return "after first use"
  const options: Intl.DateTimeFormatOptions = weekly
    ? { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }
    : { hour: "2-digit", minute: "2-digit" }
  return new Intl.DateTimeFormat(undefined, options).format(new Date(epochSeconds * 1000))
}

function percent(value: number) {
  return `${new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 }).format(value)}% used`
}

function UsageView(props: { api: Plugin.Context; state: Accessor<UsageState>; title: string }) {
  const theme = () => props.api.theme.text
  const error = createMemo(() => {
    const state = props.state()
    return state.status === "error" ? state.message : undefined
  })
  const usage = createMemo(() => {
    const state = props.state()
    return state.status === "ready" ? state.usage : undefined
  })
  const monthly = createMemo(() => {
    const value = usage()
    return value && "monthly" in value ? (value as GoUsage).monthly : undefined
  })
  const color = (value: number) => {
    if (value >= 90) return theme().feedback.error.base
    if (value >= 75) return theme().feedback.warning.base
    return theme().muted
  }

  return (
    <box>
      <text fg={theme().base}>
        <b>{props.title}</b>
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
              <Show when={monthly()}>
                {(month) => (
                  <>
                    <box flexDirection="row" justifyContent="space-between">
                      <text fg={theme().muted}>Monthly</text>
                      <text fg={color(month().usedPercent)}>{percent(month().usedPercent)}</text>
                    </box>
                    <text fg={theme().muted}>Resets {resetTime(month().resetAt, true)}</text>
                  </>
                )}
              </Show>
            </>
          )}
        </Match>
      </Switch>
    </box>
  )
}

const setup = (api: Plugin.Context) => {
  const client = api.client.rpc(CodexUsage)
  const [codexState, setCodexState] = createSignal<UsageState>({ status: "hidden" })
  const [goState, setGoState] = createSignal<UsageState>({ status: "hidden" })
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
    const options = {
      signal: request.signal,
      location: api.location ?? api.data.location.default(),
    }
    const load = (call: Promise<Usage | GoUsage | null>, update: (state: UsageState) => void) =>
      call
        .then((usage) => {
          if (!disposed) update(usage ? { status: "ready", usage } : { status: "hidden" })
        })
        .catch((error: unknown) => {
          if (disposed) return
          const message =
            error instanceof Error && error.name === "AbortError"
              ? "Usage request timed out"
              : error instanceof Error
                ? error.message
                : String(error)
          update({ status: "error", message })
        })

    activeRequest = Promise.all([
      load(client.get({}, options) as Promise<Usage | null>, setCodexState),
      load(client.go({}, options) as Promise<GoUsage | null>, setGoState),
    ]).then(() => undefined).finally(() => {
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
      <Show when={codexState().status !== "hidden" || goState().status !== "hidden"}>
        <box>
          <Show when={codexState().status !== "hidden"}>
            <UsageView api={api} state={codexState} title="Codex usage" />
          </Show>
          <Show when={goState().status !== "hidden"}>
            <UsageView api={api} state={goState} title="OpenCode Go usage" />
          </Show>
        </box>
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

export default {
  id: "codex-usage-sidebar",
  setup,
} satisfies Plugin.Definition
