import type { Plugin } from "@opencode/plugin"
import { fetchUsage } from "./codex-usage.js"
import { CodexUsage } from "./rpc.js"

export default {
  id: "codex-usage",
  async setup(ctx) {
    await ctx.rpc.register(CodexUsage, {
      get: async (_input, { signal }) => {
        const connection = await ctx.integration.connection.active("openai")
        const credential = connection ? await ctx.integration.connection.resolve(connection) : undefined
        return (await fetchUsage(credential, AbortSignal.any([signal, AbortSignal.timeout(10_000)]))) ?? null
      },
    })
  },
} satisfies Plugin.Plugin
