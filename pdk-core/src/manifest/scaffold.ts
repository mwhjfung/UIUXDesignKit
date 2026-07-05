/**
 * Manifest scaffolder — fills in the scannable half of a stack manifest.
 *
 * Usage (CLI):   node pdk-core/dist/manifest/scaffold.js <stack> [--root <repoRoot>]
 * Usage (lib):   scaffoldManifest(stack, { root })
 *
 * Writes into stack-templates/<stack>/manifest/:
 *   components.json, tokens.json, icons.json   (always overwritten)
 *   patterns.md, rules.md, voice.md            (created only if absent — curated)
 *   _meta.json                                 (scaffold provenance, read by sync)
 *   _unscanned.txt                             (only when something was skipped)
 */

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import type {
  ComponentsManifest,
  IconsManifest,
  ManifestMeta,
  TokensManifest,
} from './schema/types.js'
import { scanLocalUi } from './sources/cva-local.js'
import { scanCssTokens } from './sources/css-tokens.js'
import { scanIcons } from './sources/icons.js'

export interface DesignSystemConfig {
  /** 'local-cva' scans template source; 'package-types' scans node_modules d.ts. */
  type: 'local-cva' | 'package-types'
  /** Packages to type-scan (package-types only). */
  packages?: string[]
  iconPackages?: string[]
  /** Stylesheets (relative to the template) to scan for CSS-variable tokens. */
  tokenFiles?: string[]
}

export interface StackConfig {
  framework: string
  library: string
  designSystem: DesignSystemConfig
}

export interface ScaffoldReport {
  stack: string
  componentCount: number
  tokenCount: number
  iconCount: number
  warnings: string[]
  unscanned: string[]
  manifestDir: string
}

/** Derive scan config from pdk.json, honouring an explicit designSystem block. */
export function stackConfig(templateDir: string): StackConfig {
  const pdkPath = join(templateDir, 'pdk.json')
  if (!existsSync(pdkPath)) {
    throw new Error(`${templateDir} has no pdk.json — not a stack template.`)
  }
  const pdk = JSON.parse(readFileSync(pdkPath, 'utf8'))
  const framework: string = pdk.framework ?? 'unknown'
  const library: string = pdk.library ?? 'unknown'

  if (pdk.designSystem) {
    return { framework, library, designSystem: pdk.designSystem as DesignSystemConfig }
  }

  // Inference for the stacks the kit ships with.
  if (library.includes('shadcn')) {
    return {
      framework,
      library,
      designSystem: {
        type: 'local-cva',
        iconPackages: [framework === 'vue' ? 'lucide-vue-next' : 'lucide-react'],
        tokenFiles: ['src/assets/index.css', 'src/index.css', 'src/styles/globals.css'],
      },
    }
  }
  if (library === 'material-ui') {
    return {
      framework,
      library,
      designSystem: {
        type: 'package-types',
        packages: ['@mui/material'],
        iconPackages: ['@mui/icons-material'],
        tokenFiles: ['src/assets/index.css'],
      },
    }
  }
  if (library === 'atlaskit') {
    // Scan whichever @atlaskit component packages the template declares.
    const pkgJsonPath = join(templateDir, 'package.json')
    const deps = existsSync(pkgJsonPath)
      ? Object.keys(JSON.parse(readFileSync(pkgJsonPath, 'utf8')).dependencies ?? {})
      : []
    return {
      framework,
      library,
      designSystem: {
        type: 'package-types',
        packages: deps.filter((d) => d.startsWith('@atlaskit/') && !d.includes('css-reset')),
        iconPackages: ['@atlaskit/icon'],
        tokenFiles: ['src/assets/index.css'],
      },
    }
  }
  throw new Error(
    `Cannot infer scan strategy for library '${library}'. Add a "designSystem" block to ${pdkPath} ` +
      `({"type": "local-cva" | "package-types", "packages": [...], "iconPackages": [...], "tokenFiles": [...]}).`,
  )
}

/** Record installed versions of the packages that informed this manifest. */
function collectVersions(templateDir: string, config: StackConfig): Record<string, string> {
  const versions: Record<string, string> = {}
  const interesting = [
    ...(config.designSystem.packages ?? []),
    ...(config.designSystem.iconPackages ?? []),
  ]
  if (config.designSystem.type === 'local-cva') {
    // Local systems drift with these underlying packages.
    interesting.push('class-variance-authority', 'reka-ui', 'radix-ui', 'tailwindcss')
  }
  for (const pkg of interesting) {
    let dir = templateDir
    for (let i = 0; i < 5; i++) {
      const p = join(dir, 'node_modules', pkg, 'package.json')
      if (existsSync(p)) {
        versions[pkg] = JSON.parse(readFileSync(p, 'utf8')).version
        break
      }
      dir = join(dir, '..')
    }
  }
  return versions
}

