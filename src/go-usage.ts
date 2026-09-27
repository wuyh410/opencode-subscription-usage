export type GoWindow = { usedPercent: number; resetAt: number | null }
export type GoUsage = { fiveHour: GoWindow; weekly: GoWindow; monthly: GoWindow }

export type ConsoleCredential = {
  type: string
  access?: string
  key?: string
  metadata?: Record<string, unknown>
}

function parseWindow(value: unknown, name: string): GoWindow {
  if (!value || typeof value !== "object") throw new Error(`Go ${name} usage is unavailable`)
  const input = value as Record<string, unknown>
  const usedPercent = input.percent
  const resetAt = typeof input.resetsAt === "string" ? Date.parse(input.resetsAt) / 1000 : NaN
  if (typeof usedPercent !== "number" || !Number.isFinite(usedPercent) || !Number.isFinite(resetAt)) {
    throw new Error(`Go ${name} usage is invalid`)
  }
  return { usedPercent, resetAt }
}

export async function fetchGoUsage(key: string | undefined, signal: AbortSignal): Promise<GoUsage | undefined> {
  if (!key) return undefined

  const response = await fetch("https://opencode.ai/zen/go/v1/usage", {
    headers: { Accept: "application/json", Authorization: `Bearer ${key}` },
    signal,
  })
  if (response.status === 401) throw new Error("Go API key is invalid; reconnect OpenCode Go")
  if (response.status === 403) throw new Error("OpenCode Go subscription is required")
  if (!response.ok) throw new Error(`Go usage request failed (${response.status})`)

  const body = (await response.json()) as { usage?: Record<string, unknown> }
  return {
    fiveHour: parseWindow(body.usage?.rolling, "5h"),
    weekly: parseWindow(body.usage?.weekly, "weekly"),
    monthly: parseWindow(body.usage?.monthly, "monthly"),
  }
}

function consoleWindow(value: unknown, reset: unknown, name: string): GoWindow {
  if (!value || typeof value !== "object") throw new Error(`Console Go ${name} usage is unavailable`)
  const meter = value as Record<string, unknown>
  const used = Number(meter.usedMicroCents)
  const limit = Number(meter.limitMicroCents)
  if (!Number.isFinite(used) || !Number.isFinite(limit) || limit <= 0 || used < 0) {
    throw new Error(`Console Go ${name} usage is invalid`)
  }
  const resetAt = reset === null || reset === undefined ? null : typeof reset === "string" ? Date.parse(reset) / 1000 : NaN
  if (resetAt !== null && !Number.isFinite(resetAt)) throw new Error(`Console Go ${name} reset time is invalid`)
  return { usedPercent: (used / limit) * 100, resetAt }
}

export async function fetchConsoleGoUsage(
  credential: ConsoleCredential | undefined,
  signal: AbortSignal,
): Promise<GoUsage | undefined> {
  const token = credential?.type === "oauth" ? credential.access : credential?.type === "key" ? credential.key : undefined
  if (!token) return undefined

  const server = credential?.metadata?.server ?? "https://opencode.ai/console"
  if (typeof server !== "string") throw new Error("Invalid OpenCode Console server URL")
  const url = new URL(server)
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error("Invalid OpenCode Console server URL")
  url.pathname = `${url.pathname.replace(/\/+$/, "")}/api/go/status`
  const headers: Record<string, string> = { Accept: "application/json", Authorization: `Bearer ${token}` }
  const orgID = credential?.metadata?.orgID
  if (typeof orgID === "string") headers["x-org-id"] = orgID

  const response = await fetch(url, { headers, signal })
  if (response.status === 401) throw new Error("OpenCode Console login expired; reconnect OpenCode Console")
  if (response.status === 403) throw new Error("No permission to view OpenCode Go usage in this Console workspace")
  if (!response.ok) throw new Error(`Console Go usage request failed (${response.status})`)

  const body = (await response.json()) as { access?: {
    endsAt?: unknown
    meters?: { fiveHour?: Record<string, unknown>; week?: Record<string, unknown>; month?: Record<string, unknown> }
  } | null }
  if (!body.access) return undefined
  const meters = body.access.meters
  return {
    fiveHour: consoleWindow(meters?.fiveHour, meters?.fiveHour?.resetsAt, "5h"),
    weekly: consoleWindow(meters?.week, meters?.week?.resetsAt, "weekly"),
    monthly: consoleWindow(meters?.month, body.access.endsAt, "monthly"),
  }
}
