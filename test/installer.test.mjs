import assert from "node:assert/strict"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { spawnSync } from "node:child_process"
import test from "node:test"
import { parse } from "jsonc-parser"
import { install, MANAGED_SPEC, uninstall } from "../lib/installer.mjs"

test("install and uninstall preserve JSONC comments and unrelated plugins", async () => {
  const configDir = await mkdtemp(join(tmpdir(), "codex-usage-"))
  const configPath = join(configDir, "tui.jsonc")
  try {
    await writeFile(
      configPath,
      `{
  // Keep this plugin.
  "plugin": ["another-plugin", "./plugins/codex-usage.tsx"],
}
`,
      "utf8",
    )

    const first = await install({ configDir })
    await install({ configDir })
    const installedText = await readFile(configPath, "utf8")
    const installed = parse(installedText)
    assert.match(installedText, /Keep this plugin/)
    assert.deepEqual(installed.plugin, ["another-plugin", MANAGED_SPEC])
    assert.equal(await readFile(first.pluginPath, "utf8").then((value) => value.length > 0), true)
    assert.equal(await readFile(first.usagePath, "utf8").then((value) => value.length > 0), true)

    await uninstall({ configDir })
    const uninstalledText = await readFile(configPath, "utf8")
    const uninstalled = parse(uninstalledText)
    assert.match(uninstalledText, /Keep this plugin/)
    assert.deepEqual(uninstalled.plugin, ["another-plugin"])
    await assert.rejects(readFile(first.pluginPath), { code: "ENOENT" })
    await assert.rejects(readFile(first.usagePath), { code: "ENOENT" })
  } finally {
    await rm(configDir, { recursive: true, force: true })
  }
})

test("install creates a new TUI config", async () => {
  const configDir = await mkdtemp(join(tmpdir(), "codex-usage-"))
  try {
    const result = await install({ configDir })
    const config = JSON.parse(await readFile(result.configPath, "utf8"))
    assert.equal(config.$schema, "https://opencode.ai/tui.json")
    assert.deepEqual(config.plugin, [MANAGED_SPEC])
  } finally {
    await rm(configDir, { recursive: true, force: true })
  }
})

test("CLI installs and uninstalls through OPENCODE_CONFIG_DIR", async () => {
  const configDir = await mkdtemp(join(tmpdir(), "codex-usage-cli-"))
  const cli = join(import.meta.dirname, "..", "bin", "opencode-codex-usage.mjs")
  const run = (command) =>
    spawnSync(process.execPath, [cli, command], {
      encoding: "utf8",
      env: { ...process.env, OPENCODE_CONFIG_DIR: configDir },
    })

  try {
    const installed = run("install")
    assert.equal(installed.status, 0, installed.stderr)
    assert.match(installed.stdout, /Installed Codex usage sidebar/)
    const config = JSON.parse(await readFile(join(configDir, "tui.json"), "utf8"))
    assert.deepEqual(config.plugin, [MANAGED_SPEC])

    const uninstalled = run("uninstall")
    assert.equal(uninstalled.status, 0, uninstalled.stderr)
    assert.match(uninstalled.stdout, /Removed Codex usage sidebar/)
    const finalConfig = JSON.parse(await readFile(join(configDir, "tui.json"), "utf8"))
    assert.equal(finalConfig.plugin, undefined)
  } finally {
    await rm(configDir, { recursive: true, force: true })
  }
})

test("installer refuses to overwrite a malformed plugin setting", async () => {
  const configDir = await mkdtemp(join(tmpdir(), "codex-usage-invalid-"))
  try {
    await writeFile(join(configDir, "tui.json"), '{"plugin":"keep-me"}\n', "utf8")
    await assert.rejects(install({ configDir }), /non-array plugin setting/)
    assert.equal(await readFile(join(configDir, "tui.json"), "utf8"), '{"plugin":"keep-me"}\n')
  } finally {
    await rm(configDir, { recursive: true, force: true })
  }
})
