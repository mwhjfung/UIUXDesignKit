/**
 * POST /__api/update-prop — the Tweaker's write path.
 *
 * Patches the Nth occurrence of a component tag in the prototype's source
 * with a new prop value. Deliberately conservative (per the PDK roadmap's
 * Tweaker design): only simple literal values, only when the target is
 * unambiguous; anything else returns 422 with a reason so the UI can route
 * the change through the Markup annotation loop instead.
 *
 * Body: {
 *   componentName: string     // exact exported name, e.g. "Button"
 *   occurrence: number        // 1-based index in document order
 *   propName: string
 *   value: string | number | boolean | null   // null removes the prop
 * }
 */

import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { extname, join, relative } from 'node:path'

export interface UpdatePropRequest {
  componentName: string
  occurrence: number
  propName: string
  value: string | number | boolean | null
}

export type UpdatePropResult =
  | { ok: true; file: string; occurrence: number }
  | { ok: false; status: number; error: string }

const SOURCE_EXTENSIONS = new Set(['.tsx', '.jsx', '.vue'])
const IDENT_RE = /^[A-Za-z_$][A-Za-z0-9_$-]*$/

function sourceFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir).sort()) {
    if (entry === 'node_modules' || entry === 'dist' || entry.startsWith('.')) continue
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      // components/ui is the vendored design system — the Tweaker edits
      // component *usage*, never the design system's own source.
      if (entry === 'ui' && dir.endsWith(join('src', 'components'))) continue
      sourceFiles(full, acc)
    } else if (SOURCE_EXTENSIONS.has(extname(entry))) acc.push(full)
  }
  return acc
}

/** Find [start, end) of the Nth opening tag `<Name ...>` in source. */
function findOpeningTag(
  source: string,
  name: string,
  occurrence: number,
): { start: number; end: number } | null {
  const tagRe = new RegExp(`<${name}(?=[\\s/>])`, 'g')
  let m: RegExpExecArray | null
  let count = 0
  while ((m = tagRe.exec(source)) !== null) {
    count++
    if (count < occurrence) continue
    // Walk to the closing '>' of this opening tag, skipping quotes and braces.
    let i = m.index + m[0].length
    let brace = 0
    let quote: string | null = null
    while (i < source.length) {
      const ch = source[i]
      if (quote) {
        if (ch === quote) quote = null
      } else if (ch === '"' || ch === "'" || ch === '`') {
        quote = ch
      } else if (ch === '{') {
        brace++
      } else if (ch === '}') {
        brace--
      } else if (ch === '>' && brace === 0) {
        return { start: m.index, end: i + 1 }
      }
      i++
    }
    return null
  }
  return null
}

function formatAttr(file: string, propName: string, value: string | number | boolean): string {
  const isVue = extname(file) === '.vue'
  if (typeof value === 'boolean') {
    if (value) return propName
    return isVue ? `:${propName}="false"` : `${propName}={false}`
  }
  if (typeof value === 'number') {
    return isVue ? `:${propName}="${value}"` : `${propName}={${value}}`
  }
  return `${propName}="${value.replace(/"/g, '&quot;')}"`
}

/**
 * Regexes matching an existing occurrence of the prop inside an opening tag,
 * in any of its simple-literal spellings. Complex expression values
 * (propName={someExpr}) are detected separately and refused.
 */
function existingAttrRe(propName: string): RegExp {
  // :prop="..." (vue bind) | prop="..." | prop={...literal...} | bare prop
  return new RegExp(
    `\\s(?::${propName}="[^"]*"|${propName}="[^"]*"|${propName}=\\{[^{}]*\\}|${propName})(?=[\\s/>])`,
  )
}

const COMPLEX_VALUE_RE = (propName: string) =>
  new RegExp(`\\s:?${propName}=\\{[^{}]*[({\\[][\\s\\S]*?\\}`)

