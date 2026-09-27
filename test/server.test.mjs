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

test("Go RPC uses the active Go key independently of Codex credentials", async () => {
  let handlers
  let selected
  const originalFetch = globalThis.fetch
  const requested = []
  try {
    globalThis.fetch = async (url, { headers }) => {
      requested.push({ url, bearer: headers.Authorization })
      return Response.json({ usage: {
        rolling: { percent: 1, resetsAt: "2026-10-01T00:00:00Z" },
        weekly: { percent: 2, resetsAt: "2026-10-02T00:00:00Z" },
        monthly: { percent: 3, resetsAt: "2026-10-03T00:00:00Z" },
      } })
    }
    await plugin.setup({
      integration: { connection: {
        active: async (id) => {
          assert.ok(["opencode", "opencode-go"].includes(id))
          if (id === "opencode") return undefined
          return selected
        },
        resolve: async (connection) => ({ type: "key", key: `go-key-${connection.id}` }),
      } },
      rpc: { register: async (_definition, implementation) => { handlers = implementation } },
    })
    const call = () => handlers.go({}, { signal: new AbortController().signal })
    assert.equal(await call(), null)
    selected = { id: "first" }
    assert.equal((await call()).monthly.usedPercent, 3)
    selected = { id: "second" }
    await call()
    assert.deepEqual(requested, [
      { url: "https://opencode.ai/zen/go/v1/usage", bearer: "Bearer go-key-first" },
      { url: "https://opencode.ai/zen/go/v1/usage", bearer: "Bearer go-key-second" },
    ])
  } finally {
    globalThis.fetch = originalFetch
  }
})

test("Go RPC prefers the active Console login, with no Go API key required", async () => {
  let handlers
  let selected = { id: "first" }
  const originalFetch = globalThis.fetch
  const requests = []
  try {
    globalThis.fetch = async (url, { headers }) => {
      requests.push({ url: String(url), headers })
      return Response.json({ access: {
        endsAt: "2026-10-31T00:00:00Z",
        meters: {
          fiveHour: { usedMicroCents: "125", limitMicroCents: "1000", resetsAt: null },
          week: { usedMicroCents: "4", limitMicroCents: "10", resetsAt: "2026-10-05T00:00:00Z" },
          month: { usedMicroCents: "7", limitMicroCents: "10" },
        },
      } })
    }
    await plugin.setup({
      integration: { connection: {
        active: async (id) => {
          if (id === "opencode") return selected
          assert.equal(id, "opencode-go")
          return undefined
        },
        resolve: async (connection) => ({ type: "oauth", access: `console-${connection.id}`, metadata: {
          orgID: "workspace-1", server: "https://opencode.ai/console/",
        } }),
      } },
      rpc: { register: async (_definition, implementation) => { handlers = implementation } },
    })
    const call = () => handlers.go({}, { signal: new AbortController().signal })
    assert.deepEqual(await call(), {
      fiveHour: { usedPercent: 12.5, resetAt: null },
      weekly: { usedPercent: 40, resetAt: Date.parse("2026-10-05T00:00:00Z") / 1000 },
      monthly: { usedPercent: 70, resetAt: Date.parse("2026-10-31T00:00:00Z") / 1000 },
    })
    selected = { id: "second" }
    await call()
    assert.deepEqual(requests.map(({ url, headers }) => ({ url, bearer: headers.Authorization, org: headers["x-org-id"] })), [
      { url: "https://opencode.ai/console/api/go/status", bearer: "Bearer console-first", org: "workspace-1" },
      { url: "https://opencode.ai/console/api/go/status", bearer: "Bearer console-second", org: "workspace-1" },
    ])
  } finally {
    globalThis.fetch = originalFetch
  }
})
