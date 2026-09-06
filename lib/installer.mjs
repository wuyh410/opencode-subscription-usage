import { copyFile, mkdir, readFile, rm, writeFile } from "node:fs/promises"
import { homedir } from "node:os"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { applyEdits, modify, parse } from "jsonc-parser"

export const MANAGED_SPEC = "./tui-plugins/codex-usage-sidebar.js"
const PACKAGE_NAME = "opencode-codex-usage"
const USAGE_MODULE = "codex-usage.js"
const LEGACY_SPEC = "./plugins/codex-usage.tsx"
const OLD_MANAGED_SPEC = "./plugins/codex-usage-sidebar.js"
const SCHEMA_URL = "https://opencode.ai/tui.json"

function defaultConfigDir() {
  if (process.env.OPENCODE_CONFIG_DIR) return process.env.OPENCODE_CONFIG_DIR
  if (process.env.XDG_CONFIG_HOME) return join(process.env.XDG_CONFIG_HOME, "opencode")
  return join(homedir(), ".config", "opencode")
}

function specOf(entry) {
  if (typeof entry === "string") return entry
  if (Array.isArray(entry) && typeof entry[0] === "string") return entry[0]
}

function isPackageSpec(spec) {
  return spec === PACKAGE_NAME || spec?.startsWith(`${PACKAGE_NAME}@`)
}

function parseConfig(content, path) {
  const errors = []
  const config = parse(content, errors, { allowTrailingComma: true, disallowComments: false })
  if (errors.length > 0 || !config || typeof config !== "object" || Array.isArray(config)) {
    throw new Error(`Cannot update invalid TUI config: ${path}`)
  }
  return config
}

function formattingOptions(content) {
  return {
    insertSpaces: !content.includes("\t"),
    tabSize: 2,
    eol: content.includes("\r\n") ? "\r\n" : "\n",
  }
}

async function exists(path) {
  try {
    await readFile(path)
    return true
  } catch (error) {
    if (error?.code === "ENOENT") return false
    throw error
  }
}

async function updatePlugins(path, transform) {
  const content = await readFile(path, "utf8")
  const config = parseConfig(content, path)
  if (config.plugin !== undefined && !Array.isArray(config.plugin)) {
    throw new Error(`Cannot update non-array plugin setting: ${path}`)
  }
  const current = Array.isArray(config.plugin) ? config.plugin : []
  const next = transform(current)
  if (JSON.stringify(current) === JSON.stringify(next)) return false
  const value = next.length > 0 ? next : undefined
  const edits = modify(content, ["plugin"], value, { formattingOptions: formattingOptions(content) })
  await writeFile(path, applyEdits(content, edits), "utf8")
  return true
}

function packageRoot() {
  return dirname(dirname(fileURLToPath(import.meta.url)))
}

export async function install(options = {}) {
  const configDir = options.configDir ?? defaultConfigDir()
  const pluginDir = join(configDir, "tui-plugins")
  const pluginPath = join(pluginDir, "codex-usage-sidebar.js")
  const usagePath = join(pluginDir, USAGE_MODULE)
  await mkdir(pluginDir, { recursive: true })
  await Promise.all([
    copyFile(join(packageRoot(), "dist", "tui.js"), pluginPath),
    copyFile(join(packageRoot(), "dist", USAGE_MODULE), usagePath),
  ])

  const jsoncPath = join(configDir, "tui.jsonc")
  const jsonPath = join(configDir, "tui.json")
  const configPath = (await exists(jsoncPath)) ? jsoncPath : jsonPath
  if (!(await exists(configPath))) {
    const initial = { $schema: SCHEMA_URL, plugin: [MANAGED_SPEC] }
    await writeFile(configPath, `${JSON.stringify(initial, null, 2)}\n`, "utf8")
  } else {
    await updatePlugins(configPath, (entries) => {
      const next = entries.filter((entry) => {
        const spec = specOf(entry)
        return spec !== LEGACY_SPEC && spec !== OLD_MANAGED_SPEC && spec !== MANAGED_SPEC && !isPackageSpec(spec)
      })
      next.push(MANAGED_SPEC)
      return next
    })
  }

  await rm(join(configDir, "plugins", "codex-usage-sidebar.js"), { force: true })

  return { configDir, configPath, pluginPath, usagePath }
}

export async function uninstall(options = {}) {
  const configDir = options.configDir ?? defaultConfigDir()
  const configPaths = [join(configDir, "tui.json"), join(configDir, "tui.jsonc")]
  for (const configPath of configPaths) {
    if (!(await exists(configPath))) continue
    await updatePlugins(configPath, (entries) =>
      entries.filter((entry) => {
        const spec = specOf(entry)
        return spec !== OLD_MANAGED_SPEC && spec !== MANAGED_SPEC && !isPackageSpec(spec)
      }),
    )
  }

  const pluginPath = join(configDir, "plugins", "codex-usage-sidebar.js")
  const tuiPluginPath = join(configDir, "tui-plugins", "codex-usage-sidebar.js")
  const usagePath = join(configDir, "tui-plugins", USAGE_MODULE)
  await rm(pluginPath, { force: true })
  await rm(tuiPluginPath, { force: true })
  await rm(usagePath, { force: true })
  return { configDir, pluginPath: tuiPluginPath }
}
