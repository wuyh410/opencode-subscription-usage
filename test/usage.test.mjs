import assert from "node:assert/strict"
import test from "node:test"
import { fetchUsage } from "../dist/codex-usage.js"

test("fetchUsage only returns usage for a logged-in Codex account", async () => {
  const originalAuth = process.env.OPENCODE_AUTH_CONTENT
  const originalFetch = globalThis.fetch
  const signal = new AbortController().signal

  try {
    let requestCount = 0
    globalThis.fetch = async () => {
      requestCount++
      return new Response(null, { status: 401 })
    }

    process.env.OPENCODE_AUTH_CONTENT = "{}"
    assert.equal(await fetchUsage(signal), undefined)
    assert.equal(requestCount, 0)

    process.env.OPENCODE_AUTH_CONTENT = JSON.stringify({
      openai: { type: "oauth", access: "expired-token", accountId: "account-1" },
    })
    assert.equal(await fetchUsage(signal), undefined)
    assert.equal(requestCount, 1)

    let requestHeaders
    globalThis.fetch = async (_url, init) => {
      requestHeaders = init.headers
      return Response.json({
        rate_limit: {
          primary_window: { used_percent: 25, reset_at: 1_800_000_000 },
          secondary_window: { used_percent: 50, reset_at: 1_800_100_000 },
        },
      })
    }
    process.env.OPENCODE_AUTH_CONTENT = JSON.stringify({
      openai: { type: "oauth", access: "active-token", accountId: "account-2" },
    })

    assert.deepEqual(await fetchUsage(signal), {
      fiveHour: { usedPercent: 25, resetAt: 1_800_000_000 },
      weekly: { usedPercent: 50, resetAt: 1_800_100_000 },
    })
    assert.equal(requestHeaders.Authorization, "Bearer active-token")
    assert.equal(requestHeaders["ChatGPT-Account-Id"], "account-2")
  } finally {
    globalThis.fetch = originalFetch
    if (originalAuth === undefined) delete process.env.OPENCODE_AUTH_CONTENT
    else process.env.OPENCODE_AUTH_CONTENT = originalAuth
  }
})
