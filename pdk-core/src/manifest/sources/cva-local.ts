/**
 * Scanner for shadcn-style copy-installed design systems.
 *
 * Walks `src/components/ui/` in a stack template and extracts component
 * entries from source files. Variant props come from `cva()` calls; everything
 * else the scanner cannot confidently parse goes to the unscanned list rather
 * than being fabricated.
 *
 * Handles both layouts:
 * - React shadcn/ui: `ui/button.tsx` (file per component group)
 * - Vue shadcn-vue:  `ui/button/{index.ts,Button.vue}` (folder per group)
 */

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { basename, extname, join } from 'node:path'
import type { ComponentEntry, PropField } from '../schema/types.js'

export interface CvaScanResult {
  components: ComponentEntry[]
  unscanned: string[]
}

const COMPONENT_EXPORT_RE =
  /export\s+(?:function|const)\s+([A-Z][A-Za-z0-9]*)|export\s+\{\s*default\s+as\s+([A-Z][A-Za-z0-9]*)\s*\}/g

// Bulk export lists (`export { Card, CardHeader }`) — the current shadcn/ui style.
const EXPORT_LIST_RE = /export\s*\{([^}]+)\}/g

export function kebabCase(name: string): string {
  return name.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase()
}

export function pascalCase(slug: string): string {
  return slug
    .split(/[-_]/)
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join('')
}

/** Extract the balanced-brace object literal starting at the first `{` at or after `from`. */
function balancedBraces(source: string, from: number): string | null {
  const start = source.indexOf('{', from)
  if (start === -1) return null
  let depth = 0
  for (let i = start; i < source.length; i++) {
    const ch = source[i]
    if (ch === '{') depth++
    else if (ch === '}') {
      depth--
      if (depth === 0) return source.slice(start, i + 1)
    }
  }
  return null
}

interface CvaBlock {
  /** Variable name, e.g. 'buttonVariants'. */
  varName: string
  /** variant prop name → allowed values */
  variants: Record<string, string[]>
  defaults: Record<string, string>
}

