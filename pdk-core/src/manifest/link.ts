/**
 * Repo linking — connect the kit to existing codebases.
 *
 * inspectRepo()     — what framework/design system/screens does a repo have?
 * generateTemplate()— build a stack template from linked repos   (Task 2)
 * attachRepo()      — record a linked repo in a template's pdk.json (Task 3)
 * syncLink()        — refresh copied DS bits when linked repos move (Task 3)
 *
 * A linked repo has a role: 'design-system' repos are the source of truth
 * for component/token/icon scanning; 'product' repos supply screens,
 * conventions, dependency pins, and the default handoff target.
 */

import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { basename, join, relative, resolve } from 'node:path'
import type { DesignSystemConfig } from './scaffold.js'

export type RepoRole = 'product' | 'design-system'

export interface AppCandidate {
  dir: string
  name: string
  framework: 'react' | 'vue' | null
  frameworkVersion: string | null
  hasScreens: boolean
  vendoredUiDir: string | null
  tokenFiles: string[]
  dsPackages: string[]
  iconPackages: string[]
}

export interface RepoReport {
  repoPath: string
  candidates: AppCandidate[]
  inferredRole: RepoRole | null
  suggestedStackName: string
}

const KNOWN_DS_PACKAGES = ['@mui/material', '@atlaskit/']
const DS_NAME_RE = /design[-_]?system|(^|\/)ui$|components/i
const KNOWN_ICON_PACKAGES = [
  'lucide-react',
  'lucide-vue-next',
  '@mui/icons-material',
  '@atlaskit/icon',
]
const SCREEN_DIRS = ['src/pages', 'src/routes', 'src/screens', 'src/views', 'app', 'pages']
const ROUTER_DEPS = ['react-router-dom', 'react-router', 'vue-router', '@tanstack/react-router']
const VENDORED_UI_DIRS = ['src/components/ui', 'components/ui', 'src/ui']

function readJson(path: string): Record<string, any> | null {
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch {
    return null
  }
}

function allDeps(pkg: Record<string, any>): Record<string, string> {
  return { ...pkg.peerDependencies, ...pkg.devDependencies, ...pkg.dependencies }
}

/** Shallow CSS token-file hunt: files under dir containing :root{ or @theme. */
function findTokenFiles(candidateDir: string): string[] {
  const found: string[] = []
  const roots = ['src', 'styles', 'app', '.']
  for (const root of roots) {
    const dir = join(candidateDir, root)
    if (!existsSync(dir) || !statSync(dir).isDirectory()) continue
    walkCss(dir, candidateDir, found, 0)
  }
  return [...new Set(found)]
}

function walkCss(dir: string, base: string, out: string[], depth: number): void {
  if (depth > 3) return
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry.startsWith('.')) continue
    const p = join(dir, entry)
    const st = statSync(p)
    if (st.isDirectory()) walkCss(p, base, out, depth + 1)
    else if (entry.endsWith('.css')) {
      const css = readFileSync(p, 'utf8')
      if (/:root\s*\{|@theme/.test(css)) out.push(relative(base, p))
    }
  }
}

function hasCvaSource(uiDir: string): boolean {
  if (!existsSync(uiDir)) return false
  return readdirSync(uiDir).some((f) => {
    const p = join(uiDir, f)
    return (
      statSync(p).isFile() &&
      /\.(tsx?|vue|jsx?)$/.test(f) &&
      readFileSync(p, 'utf8').includes('cva(')
    )
  })
}

