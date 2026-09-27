import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises"
import { homedir } from "node:os"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { applyEdits, modify, parse } from "jsonc-parser"

export const MANAGED_SPEC = "./local-plugins/codex-usage"
const PACKAGE_NAME = "opencode-codex-usage"
const LEGACY_SPEC = "./plugins/codex-usage.tsx"
const OLD_MANAGED_SPEC = "./plugins/codex-usage-sidebar.js"
const SCHEMA_URL = "https://opencode.ai/config.json"

function defaultConfigDir() {
  if (process.env.OPENCODE_CONFIG_DIR) return process.env.OPENCODE_CONFIG_DIR
  if (process.env.XDG_CONFIG_HOME) return join(process.env.XDG_CONFIG_HOME, "opencode")
  return join(homedir(), ".config", "opencode")
}

function specOf(entry) {
  if (typeof entry === "string") return entry
  if (entry && typeof entry.package === "string") return entry.package
  if (Array.isArray(entry) && typeof entry[0] === "string") return entry[0]
}

function isPackageSpec(spec) {
  return spec === PACKAGE_NAME || spec?.startsWith(`${PACKAGE_NAME}@`)
}

function parseConfig(content, path) {
  const errors = []
  const config = parse(content, errors, { allowTrailingComma: true, disallowComments: false })
  if (errors.length > 0 || !config || typeof config !== "object" || Array.isArray(config)) {
    throw new Error(`Cannot update invalid OpenCode config: ${path}`)
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
  if (config.plugins !== undefined && !Array.isArray(config.plugins)) {
    throw new Error(`Cannot update non-array plugins setting: ${path}`)
  }
  const current = Array.isArray(config.plugins) ? config.plugins : []
  const next = transform(current)
  if (JSON.stringify(current) === JSON.stringify(next)) return false
  const value = next.length > 0 ? next : undefined
  const edits = modify(content, ["plugins"], value, { formattingOptions: formattingOptions(content) })
  await writeFile(path, applyEdits(content, edits), "utf8")
  return true
}

function packageRoot() {
  return dirname(dirname(fileURLToPath(import.meta.url)))
}

export async function install(options = {}) {
  const configDir = options.configDir ?? defaultConfigDir()
  const pluginDir = join(configDir, "local-plugins", "codex-usage")
  const pluginPath = join(pluginDir, "dist", "tui.js")
  const usagePath = join(pluginDir, "dist", "codex-usage.js")
  const jsoncPath = join(configDir, "opencode.jsonc")
  const jsonPath = join(configDir, "opencode.json")
  const configPath = (await exists(jsoncPath)) ? jsoncPath : jsonPath
  // Validate before copying or overwriting any installed files.
  if (await exists(configPath)) {
    const config = parseConfig(await readFile(configPath, "utf8"), configPath)
    if (config.plugins !== undefined && !Array.isArray(config.plugins)) {
      throw new Error(`Cannot update non-array plugins setting: ${configPath}`)
    }
  }
  await mkdir(pluginDir, { recursive: true })
  await cp(join(packageRoot(), "dist"), join(pluginDir, "dist"), { recursive: true })
  for (const entry of ["index.js", "tui.js"]) {
    await cp(join(packageRoot(), entry), join(pluginDir, entry))
  }
  const { name, version, type, exports } = JSON.parse(await readFile(join(packageRoot(), "package.json"), "utf8"))
  await writeFile(join(pluginDir, "package.json"), `${JSON.stringify({ name, version, type, exports }, null, 2)}\n`)
  if (!(await exists(configPath))) {
    const initial = { $schema: SCHEMA_URL, plugins: [MANAGED_SPEC] }
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

  return { configDir, configPath, pluginPath, usagePath }
}

export async function uninstall(options = {}) {
  const configDir = options.configDir ?? defaultConfigDir()
  const configPaths = [join(configDir, "opencode.json"), join(configDir, "opencode.jsonc")]
  for (const configPath of configPaths) {
    if (!(await exists(configPath))) continue
    await updatePlugins(configPath, (entries) =>
      entries.filter((entry) => {
        const spec = specOf(entry)
        return spec !== OLD_MANAGED_SPEC && spec !== MANAGED_SPEC && !isPackageSpec(spec)
      }),
    )
  }

  const pluginDir = join(configDir, "local-plugins", "codex-usage")
  await rm(pluginDir, { recursive: true, force: true })
  return { configDir, pluginPath: join(pluginDir, "dist", "tui.js") }
}