/** Parse every `const xxxVariants = cva(...)` block in a source string. */
export function parseCvaBlocks(source: string): CvaBlock[] {
  const blocks: CvaBlock[] = []
  const declRe = /(?:const|let|var)\s+([a-zA-Z0-9_$]+)\s*=\s*cva\s*\(/g
  let m: RegExpExecArray | null
  while ((m = declRe.exec(source)) !== null) {
    const varName = m[1]
    // The config object is the second argument; find `variants:` after the call start.
    const callStart = m.index + m[0].length
    const variantsIdx = source.indexOf('variants', callStart)
    if (variantsIdx === -1) continue
    const variantsObj = balancedBraces(source, variantsIdx)
    if (!variantsObj) continue

    const variants: Record<string, string[]> = {}
    // Top-level keys of the variants object; each value is an object whose keys are the options.
    const inner = variantsObj.slice(1, -1)
    let depth = 0
    let keyStart = -1
    for (let i = 0; i < inner.length; i++) {
      const ch = inner[i]
      if (depth === 0 && keyStart === -1 && /[a-zA-Z_$'"]/.test(ch)) keyStart = i
      if (depth === 0 && ch === ':' && keyStart !== -1) {
        const key = inner.slice(keyStart, i).trim().replace(/['"]/g, '')
        const valueObj = balancedBraces(inner, i)
        if (valueObj && key) {
          const optionRe = /(?:^|[{,])\s*(?:'([^']+)'|"([^"]+)"|([a-zA-Z0-9_$-]+))\s*:/g
          const options: string[] = []
          let om: RegExpExecArray | null
          // Only scan the top level of the value object for option keys.
          let vDepth = 0
          let cleaned = ''
          for (const vch of valueObj.slice(1, -1)) {
            if (vch === '{' || vch === '(' || vch === '[') vDepth++
            else if (vch === '}' || vch === ')' || vch === ']') vDepth--
            if (vDepth === 0) cleaned += vch
          }
          cleaned = `{${cleaned}}`
          while ((om = optionRe.exec(cleaned)) !== null) {
            options.push(om[1] ?? om[2] ?? om[3])
          }
          if (options.length > 0) variants[key] = options
          // Jump to the closing brace of the value object so the next
          // iteration resumes at depth 0 right after it.
          i = inner.indexOf('{', i) + valueObj.length - 1
        }
        keyStart = -1
        continue
      }
      if (ch === '{') depth++
      else if (ch === '}') depth--
      if (depth === 0 && (ch === ',' || ch === '\n')) keyStart = -1
    }

    const defaults: Record<string, string> = {}
    const dvIdx = source.indexOf('defaultVariants', variantsIdx + variantsObj.length)
    if (dvIdx !== -1 && dvIdx < variantsIdx + variantsObj.length + 500) {
      const dvObj = balancedBraces(source, dvIdx)
      if (dvObj) {
        const dvRe = /([a-zA-Z0-9_$]+)\s*:\s*(?:'([^']+)'|"([^"]+)")/g
        let dm: RegExpExecArray | null
        while ((dm = dvRe.exec(dvObj)) !== null) {
          defaults[dm[1]] = dm[2] ?? dm[3]
        }
      }
    }

    if (Object.keys(variants).length > 0) blocks.push({ varName, variants, defaults })
  }
  return blocks
}

function componentNamesIn(source: string): string[] {
  const names = new Set<string>()
  let m: RegExpExecArray | null
  COMPONENT_EXPORT_RE.lastIndex = 0
  while ((m = COMPONENT_EXPORT_RE.exec(source)) !== null) {
    names.add(m[1] ?? m[2])
  }
  EXPORT_LIST_RE.lastIndex = 0
  while ((m = EXPORT_LIST_RE.exec(source)) !== null) {
    for (const raw of m[1].split(',')) {
      const name = (raw.split(/\s+as\s+/).pop() ?? '').trim()
      if (/^[A-Z][A-Za-z0-9]*$/.test(name)) names.add(name)
    }
  }
  return [...names]
}

function propsFromCva(block: CvaBlock): PropField[] {
  return Object.entries(block.variants).map(([name, options]) => ({
    name,
    label: name.charAt(0).toUpperCase() + kebabCase(name).replace(/-/g, ' ').slice(1),
    type: 'select' as const,
    options,
    ...(block.defaults[name] !== undefined ? { default: block.defaults[name] } : {}),
  }))
}

/** Which component in `names` a cva block belongs to (buttonVariants → Button). */
function ownerOf(block: CvaBlock, names: string[]): string | null {
  const guess = block.varName.replace(/Variants?$/, '')
  const pascal = guess.charAt(0).toUpperCase() + guess.slice(1)
  if (names.includes(pascal)) return pascal
  return names[0] ?? null
}

function scanGroup(groupName: string, sources: string[], importBase: string): ComponentEntry[] {
  const allNames = new Set<string>()
  const cvaProps = new Map<string, PropField[]>()

  for (const source of sources) {
    const names = componentNamesIn(source)
    names.forEach((n) => allNames.add(n))
    for (const block of parseCvaBlocks(source)) {
      const owner = ownerOf(block, names.length > 0 ? names : [pascalCase(groupName)])
      if (owner) {
        allNames.add(owner)
        cvaProps.set(owner, propsFromCva(block))
      }
    }
  }

  // Vue folder layout: .vue component files may not appear as exports in index.ts scans.
  return [...allNames]
    .filter((n) => !n.endsWith('Variants') && !n.endsWith('Props'))
    .sort()
    .map((name) => ({
      name,
      importPath: `${importBase}/${groupName}`,
      detect: { dataSlot: kebabCase(name) },
      props: cvaProps.get(name) ?? [],
      hasChildren: true,
    }))
}

export function scanLocalUi(
  templateDir: string,
  opts: { uiDir?: string; importBase?: string } = {},
): CvaScanResult {
  const uiDir = join(templateDir, opts.uiDir ?? 'src/components/ui')
  const importBase = opts.importBase ?? '@/components/ui'
  const result: CvaScanResult = { components: [], unscanned: [] }

  if (!existsSync(uiDir)) {
    result.unscanned.push(`(ui directory not found: ${uiDir})`)
    return result
  }

  for (const entry of readdirSync(uiDir).sort()) {
    const full = join(uiDir, entry)
    try {
      if (statSync(full).isDirectory()) {
        // Vue layout: folder per group.
        const sources = readdirSync(full)
          .filter((f) => ['.ts', '.tsx', '.vue', '.js'].includes(extname(f)))
          .map((f) => readFileSync(join(full, f), 'utf8'))
        // Component names for .vue files come from filenames, not export scans.
        const vueNames = readdirSync(full)
          .filter((f) => extname(f) === '.vue')
          .map((f) => basename(f, '.vue'))
        const entries = scanGroup(entry, sources, importBase)
        const known = new Set(entries.map((e) => e.name))
        for (const vn of vueNames) {
          if (!known.has(vn)) {
            entries.push({
              name: vn,
              importPath: `${importBase}/${entry}`,
              detect: { dataSlot: kebabCase(vn) },
              props: [],
              hasChildren: true,
            })
          }
        }
        result.components.push(...entries.sort((a, b) => a.name.localeCompare(b.name)))
      } else if (['.ts', '.tsx'].includes(extname(entry))) {
        // React layout: file per group.
        const group = basename(entry, extname(entry))
        const source = readFileSync(full, 'utf8')
        result.components.push(...scanGroup(group, [source], importBase))
      }
    } catch (e) {
      result.unscanned.push(`${entry}: ${(e as Error).message}`)
    }
  }

  return result
}
