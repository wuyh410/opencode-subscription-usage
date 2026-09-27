import type { Plugin } from "@opencode/plugin"
import { fetchUsage } from "./codex-usage.js"
import { fetchConsoleGoUsage, fetchGoUsage } from "./go-usage.js"
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
      go: async (_input, { signal }) => {
        const timeout = AbortSignal.any([signal, AbortSignal.timeout(10_000)])
        const consoleConnection = await ctx.integration.connection.active("opencode")
        if (consoleConnection) {
          const credential = await ctx.integration.connection.resolve(consoleConnection)
          const usage = await fetchConsoleGoUsage(credential, timeout)
          if (usage) return usage
        }
        const connection = await ctx.integration.connection.active("opencode-go")
        const credential = connection ? await ctx.integration.connection.resolve(connection) : undefined
        return (await fetchGoUsage(
          credential?.type === "key" ? credential.key : undefined,
          timeout,
        )) ?? null
      },
    })
  },
} satisfies Plugin.Plugin
