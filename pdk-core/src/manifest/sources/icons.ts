/**
 * Icon scanner.
 *
 * Strategy per package, in order:
 * 1. Known directory layouts (@mui/icons-material, @atlaskit/icon/glyph):
 *    one file per icon — list the directory.
 * 2. Type-declaration export scan (lucide-react, lucide-vue-next, and most
 *    icon packs): regex the package's .d.ts entry for exported PascalCase names.
 *
 * Returns an empty list when the package is not installed; the scaffolder
 * reports that as a warning.
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

// Matches both `export declare const X` and lucide's `declare const X` +
// bulk `export { X, Y }` style.
const DECL_RE = /(?:^|\n)\s*(?:export\s+)?declare\s+const\s+([A-Z][A-Za-z0-9]+)\s*:/g
const EXPORT_LIST_RE = /export\s*\{([^}]+)\}/g

const NON_ICON_NAMES = new Set(['Icon', 'IconNode', 'IconProps', 'SVGProps'])

function isIconName(name: string): boolean {
  return /^[A-Z][A-Za-z0-9]+$/.test(name) && !NON_ICON_NAMES.has(name) && !name.startsWith('Lucide')
}

function resolvePkgDir(templateDir: string, pkg: string): string | null {
  // Walk up from the template so hoisted node_modules are found too.
  let dir = templateDir
  for (let i = 0; i < 5; i++) {
    const candidate = join(dir, 'node_modules', pkg)
    if (existsSync(candidate)) return candidate
    dir = join(dir, '..')
  }
  return null
}

function scanDirLayout(pkgDir: string, subDir: string): string[] | null {
  const dir = subDir ? join(pkgDir, subDir) : pkgDir
  if (!existsSync(dir)) return null
  const names = readdirSync(dir)
    .filter((f) => f.endsWith('.d.ts') && /^[A-Z]/.test(f))
    .map((f) => f.replace(/\.d\.ts$/, ''))
  return names.length > 0 ? names : null
}

function scanDtsExports(pkgDir: string): string[] {
  const pkgJsonPath = join(pkgDir, 'package.json')
  if (!existsSync(pkgJsonPath)) return []
  const pkgJson = JSON.parse(readFileSync(pkgJsonPath, 'utf8'))
  const candidates: string[] = []
  const fromExports = pkgJson.exports?.['.']
  if (fromExports) {
    for (const v of [fromExports.types, fromExports.import?.types, fromExports.default?.types]) {
      if (typeof v === 'string') candidates.push(v)
    }
  }
  for (const v of [pkgJson.types, pkgJson.typings, 'dist/index.d.ts', 'index.d.ts']) {
    if (typeof v === 'string') candidates.push(v)
  }
  for (const rel of candidates) {
    const path = join(pkgDir, rel)
    if (!existsSync(path)) continue
    const dts = readFileSync(path, 'utf8')

    const declared = new Set<string>()
    let m: RegExpExecArray | null
    DECL_RE.lastIndex = 0
    while ((m = DECL_RE.exec(dts)) !== null) {
      if (isIconName(m[1])) declared.add(m[1])
    }

    // Intersect with the export list when one exists, so private consts drop out.
    const exported = new Set<string>()
    EXPORT_LIST_RE.lastIndex = 0
    while ((m = EXPORT_LIST_RE.exec(dts)) !== null) {
      for (const raw of m[1].split(',')) {
        const name = (raw.split(/\s+as\s+/).pop() ?? '').trim()
        if (isIconName(name)) exported.add(name)
      }
    }

    const names =
      exported.size > 0 && declared.size > 0
        ? [...declared].filter((n) => exported.has(n))
        : [...(declared.size > 0 ? declared : exported)]
    if (names.length > 0) return names.sort()
  }
  return []
}

export function scanIcons(
  templateDir: string,
  iconPackages: string[],
): { pack?: string; icons: string[]; warnings: string[] } {
  const warnings: string[] = []
  for (const pkg of iconPackages) {
    const pkgDir = resolvePkgDir(templateDir, pkg)
    if (!pkgDir) {
      warnings.push(`icon package '${pkg}' is not installed — run npm install in the template first`)
      continue
    }
    // Known one-file-per-icon layouts.
    const dirNames =
      scanDirLayout(pkgDir, '') ?? // @mui/icons-material
      scanDirLayout(pkgDir, 'glyph') // @atlaskit/icon
    if (dirNames) return { pack: pkg, icons: dirNames.sort(), warnings }

    const dtsNames = scanDtsExports(pkgDir)
    if (dtsNames.length > 0) return { pack: pkg, icons: dtsNames, warnings }

    warnings.push(`could not extract icon names from '${pkg}'`)
  }
  return { icons: [], warnings }
}
