/**
 * Token scanner: CSS custom properties.
 *
 * Reads `:root { --x: v }` blocks and Tailwind v4 `@theme { --x: v }` blocks
 * from the stack template's stylesheet(s). Produces an empty token list (with
 * a warning entry in the scan report) when nothing is found — never fabricates.
 */

import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { TokenCategory, TokenEntry } from '../schema/types.js'

const BLOCK_RE = /(?::root|@theme(?:\s+inline)?|\.dark)\s*\{([^}]*)\}/g
const VAR_RE = /(--[a-zA-Z0-9-_]+)\s*:\s*([^;]+);/g

export function categorize(name: string, value: string): TokenCategory {
  const n = name.toLowerCase()
  if (/(color|background|foreground|primary|secondary|accent|muted|destructive|border|ring|chart|sidebar)/.test(n))
    return 'color'
  if (/(radius|rounded)/.test(n)) return 'radius'
  if (/(space|spacing|gap|inset)/.test(n)) return 'spacing'
  if (/(font|text|leading|tracking|letter)/.test(n)) return 'typography'
  if (/(shadow|elevation)/.test(n)) return 'shadow'
  if (/(duration|ease|animation|transition)/.test(n)) return 'motion'
  if (/(oklch|rgb|hsl|#[0-9a-f]{3,8})/i.test(value)) return 'color'
  return 'other'
}

export function parseCssTokens(css: string, source: string): TokenEntry[] {
  const tokens = new Map<string, TokenEntry>()
  let block: RegExpExecArray | null
  BLOCK_RE.lastIndex = 0
  while ((block = BLOCK_RE.exec(css)) !== null) {
    let v: RegExpExecArray | null
    VAR_RE.lastIndex = 0
    while ((v = VAR_RE.exec(block[1])) !== null) {
      const name = v[1]
      const value = v[2].trim()
      if (!tokens.has(name)) {
        tokens.set(name, { name, value, category: categorize(name, value), source })
      }
    }
  }
  return [...tokens.values()]
}

export function scanCssTokens(templateDir: string, tokenFiles: string[]): TokenEntry[] {
  const tokens: TokenEntry[] = []
  const seen = new Set<string>()
  for (const rel of tokenFiles) {
    const path = join(templateDir, rel)
    if (!existsSync(path)) continue
    for (const t of parseCssTokens(readFileSync(path, 'utf8'), rel)) {
      if (!seen.has(t.name)) {
        seen.add(t.name)
        tokens.push(t)
      }
    }
  }
  return tokens
}
