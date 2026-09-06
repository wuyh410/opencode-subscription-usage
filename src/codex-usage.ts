import { readFile } from "node:fs/promises"
import { homedir } from "node:os"
import { join } from "node:path"

export type LimitWindow = {
  usedPercent: number
  resetAt: number
}

export type Usage = {
  fiveHour: LimitWindow
  weekly: LimitWindow
}

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
  if (injected !== undefined) return (JSON.parse(injected) as { openai?: OAuthCredential }).openai

  try {
    const content = await readFile(join(homedir(), ".local", "share", "opencode", "auth.json"), "utf8")
    return (JSON.parse(content) as { openai?: OAuthCredential }).openai
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined
    throw error
  }
}

export async function fetchUsage(signal: AbortSignal): Promise<Usage | undefined> {
  const credential = await readOpenAIAuth()
  if (credential?.type !== "oauth" || !credential.access) return undefined

  const headers: Record<string, string> = {
    Accept: "application/json",
    Authorization: `Bearer ${credential.access}`,
  }
  const accountId = credential.accountId ?? accountIdFromToken(credential.access)
  if (accountId) headers["ChatGPT-Account-Id"] = accountId

  const response = await fetch("https://chatgpt.com/backend-api/wham/usage", { headers, signal })
  if (response.status === 401) return undefined
  if (!response.ok) throw new Error(`Usage request failed (${response.status})`)

  const body = (await response.json()) as UsageResponse
  return {
    fiveHour: parseWindow(body.rate_limit?.primary_window, "5h"),
    weekly: parseWindow(body.rate_limit?.secondary_window, "Weekly"),
  }
}
