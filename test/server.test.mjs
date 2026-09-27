import assert from "node:assert/strict"
import test from "node:test"
import plugin from "../dist/index.js"

test("V2 RPC resolves the active account each time and returns only usage", async () => {
  let handlers
  let selected
  let resolved = 0
  const originalFetch = globalThis.fetch
  const requests = []
  const context = {
    integration: {
      connection: {
        active: async (id) => {
          assert.equal(id, "openai")
          return selected
        },
        resolve: async (connection) => {
          resolved++
          return { type: "oauth", access: `token-${connection.id}`, metadata: { accountId: connection.id } }
        },
      },
    },
    rpc: { register: async (_definition, implementation) => { handlers = implementation } },
  }
  try {
    globalThis.fetch = async (url, { headers, signal }) => {
      assert.equal(url, "https://chatgpt.com/backend-api/wham/usage")
      assert.equal(signal.aborted, false)
      requests.push(headers)
      return Response.json({ rate_limit: {
        primary_window: { used_percent: 25, reset_at: 1_800_000_000 },
        secondary_window: { used_percent: 50, reset_at: 1_800_100_000 },
      } })
    }
    await plugin.setup(context)
    const call = () => handlers.get(undefined, { signal: new AbortController().signal })
    assert.equal(await call(), null)
    assert.equal(resolved, 0)
    selected = { id: "first" }
    const usage = await call()
    assert.deepEqual(usage, {
      fiveHour: { usedPercent: 25, resetAt: 1_800_000_000 },
      weekly: { usedPercent: 50, resetAt: 1_800_100_000 },
    })
    selected = { id: "second" }
    await call()
    assert.equal(requests[0].Authorization, "Bearer token-first")
    assert.equal(requests[1]["ChatGPT-Account-Id"], "second")
    selected = undefined
    assert.equal(await call(), null)
    assert.equal(requests.length, 2)
  } finally {
    globalThis.fetch = originalFetch
  }
})
