import assert from "node:assert/strict"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { spawnSync } from "node:child_process"
import { pathToFileURL } from "node:url"
import test from "node:test"
import { parse } from "jsonc-parser"
import { install, MANAGED_SPEC, uninstall } from "../lib/installer.mjs"

test("install and uninstall preserve JSONC comments and unrelated plugins", async () => {
  const configDir = await mkdtemp(join(tmpdir(), "codex-usage-"))
  const configPath = join(configDir, "opencode.jsonc")
  try {
    await writeFile(
      configPath,
      `{
  // Keep this plugin.
  "plugins": [{ "package": "another-plugin", "options": { "enabled": true } }, "./plugins/codex-usage.tsx"],
  "model": "openai/gpt-5",
}
`,
      "utf8",
    )

    const first = await install({ configDir })
    await install({ configDir })
    const installedText = await readFile(configPath, "utf8")
    const installed = parse(installedText)
    assert.match(installedText, /Keep this plugin/)
    assert.deepEqual(installed.plugins, [{ package: "another-plugin", options: { enabled: true } }, MANAGED_SPEC])
    assert.equal(installed.model, "openai/gpt-5")
    const manifest = JSON.parse(await readFile(join(configDir, MANAGED_SPEC, "package.json"), "utf8"))
    assert.equal(manifest.exports["."], "./index.js")
    assert.equal(manifest.exports["./tui"], "./tui.js")
    for (const name of ["index.js", "tui.js"]) {
      assert.ok((await readFile(join(configDir, MANAGED_SPEC, name), "utf8")).length)
    }
    for (const name of ["index.js", "rpc.js"]) {
      assert.ok((await readFile(join(configDir, MANAGED_SPEC, "dist", name), "utf8")).length)
    }
    assert.equal(await readFile(first.pluginPath, "utf8").then((value) => value.length > 0), true)
    assert.equal(await readFile(first.usagePath, "utf8").then((value) => value.length > 0), true)
    // Import the copied server entrypoint outside the checkout: it must not rely on node_modules.
    const entry = pathToFileURL(join(configDir, MANAGED_SPEC, "index.js")).href
    const loaded = spawnSync(process.execPath, ["--input-type=module", "-e", `
      const { default: plugin } = await import(${JSON.stringify(entry)});
      if (plugin.id !== "codex-usage" || typeof plugin.setup !== "function") process.exit(1);
    `], { encoding: "utf8" })
    assert.equal(loaded.status, 0, loaded.stderr)

    await uninstall({ configDir })
    const uninstalledText = await readFile(configPath, "utf8")
    const uninstalled = parse(uninstalledText)
    assert.match(uninstalledText, /Keep this plugin/)
    assert.deepEqual(uninstalled.plugins, [{ package: "another-plugin", options: { enabled: true } }])
    await assert.rejects(readFile(first.pluginPath), { code: "ENOENT" })
    await assert.rejects(readFile(first.usagePath), { code: "ENOENT" })
  } finally {
    await rm(configDir, { recursive: true, force: true })
  }
})

test("install creates a V2 server config without modifying V1 or CLI settings", async () => {
  const configDir = await mkdtemp(join(tmpdir(), "codex-usage-"))
  try {
    const legacy = '{"plugin":["old-plugin"]}\n'
    const cli = '{"theme":{"name":"tokyonight"}}\n'
    await writeFile(join(configDir, "tui.json"), legacy)
    await writeFile(join(configDir, "cli.json"), cli)
    const result = await install({ configDir })
    const config = JSON.parse(await readFile(result.configPath, "utf8"))
    assert.equal(config.$schema, "https://opencode.ai/config.json")
    assert.deepEqual(config.plugins, [MANAGED_SPEC])
    assert.equal(await readFile(join(configDir, "tui.json"), "utf8"), legacy)
    assert.equal(await readFile(join(configDir, "cli.json"), "utf8"), cli)
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
    const config = JSON.parse(await readFile(join(configDir, "opencode.json"), "utf8"))
    assert.deepEqual(config.plugins, [MANAGED_SPEC])

    const uninstalled = run("uninstall")
    assert.equal(uninstalled.status, 0, uninstalled.stderr)
    assert.match(uninstalled.stdout, /Removed Codex usage sidebar/)
    const finalConfig = JSON.parse(await readFile(join(configDir, "opencode.json"), "utf8"))
    assert.equal(finalConfig.plugins, undefined)
  } finally {
    await rm(configDir, { recursive: true, force: true })
  }
})

test("installer refuses to overwrite a malformed plugin setting", async () => {
  const configDir = await mkdtemp(join(tmpdir(), "codex-usage-invalid-"))
  try {
    await writeFile(join(configDir, "opencode.json"), '{"plugins":"keep-me"}\n', "utf8")
    await assert.rejects(install({ configDir }), /non-array plugins setting/)
    assert.equal(await readFile(join(configDir, "opencode.json"), "utf8"), '{"plugins":"keep-me"}\n')
    await assert.rejects(readFile(join(configDir, MANAGED_SPEC, "dist", "tui.js")), { code: "ENOENT" })
  } finally {
    await rm(configDir, { recursive: true, force: true })
  }
})
