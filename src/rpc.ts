import type { Rpc } from "@opencode/plugin/rpc"

const window = {
  type: "object",
  properties: { usedPercent: { type: "number" }, resetAt: { type: "number" } },
  required: ["usedPercent", "resetAt"],
  additionalProperties: false,
} as const

const goWindow = {
  ...window,
  properties: { usedPercent: { type: "number" }, resetAt: { type: ["number", "null"] } },
} as const

export const CodexUsage = {
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
    go: {
      input: { type: "object", additionalProperties: false },
      output: {
        anyOf: [
          { type: "null" },
          {
            type: "object",
            properties: { fiveHour: goWindow, weekly: goWindow, monthly: goWindow },
            required: ["fiveHour", "weekly", "monthly"],
            additionalProperties: false,
          },
        ],
      },
    },
  },
  events: {},
} as const satisfies Rpc.PortableDefinition
