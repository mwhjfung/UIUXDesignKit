/**
 * Manifest sync — detects design-system drift after upgrades.
 *
 * Usage (CLI): node pdk-core/dist/manifest/sync.js <stack> [--root <repoRoot>] [--force] [--dry-run]
 *
 * Compares versions recorded in manifest/_meta.json against the installed
 * packages; when they differ, re-runs the scaffolder for the JSON files only
 * and reports the diff. Curated MD files are never edited — stale references
 * to removed components are flagged for the human to resolve.
 */

import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { getManifest } from './read.js'
import { linkedRepos, syncLink, type LinkSyncEntry } from './link.js'
import type { ComponentEntry, ManifestMeta } from './schema/types.js'
import { scaffoldManifest, stackConfig } from './scaffold.js'

export interface ComponentDiff {
  added: string[]
  removed: string[]
  /** component name → human description of prop-level changes */
  changed: Record<string, string[]>
}

export interface SyncReport {
  stack: string
  versionChanges: Record<string, { from: string | undefined; to: string | undefined }>
  components: ComponentDiff
  tokens: { added: string[]; removed: string[]; changed: string[] }
  icons: { added: number; removed: number }
  /** curated-MD file → names it mentions that no longer exist */
  staleReferences: Record<string, string[]>
  upToDate: boolean
  linkSync?: LinkSyncEntry[]
}

function indexBy<T extends { name: string }>(items: T[]): Map<string, T> {
  return new Map(items.map((i) => [i.name, i]))
}

export function diffComponents(before: ComponentEntry[], after: ComponentEntry[]): ComponentDiff {
  const beforeMap = indexBy(before)
  const afterMap = indexBy(after)
  const diff: ComponentDiff = { added: [], removed: [], changed: {} }

  for (const name of afterMap.keys()) if (!beforeMap.has(name)) diff.added.push(name)
  for (const name of beforeMap.keys()) if (!afterMap.has(name)) diff.removed.push(name)

  for (const [name, a] of afterMap) {
    const b = beforeMap.get(name)
    if (!b) continue
    const changes: string[] = []
    const bProps = indexBy(b.props)
    const aProps = indexBy(a.props)
    for (const [pn, ap] of aProps) {
      const bp = bProps.get(pn)
      if (!bp) {
        changes.push(`prop '${pn}' added`)
      } else if (ap.type === 'select' && bp.type === 'select') {
        const bOpts = new Set(bp.options ?? [])
        const aOpts = new Set(ap.options ?? [])
        const addedOpts = [...aOpts].filter((o) => !bOpts.has(o))
        const removedOpts = [...bOpts].filter((o) => !aOpts.has(o))
        if (addedOpts.length > 0) changes.push(`'${pn}' gained option(s): ${addedOpts.join(', ')}`)
        if (removedOpts.length > 0) changes.push(`'${pn}' lost option(s): ${removedOpts.join(', ')}`)
      } else if (ap.type !== bp.type) {
        changes.push(`prop '${pn}' type changed ${bp.type} → ${ap.type}`)
      }
    }
    for (const pn of bProps.keys()) {
      if (!aProps.has(pn)) changes.push(`prop '${pn}' removed`)
    }
    if (changes.length > 0) diff.changed[name] = changes
  }
  diff.added.sort()
  diff.removed.sort()
  return diff
}

/** Find mentions of removed component names inside curated markdown. */
export function findStaleReferences(
  mdBodies: Record<string, string>,
  removedNames: string[],
): Record<string, string[]> {
  const stale: Record<string, string[]> = {}
  for (const [file, body] of Object.entries(mdBodies)) {
    const hits = removedNames.filter((name) =>
      new RegExp(`(?:^|[^A-Za-z0-9])${name}(?:[^A-Za-z0-9]|$)`).test(body),
    )
    if (hits.length > 0) stale[file] = hits
  }
  return stale
}

