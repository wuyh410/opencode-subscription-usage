import assert from "node:assert/strict"
import test from "node:test"
import { fetchConsoleGoUsage, fetchGoUsage } from "../dist/go-usage.js"

test("Go usage reads only the authenticated subscription's three windows", async () => {
  const originalFetch = globalThis.fetch
  const signal = new AbortController().signal
  let requests = 0
  try {
    globalThis.fetch = async (url, options) => {
      requests++
      assert.equal(url, "https://opencode.ai/zen/go/v1/usage")
      assert.deepEqual(options.headers, { Accept: "application/json", Authorization: "Bearer go-secret" })
      assert.equal(options.signal, signal)
      return Response.json({ usage: {
        rolling: { status: "ok", percent: 12.5, resetsAt: "2026-10-01T00:00:00.000Z" },
        weekly: { status: "ok", percent: 42, resetsAt: "2026-10-05T00:00:00.000Z" },
        monthly: { status: "ok", percent: 74.9, resetsAt: "2026-10-31T00:00:00.000Z" },
      } })
    }
    assert.equal(await fetchGoUsage(undefined, signal), undefined)
    assert.equal(requests, 0)
    assert.deepEqual(await fetchGoUsage("go-secret", signal), {
      fiveHour: { usedPercent: 12.5, resetAt: Date.parse("2026-10-01T00:00:00.000Z") / 1000 },
      weekly: { usedPercent: 42, resetAt: Date.parse("2026-10-05T00:00:00.000Z") / 1000 },
      monthly: { usedPercent: 74.9, resetAt: Date.parse("2026-10-31T00:00:00.000Z") / 1000 },
    })

    globalThis.fetch = async () => Response.json({ usage: { rolling: { percent: "12", resetsAt: "later" } } })
    await assert.rejects(fetchGoUsage("go-secret", signal), /Go 5h usage is invalid/)
    globalThis.fetch = async () => new Response(null, { status: 403 })
    await assert.rejects(fetchGoUsage("go-secret", signal), /subscription is required/)
    globalThis.fetch = async () => new Response(null, { status: 401 })
    await assert.rejects(fetchGoUsage("go-secret", signal), /API key is invalid/)
  } finally {
    globalThis.fetch = originalFetch
  }
})

test("Console Go status hides inactive subscriptions and rejects malformed meters", async () => {
  const originalFetch = globalThis.fetch
  const signal = new AbortController().signal
  const credential = { type: "oauth", access: "console-secret" }
  try {
    let requests = 0
    globalThis.fetch = async () => { requests++; return Response.json({ access: null }) }
    assert.equal(await fetchConsoleGoUsage(undefined, signal), undefined)
    assert.equal(requests, 0)
    assert.equal(await fetchConsoleGoUsage(credential, signal), undefined)
    globalThis.fetch = async () => Response.json({ access: { endsAt: "later", meters: {
      fiveHour: { usedMicroCents: "0", limitMicroCents: "0" },
    } } })
    await assert.rejects(fetchConsoleGoUsage(credential, signal), /Console Go 5h usage is invalid/)
    globalThis.fetch = async () => new Response(null, { status: 401 })
    await assert.rejects(fetchConsoleGoUsage(credential, signal), /Console login expired/)
  } finally {
    globalThis.fetch = originalFetch
  }
})