export function applyUpdateProp(prototypeDir: string, req: UpdatePropRequest): UpdatePropResult {
  const { componentName, occurrence, propName, value } = req
  if (!IDENT_RE.test(componentName ?? '') || !IDENT_RE.test(propName ?? '')) {
    return { ok: false, status: 400, error: 'Invalid componentName or propName.' }
  }
  if (!Number.isInteger(occurrence) || occurrence < 1) {
    return { ok: false, status: 400, error: 'occurrence must be a positive integer.' }
  }
  if (value !== null && !['string', 'number', 'boolean'].includes(typeof value)) {
    return { ok: false, status: 400, error: 'value must be a string, number, boolean, or null.' }
  }

  const srcDir = join(prototypeDir, 'src')
  if (!existsSync(srcDir)) return { ok: false, status: 500, error: `No src/ directory in ${prototypeDir}.` }

  const tagRe = new RegExp(`<${componentName}(?=[\\s/>])`, 'g')
  const containing = sourceFiles(srcDir).filter((f) => {
    const content = readFileSync(f, 'utf8')
    tagRe.lastIndex = 0
    return tagRe.test(content)
  })

  if (containing.length === 0) {
    return { ok: false, status: 422, error: `<${componentName}> not found in any source file.` }
  }
  if (containing.length > 1) {
    return {
      ok: false,
      status: 422,
      error:
        `<${componentName}> appears in ${containing.length} files — cannot map the on-screen ` +
        `instance to source reliably. Use a Markup annotation instead.`,
    }
  }

  const file = containing[0]
  const source = readFileSync(file, 'utf8')
  const tag = findOpeningTag(source, componentName, occurrence)
  if (!tag) {
    return {
      ok: false,
      status: 422,
      error: `Occurrence ${occurrence} of <${componentName}> not found in ${relative(prototypeDir, file)}.`,
    }
  }

  const tagText = source.slice(tag.start, tag.end)
  if (COMPLEX_VALUE_RE(propName).test(tagText)) {
    return {
      ok: false,
      status: 422,
      error: `${propName} on this <${componentName}> is set by an expression — not safe to patch. Use a Markup annotation instead.`,
    }
  }

  const attrRe = existingAttrRe(propName)
  let newTagText: string
  if (value === null) {
    if (!attrRe.test(tagText)) {
      return { ok: false, status: 422, error: `${propName} is not set on this <${componentName}>.` }
    }
    newTagText = tagText.replace(attrRe, '')
  } else if (attrRe.test(tagText)) {
    newTagText = tagText.replace(attrRe, ` ${formatAttr(file, propName, value)}`)
  } else {
    // Insert right after the component name.
    const insertAt = componentName.length + 1
    newTagText = `${tagText.slice(0, insertAt)} ${formatAttr(file, propName, value)}${tagText.slice(insertAt)}`
  }

  writeFileSync(file, source.slice(0, tag.start) + newTagText + source.slice(tag.end))
  return { ok: true, file: relative(prototypeDir, file), occurrence }
}

export function createUpdatePropHandler(prototypeDir: string) {
  return async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    const send = (status: number, body: unknown): void => {
      res.statusCode = status
      res.setHeader('Content-Type', 'application/json')
      res.setHeader('Access-Control-Allow-Origin', '*')
      res.end(JSON.stringify(body))
    }
    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      })
      res.end()
      return
    }
    if (req.method !== 'POST') return send(405, { error: 'Method not allowed' })

    let raw = ''
    req.on('data', (chunk: Buffer) => (raw += chunk.toString()))
    req.on('end', () => {
      try {
        const body = JSON.parse(raw || '{}') as UpdatePropRequest
        const result = applyUpdateProp(prototypeDir, body)
        if (result.ok) send(200, { success: true, file: result.file })
        else send(result.status, { error: result.error })
      } catch (e) {
        send(500, { error: e instanceof Error ? e.message : 'Unknown error' })
      }
    })
  }
}