function installedVersions(templateDir: string, recorded: Record<string, string>): Record<string, string | undefined> {
  const versions: Record<string, string | undefined> = {}
  for (const pkg of Object.keys(recorded)) {
    let dir = templateDir
    versions[pkg] = undefined
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

export async function syncManifest(
  stack: string,
  opts: { root?: string; force?: boolean; dryRun?: boolean } = {},
): Promise<SyncReport> {
  const root = resolve(opts.root ?? process.cwd())
  const templateDir = join(root, 'stack-templates', stack)
  const before = getManifest(stack, { root })
  const meta: ManifestMeta | null = before.meta
  if (!meta) {
    throw new Error(
      `Manifest for '${stack}' has no _meta.json — cannot diff. Run /scaffold-manifest ${stack} to rebuild it.`,
    )
  }

  let linkSync: LinkSyncEntry[] | undefined
  if (linkedRepos(templateDir).length > 0) {
    linkSync = syncLink(templateDir, { dryRun: opts.dryRun })
  }

  const installed = installedVersions(templateDir, meta.packages)
  const versionChanges: SyncReport['versionChanges'] = {}
  for (const [pkg, recorded] of Object.entries(meta.packages)) {
    const now = installed[pkg]
    if (now !== recorded) versionChanges[pkg] = { from: recorded, to: now }
    // Downgrade guard: recorded newer than installed needs --force.
    if (now && recorded && !opts.force && now.localeCompare(recorded, undefined, { numeric: true }) < 0) {
      throw new Error(
        `Installed ${pkg}@${now} is older than the recorded ${recorded} — someone may have downgraded. ` +
          `Re-run with --force to sync anyway.`,
      )
    }
  }

  // For local-cva stacks, source edits also count as drift, so always rescan;
  // for package stacks skip the (expensive) rescan when nothing changed.
  const config = stackConfig(templateDir)
  if (Object.keys(versionChanges).length === 0 && config.designSystem.type === 'package-types') {
    return {
      stack,
      versionChanges,
      components: { added: [], removed: [], changed: {} },
      tokens: { added: [], removed: [], changed: [] },
      icons: { added: 0, removed: 0 },
      staleReferences: {},
      upToDate: true,
      linkSync,
    }
  }

  if (opts.dryRun) {
    return {
      stack,
      versionChanges,
      components: { added: [], removed: [], changed: {} },
      tokens: { added: [], removed: [], changed: [] },
      icons: { added: 0, removed: 0 },
      staleReferences: {},
      upToDate: Object.keys(versionChanges).length === 0,
      linkSync,
    }
  }

  await scaffoldManifest(stack, { root }) // overwrites JSON only; MDs are preserved
  const after = getManifest(stack, { root })

  const components = diffComponents(before.components.components, after.components.components)

  const beforeTokens = indexBy(before.tokens.tokens)
  const afterTokens = indexBy(after.tokens.tokens)
  const tokens = {
    added: [...afterTokens.keys()].filter((n) => !beforeTokens.has(n)).sort(),
    removed: [...beforeTokens.keys()].filter((n) => !afterTokens.has(n)).sort(),
    changed: [...afterTokens.keys()]
      .filter((n) => beforeTokens.has(n) && beforeTokens.get(n)!.value !== afterTokens.get(n)!.value)
      .sort(),
  }

  const beforeIcons = new Set(before.icons.icons)
  const afterIcons = new Set(after.icons.icons)
  const icons = {
    added: [...afterIcons].filter((i) => !beforeIcons.has(i)).length,
    removed: [...beforeIcons].filter((i) => !afterIcons.has(i)).length,
  }

  const staleReferences = findStaleReferences(
    { 'patterns.md': after.patterns, 'rules.md': after.rules, 'voice.md': after.voice },
    components.removed,
  )

  return {
    stack,
    versionChanges,
    components,
    tokens,
    icons,
    staleReferences,
    upToDate:
      Object.keys(versionChanges).length === 0 &&
      components.added.length === 0 &&
      components.removed.length === 0 &&
      Object.keys(components.changed).length === 0,
    linkSync,
  }
}

// ---- CLI ----
const invokedDirectly =
  process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href
if (invokedDirectly) {
  const args = process.argv.slice(2)
  const rootIdx = args.indexOf('--root')
  const root = rootIdx !== -1 ? args[rootIdx + 1] : process.cwd()
  const force = args.includes('--force')
  const dryRun = args.includes('--dry-run')
  const stack = args.filter(
    (a, i) => !a.startsWith('--') && (rootIdx === -1 || i !== rootIdx + 1),
  )[0]
  if (!stack) {
    console.error('Usage: sync.js <stack> [--root <repoRoot>] [--force] [--dry-run]')
    process.exit(1)
  }
  try {
    const report = await syncManifest(stack, { root, force, dryRun })
    if (report.upToDate) {
      console.log(`Manifest for '${stack}' is up to date.`)
    } else {
      for (const [pkg, v] of Object.entries(report.versionChanges)) {
        console.log(`${pkg}: ${v.from ?? '(none)'} → ${v.to ?? '(not installed)'}`)
      }
      if (report.components.added.length > 0)
        console.log(`Components added: ${report.components.added.join(', ')}`)
      if (report.components.removed.length > 0)
        console.log(`Components removed: ${report.components.removed.join(', ')}`)
      for (const [name, changes] of Object.entries(report.components.changed)) {
        console.log(`${name}: ${changes.join('; ')}`)
      }
      if (report.tokens.added.length > 0) console.log(`Tokens added: ${report.tokens.added.join(', ')}`)
      if (report.tokens.removed.length > 0)
        console.log(`Tokens removed: ${report.tokens.removed.join(', ')}`)
      if (report.tokens.changed.length > 0)
        console.log(`Tokens changed: ${report.tokens.changed.join(', ')}`)
      if (report.icons.added || report.icons.removed)
        console.log(`Icons: +${report.icons.added} / -${report.icons.removed}`)
      for (const [file, names] of Object.entries(report.staleReferences)) {
        console.warn(`warning: ${file} mentions removed component(s): ${names.join(', ')} — update it manually.`)
      }
    }
  } catch (e) {
    console.error((e as Error).message)
    process.exit(1)
  }
}