function inspectCandidate(repoPath: string, dir: string): AppCandidate | null {
  const abs = join(repoPath, dir)
  const pkg = readJson(join(abs, 'package.json'))
  if (!pkg) return null
  const deps = allDeps(pkg)

  let framework: AppCandidate['framework'] = null
  let frameworkVersion: string | null = null
  if (deps.react) (framework = 'react'), (frameworkVersion = deps.react)
  else if (deps.vue) (framework = 'vue'), (frameworkVersion = deps.vue)

  const hasScreens =
    SCREEN_DIRS.some((d) => existsSync(join(abs, d))) ||
    ROUTER_DEPS.some((d) => d in deps)

  const vendoredUiDir =
    VENDORED_UI_DIRS.find((d) => hasCvaSource(join(abs, d))) ?? null

  const dsPackages = Object.keys(deps).filter(
    (d) =>
      KNOWN_DS_PACKAGES.some((k) => d === k || d.startsWith(k)) ||
      (d.startsWith('@') && DS_NAME_RE.test(d)),
  )
  const iconPackages = KNOWN_ICON_PACKAGES.filter((d) => d in deps)

  return {
    dir,
    name: pkg.name ?? basename(abs),
    framework,
    frameworkVersion,
    hasScreens,
    vendoredUiDir,
    tokenFiles: findTokenFiles(abs),
    dsPackages,
    iconPackages,
  }
}

/** Enumerate workspace dirs from package.json "workspaces" globs (single-star only). */
function workspaceDirs(repoPath: string, pkg: Record<string, any>): string[] {
  const globs: string[] = Array.isArray(pkg.workspaces)
    ? pkg.workspaces
    : (pkg.workspaces?.packages ?? [])
  const dirs: string[] = []
  for (const glob of globs) {
    if (glob.endsWith('/*')) {
      const parent = join(repoPath, glob.slice(0, -2))
      if (!existsSync(parent)) continue
      for (const entry of readdirSync(parent)) {
        const rel = join(glob.slice(0, -2), entry)
        if (existsSync(join(repoPath, rel, 'package.json'))) dirs.push(rel)
      }
    } else if (existsSync(join(repoPath, glob, 'package.json'))) {
      dirs.push(glob)
    }
  }
  return dirs
}

export function inspectRepo(repoPath: string): RepoReport {
  const root = resolve(repoPath)
  const rootPkg = readJson(join(root, 'package.json'))
  if (!rootPkg) {
    throw new Error(
      `${root} has no readable package.json — point /link-repo at the repo root ` +
        `(or the app directory inside it).`,
    )
  }

  const wsDirs = workspaceDirs(root, rootPkg)
  const candidateDirs = wsDirs.length > 0 ? wsDirs : ['.']
  const candidates = candidateDirs
    .map((d) => inspectCandidate(root, d))
    .filter((c): c is AppCandidate => c !== null && (c.framework !== null || c.vendoredUiDir !== null))

  if (candidates.length === 0) {
    throw new Error(
      `No React/Vue app or design-system source found in ${root}. ` +
        `Looked for react/vue dependencies and CVA components under ${VENDORED_UI_DIRS.join(', ')}.`,
    )
  }

  // Role inference: unambiguous only when there is a single candidate.
  let inferredRole: RepoRole | null = null
  if (candidates.length === 1) {
    const c = candidates[0]
    if (c.hasScreens) inferredRole = 'product'
    else if (c.vendoredUiDir || DS_NAME_RE.test(c.name)) inferredRole = 'design-system'
  }

  return {
    repoPath: root,
    candidates,
    inferredRole,
    suggestedStackName: basename(root)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, ''),
  }
}

export interface LinkInput {
  report: RepoReport
  candidate: AppCandidate
  role: RepoRole
}

export interface GenerateResult {
  templateDir: string
  chassis: string
  warnings: string[]
}

const CHASSIS_EXCLUDES = new Set(['node_modules', 'dist', 'manifest', 'package-lock.json', '.git'])

