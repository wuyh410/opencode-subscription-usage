export type LimitWindow = {
  usedPercent: number
  resetAt: number
}

export type Usage = {
  fiveHour: LimitWindow
  weekly: LimitWindow
}

export type OAuthCredential = {
  type?: string
  access?: string
  metadata?: Record<string, unknown>
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

export async function fetchUsage(credential: OAuthCredential | undefined, signal: AbortSignal): Promise<Usage | undefined> {
  if (credential?.type !== "oauth" || !credential.access) return undefined

  const headers: Record<string, string> = {
    Accept: "application/json",
    Authorization: `Bearer ${credential.access}`,
  }
  const accountId = credential.metadata?.accountId ?? accountIdFromToken(credential.access)
  if (typeof accountId === "string" && accountId) headers["ChatGPT-Account-Id"] = accountId

  const response = await fetch("https://chatgpt.com/backend-api/wham/usage", { headers, signal })
  if (response.status === 401) return undefined
  if (!response.ok) throw new Error(`Usage request failed (${response.status})`)

  const body = (await response.json()) as UsageResponse
  return {
    fiveHour: parseWindow(body.rate_limit?.primary_window, "5h"),
    weekly: parseWindow(body.rate_limit?.secondary_window, "Weekly"),
  }
}
