import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { parseCvaBlocks, scanLocalUi } from '../../src/manifest/sources/cva-local.js'
import { categorize, parseCssTokens } from '../../src/manifest/sources/css-tokens.js'

const BUTTON_TSX = `
import { cva } from 'class-variance-authority'

const buttonVariants = cva(
  'inline-flex items-center',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground',
        destructive: 'bg-destructive text-white',
        outline: 'border bg-background',
      },
      size: {
        default: 'h-9 px-4',
        sm: 'h-8 px-3',
        lg: 'h-10 px-6',
        icon: 'size-9',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
)

export function Button({ className, variant, size, ...props }) {
  return <button data-slot="button" className={buttonVariants({ variant, size })} {...props} />
}
`

const VUE_INDEX_TS = `
import { cva } from 'class-variance-authority'
export { default as Button } from './Button.vue'
export const buttonVariants = cva('base', {
  variants: {
    variant: { default: 'a', ghost: 'b' },
  },
  defaultVariants: { variant: 'default' },
})
`

describe('parseCvaBlocks', () => {
  it('extracts variants, options, and defaults from a react shadcn file', () => {
    const blocks = parseCvaBlocks(BUTTON_TSX)
    expect(blocks).toHaveLength(1)
    expect(blocks[0].varName).toBe('buttonVariants')
    expect(blocks[0].variants.variant).toEqual(['default', 'destructive', 'outline'])
    expect(blocks[0].variants.size).toEqual(['default', 'sm', 'lg', 'icon'])
    expect(blocks[0].defaults).toEqual({ variant: 'default', size: 'default' })
  })

  it('returns nothing for source without cva', () => {
    expect(parseCvaBlocks('export const x = 1')).toHaveLength(0)
  })
})

describe('scanLocalUi', () => {
  let dir: string
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'pdk-cva-'))
  })
  afterEach(() => rmSync(dir, { recursive: true, force: true }))

  it('scans react file-per-group layout', () => {
    mkdirSync(join(dir, 'src/components/ui'), { recursive: true })
    writeFileSync(join(dir, 'src/components/ui/button.tsx'), BUTTON_TSX)
    const result = scanLocalUi(dir)
    expect(result.unscanned).toHaveLength(0)
    const button = result.components.find((c) => c.name === 'Button')
    expect(button).toBeDefined()
    expect(button!.importPath).toBe('@/components/ui/button')
    expect(button!.detect?.dataSlot).toBe('button')
    const variant = button!.props.find((p) => p.name === 'variant')
    expect(variant?.type).toBe('select')
    expect(variant?.options).toContain('destructive')
    expect(variant?.default).toBe('default')
  })

  it('scans vue folder-per-group layout, naming components from .vue files', () => {
    const group = join(dir, 'src/components/ui/button')
    mkdirSync(group, { recursive: true })
    writeFileSync(join(group, 'index.ts'), VUE_INDEX_TS)
    writeFileSync(join(group, 'Button.vue'), '<template><button/></template>')
    const result = scanLocalUi(dir)
    const button = result.components.find((c) => c.name === 'Button')
    expect(button).toBeDefined()
    expect(button!.props.find((p) => p.name === 'variant')?.options).toEqual(['default', 'ghost'])
  })

  it('reports a missing ui directory instead of fabricating', () => {
    const result = scanLocalUi(dir)
    expect(result.components).toHaveLength(0)
    expect(result.unscanned[0]).toContain('ui directory not found')
  })
})

describe('parseCssTokens', () => {
  it('reads :root and @theme blocks', () => {
    const css = `
:root {
  --background: oklch(1 0 0);
  --radius: 0.625rem;
}
@theme inline {
  --color-primary: var(--primary);
  --font-sans: 'Inter Variable', sans-serif;
}
.unrelated { color: red; }
`
    const tokens = parseCssTokens(css, 'src/assets/index.css')
    const names = tokens.map((t) => t.name)
    expect(names).toContain('--background')
    expect(names).toContain('--radius')
    expect(names).toContain('--color-primary')
    expect(names).toContain('--font-sans')
    expect(tokens.find((t) => t.name === '--background')?.category).toBe('color')
    expect(tokens.find((t) => t.name === '--radius')?.category).toBe('radius')
    expect(tokens.find((t) => t.name === '--font-sans')?.category).toBe('typography')
  })

  it('dedupes across blocks, first value wins', () => {
    const tokens = parseCssTokens(
      ':root { --x: 1; }\n.dark { --x: 2; }',
      'index.css',
    )
    expect(tokens).toHaveLength(1)
    expect(tokens[0].value).toBe('1')
  })
})

describe('categorize', () => {
  it('categorizes by name first, value as fallback', () => {
    expect(categorize('--sidebar-border', 'x')).toBe('color')
    expect(categorize('--tracking-tight', '-0.02em')).toBe('typography')
    expect(categorize('--mystery', '#fff')).toBe('color')
    expect(categorize('--mystery', '17')).toBe('other')
  })
})