export function generateTemplate(opts: {
  kitRoot: string
  stackName: string
  inputs: LinkInput[]
}): GenerateResult {
  const { kitRoot, stackName, inputs } = opts
  const warnings: string[] = []

  const ds = inputs.find((i) => i.role === 'design-system')
  const product = inputs.find((i) => i.role === 'product')
  const scanSource = ds ?? product        // spec merge rule: DS wins for scanning
  const versionSource = product ?? ds     // spec merge rule: product wins for versions
  if (!scanSource || !versionSource) {
    throw new Error('generateTemplate needs at least one LinkInput.')
  }

  const framework = versionSource.candidate.framework ?? scanSource.candidate.framework
  if (framework !== 'react' && framework !== 'vue') {
    throw new Error(
      `Linked repos must be React or Vue apps — detected '${framework ?? 'unknown'}'. ` +
        `The kit's chassis templates cannot render other frameworks.`,
    )
  }
  const chassis = framework === 'react' ? 'react-shadcn' : 'vue-shadcn'
  const chassisDir = join(kitRoot, 'stack-templates', chassis)
  if (!existsSync(chassisDir)) {
    throw new Error(`Chassis template missing: ${chassisDir}`)
  }
  const templateDir = join(kitRoot, 'stack-templates', stackName)
  if (existsSync(templateDir)) {
    throw new Error(
      `stack-templates/${stackName} already exists. Pick another name or remove it first.`,
    )
  }

  // 1. Copy the chassis, minus generated/heavy bits.
  cpSync(chassisDir, templateDir, {
    recursive: true,
    filter: (src) => !CHASSIS_EXCLUDES.has(basename(src)),
  })

  // 2. Vendored ui + tokens from the scan source (DS repo when present).
  const scanAbs = join(scanSource.report.repoPath, scanSource.candidate.dir)
  const dsConfig: DesignSystemConfig = { type: 'package-types' }
  if (scanSource.candidate.vendoredUiDir) {
    const targetUi = join(templateDir, 'src', 'components', 'ui')
    rmSync(targetUi, { recursive: true, force: true })
    cpSync(join(scanAbs, scanSource.candidate.vendoredUiDir), targetUi, { recursive: true })
    dsConfig.type = 'local-cva'
  } else if (scanSource.candidate.dsPackages.length > 0) {
    dsConfig.packages = scanSource.candidate.dsPackages
  } else {
    warnings.push(
      'No vendored components or design-system packages found — components.json will be empty until configured.',
    )
  }
  dsConfig.iconPackages =
    scanSource.candidate.iconPackages.length > 0
      ? scanSource.candidate.iconPackages
      : versionSource.candidate.iconPackages

  const tokenSourceRel = scanSource.candidate.tokenFiles[0]
  const chassisCss = join('src', 'assets', 'index.css')
  if (tokenSourceRel) {
    writeFileSync(
      join(templateDir, 'src', 'assets', 'linked-tokens.css'),
      readFileSync(join(scanAbs, tokenSourceRel), 'utf8'),
    )
    const cssPath = join(templateDir, chassisCss)
    writeFileSync(cssPath, `@import './linked-tokens.css';\n` + readFileSync(cssPath, 'utf8'))
    dsConfig.tokenFiles = ['src/assets/linked-tokens.css', chassisCss]
  } else {
    dsConfig.tokenFiles = [chassisCss]
    warnings.push('No token file found in linked repos — using chassis tokens only.')
  }

  // 3. package.json: chassis plumbing + linked versions winning on overlap.
  const chassisPkg = JSON.parse(readFileSync(join(chassisDir, 'package.json'), 'utf8'))
  const linkedDeps = {
    ...readJson(join(join(scanSource.report.repoPath, scanSource.candidate.dir), 'package.json'))
      ?.dependencies,
    ...readJson(join(join(versionSource.report.repoPath, versionSource.candidate.dir), 'package.json'))
      ?.dependencies,
  }
  const dependencies: Record<string, string> = { ...chassisPkg.dependencies }
  for (const [dep, version] of Object.entries(linkedDeps)) {
    if (typeof version === 'string' && !version.startsWith('workspace:')) {
      dependencies[dep] = version
    }
  }
  writeFileSync(
    join(templateDir, 'package.json'),
    JSON.stringify(
      { ...chassisPkg, name: `${stackName}-template`, dependencies },
      null,
      2,
    ) + '\n',
  )

  // 4. pdk.json: keep PROTOTYPE_* placeholders, set identity + scan config.
  const chassisPdk = JSON.parse(readFileSync(join(chassisDir, 'pdk.json'), 'utf8'))
  writeFileSync(
    join(templateDir, 'pdk.json'),
    JSON.stringify(
      { ...chassisPdk, framework, library: stackName, designSystem: dsConfig },
      null,
      2,
    ) + '\n',
  )

  return { templateDir, chassis, warnings }
}
