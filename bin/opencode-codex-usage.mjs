#!/usr/bin/env node
import { install, uninstall } from "../lib/installer.mjs"

const command = process.argv[2]

function help() {
  console.log(`Usage: opencode-codex-usage <command>

Commands:
  install     Install the sidebar plugin globally
  uninstall   Remove the sidebar plugin and its config entry
  help        Show this help`)
}

try {
  if (command === "install") {
    const result = await install()
    console.log(`Installed Codex usage sidebar in ${result.configDir}`)
    console.log("Restart OpenCode to activate it.")
  } else if (command === "uninstall") {
    const result = await uninstall()
    console.log(`Removed Codex usage sidebar from ${result.configDir}`)
    console.log("Restart OpenCode to finish unloading it.")
  } else if (!command || command === "help" || command === "--help" || command === "-h") {
    help()
  } else {
    console.error(`Unknown command: ${command}`)
    help()
    process.exitCode = 1
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
}