const scriptDir = dirname(fileURLToPath(import.meta.url))

function templateMd(name: string): string {
  // Works from both src (tsx/vitest) and dist (built) layouts.
  for (const rel of ['schema/templates', '../../src/manifest/schema/templates']) {
    const p = join(scriptDir, rel, name)
    if (existsSync(p)) return readFileSync(p, 'utf8')
  }
  throw new Error(`Internal: markdown template ${name} not found near ${scriptDir}`)
}

export async function scaffoldManifest(
  stack: string,
  opts: { root?: string } = {},
): Promise<ScaffoldReport> {
  const root = resolve(opts.root ?? process.cwd())
  const templateDir = join(root, 'stack-templates', stack)
  if (!existsSync(templateDir)) {
    throw new Error(`Unknown stack '${stack}': ${templateDir} does not exist.`)
  }
  const config = stackConfig(templateDir)
  const dir = join(templateDir, 'manifest')
  mkdirSync(dir, { recursive: true })

  const warnings: string[] = []
  let unscanned: string[] = []

  // --- components ---
  let components: ComponentsManifest
  if (config.designSystem.type === 'local-cva') {
    const scan = scanLocalUi(templateDir)
    components = { components: scan.components }
    unscanned = unscanned.concat(scan.unscanned)
  } else {
    // Lazy import keeps heavyweight ts-morph out of memory for local-cva stacks.
    const { scanPackageTypes } = await import('./sources/ts-types.js')
    const scan = scanPackageTypes(templateDir, config.designSystem.packages ?? [])
    components = { components: scan.components }
    unscanned = unscanned.concat(scan.unscanned)
  }
  if (components.components.length === 0) {
    warnings.push(
      'No components found. Seed components.json by hand or check that the design system is installed.',
    )
  }

  // --- tokens ---
  const tokens: TokensManifest = {
    tokens: scanCssTokens(templateDir, config.designSystem.tokenFiles ?? []),
  }
  if (tokens.tokens.length === 0) {
    warnings.push('Token discovery came up empty — tokens.json is empty; hand-author it if needed.')
  }

  // --- icons ---
  const iconScan = scanIcons(templateDir, config.designSystem.iconPackages ?? [])
  const icons: IconsManifest = { pack: iconScan.pack, icons: iconScan.icons }
  warnings.push(...iconScan.warnings)

  // --- write ---
  writeFileSync(join(dir, 'components.json'), JSON.stringify(components, null, 2) + '\n')
  writeFileSync(join(dir, 'tokens.json'), JSON.stringify(tokens, null, 2) + '\n')
  writeFileSync(join(dir, 'icons.json'), JSON.stringify(icons, null, 2) + '\n')

  for (const md of ['patterns.md', 'rules.md', 'voice.md']) {
    const path = join(dir, md)
    if (!existsSync(path)) writeFileSync(path, templateMd(md))
  }

  const meta: ManifestMeta = {
    stack,
    scaffoldedAt: new Date().toISOString(),
    packages: collectVersions(templateDir, config),
  }
  writeFileSync(join(dir, '_meta.json'), JSON.stringify(meta, null, 2) + '\n')

  const unscannedPath = join(dir, '_unscanned.txt')
  if (unscanned.length > 0) {
    writeFileSync(unscannedPath, unscanned.join('\n') + '\n')
  } else if (existsSync(unscannedPath)) {
    rmSync(unscannedPath)
  }

  return {
    stack,
    componentCount: components.components.length,
    tokenCount: tokens.tokens.length,
    iconCount: icons.icons.length,
    warnings,
    unscanned,
    manifestDir: dir,
  }
}

// ---- CLI ----
const invokedDirectly =
  process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href
if (invokedDirectly) {
  const args = process.argv.slice(2)
  const rootIdx = args.indexOf('--root')
  const root = rootIdx !== -1 ? args[rootIdx + 1] : process.cwd()
  const stack = args.filter((a, i) => !a.startsWith('--') && (rootIdx === -1 || i !== rootIdx + 1))[0]
  if (!stack) {
    console.error('Usage: scaffold.js <stack> [--root <repoRoot>]')
    process.exit(1)
  }
  try {
    const report = await scaffoldManifest(stack, { root })
    console.log(
      `Manifest scaffolded for '${report.stack}' — ${report.componentCount} components, ` +
        `${report.tokenCount} tokens, ${report.iconCount} icons.`,
    )
    for (const w of report.warnings) console.warn(`warning: ${w}`)
    if (report.unscanned.length > 0)
      console.warn(`${report.unscanned.length} item(s) skipped — see manifest/_unscanned.txt`)
    console.log(`Run /curate-manifest ${report.stack} to fill in the taste bits.`)
  } catch (e) {
    console.error((e as Error).message)
    process.exit(1)
  }
}
