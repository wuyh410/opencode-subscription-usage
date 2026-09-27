import { Rpc } from "@opencode/plugin/rpc"

const window = {
  type: "object",
  properties: { usedPercent: { type: "number" }, resetAt: { type: "number" } },
  required: ["usedPercent", "resetAt"],
  additionalProperties: false,
} as const

export const CodexUsage = Rpc.define({
  id: "codex-usage",
  methods: {
    get: {
      input: { type: "object", additionalProperties: false },
      output: {
        anyOf: [
          { type: "null" },
          {
            type: "object",
            properties: { fiveHour: window, weekly: window },
            required: ["fiveHour", "weekly"],
            additionalProperties: false,
          },
        ],
      },
    },
  },
  events: {},
})
