import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { applyUpdateProp } from '../src/vite/update-prop.js'

let dir: string

function write(rel: string, content: string): void {
  const full = join(dir, rel)
  mkdirSync(join(full, '..'), { recursive: true })
  writeFileSync(full, content)
}

function read(rel: string): string {
  return readFileSync(join(dir, rel), 'utf8')
}

const APP_TSX = `import { Button } from '@/components/ui/button'

export default function App() {
  return (
    <div>
      <Button>First</Button>
      <Button variant="outline" size="sm">Second</Button>
      <Button
        variant="ghost"
        onClick={() => console.log('x')}
      >
        Third
      </Button>
    </div>
  )
}
`

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'pdk-updateprop-'))
})

afterEach(() => rmSync(dir, { recursive: true, force: true }))

describe('applyUpdateProp', () => {
  it('adds a prop to a bare component (occurrence 1)', () => {
    write('src/App.tsx', APP_TSX)
    const result = applyUpdateProp(dir, {
      componentName: 'Button',
      occurrence: 1,
      propName: 'variant',
      value: 'secondary',
    })
    expect(result).toMatchObject({ ok: true, file: 'src/App.tsx' })
    expect(read('src/App.tsx')).toContain('<Button variant="secondary">First</Button>')
  })

  it('replaces an existing string prop (occurrence 2)', () => {
    write('src/App.tsx', APP_TSX)
    const result = applyUpdateProp(dir, {
      componentName: 'Button',
      occurrence: 2,
      propName: 'variant',
      value: 'destructive',
    })
    expect(result.ok).toBe(true)
    expect(read('src/App.tsx')).toContain('<Button variant="destructive" size="sm">Second</Button>')
  })

  it('patches a multiline opening tag with an event-handler expression', () => {
    write('src/App.tsx', APP_TSX)
    const result = applyUpdateProp(dir, {
      componentName: 'Button',
      occurrence: 3,
      propName: 'variant',
      value: 'link',
    })
    expect(result.ok).toBe(true)
    expect(read('src/App.tsx')).toContain('variant="link"')
    expect(read('src/App.tsx')).not.toContain('variant="ghost"')
  })

  it('sets boolean props (true → bare attribute, false → braces)', () => {
    write('src/App.tsx', APP_TSX)
    expect(
      applyUpdateProp(dir, { componentName: 'Button', occurrence: 1, propName: 'disabled', value: true }).ok,
    ).toBe(true)
    expect(read('src/App.tsx')).toContain('<Button disabled>First</Button>')
    expect(
      applyUpdateProp(dir, { componentName: 'Button', occurrence: 1, propName: 'disabled', value: false }).ok,
    ).toBe(true)
    expect(read('src/App.tsx')).toContain('<Button disabled={false}>First</Button>')
  })

  it('removes a prop with value null', () => {
    write('src/App.tsx', APP_TSX)
    const result = applyUpdateProp(dir, {
      componentName: 'Button',
      occurrence: 2,
      propName: 'size',
      value: null,
    })
    expect(result.ok).toBe(true)
    expect(read('src/App.tsx')).toContain('<Button variant="outline">Second</Button>')
  })

  it('handles Vue SFC syntax (boolean → :prop bind)', () => {
    write(
      'src/App.vue',
      `<template>\n  <Button variant="outline">Hi</Button>\n</template>\n`,
    )
    const result = applyUpdateProp(dir, {
      componentName: 'Button',
      occurrence: 1,
      propName: 'loading',
      value: true,
    })
    expect(result.ok).toBe(true)
    expect(read('src/App.vue')).toContain('<Button loading variant="outline">Hi</Button>')
  })

  it('ignores the vendored design system under src/components/ui', () => {
    write('src/App.tsx', APP_TSX)
    write('src/components/ui/dialog.tsx', '<Button variant="outline">Close</Button>')
    const result = applyUpdateProp(dir, {
      componentName: 'Button',
      occurrence: 1,
      propName: 'variant',
      value: 'secondary',
    })
    expect(result).toMatchObject({ ok: true, file: 'src/App.tsx' })
    expect(read('src/components/ui/dialog.tsx')).toContain('variant="outline"')
  })

  it('refuses when the component appears in multiple files', () => {
    write('src/App.tsx', APP_TSX)
    write('src/Other.tsx', '<Button>Elsewhere</Button>')
    const result = applyUpdateProp(dir, {
      componentName: 'Button',
      occurrence: 1,
      propName: 'variant',
      value: 'ghost',
    })
    expect(result).toMatchObject({ ok: false, status: 422 })
    expect((result as { error: string }).error).toContain('2 files')
  })

  it('refuses when the occurrence is out of range', () => {
    write('src/App.tsx', APP_TSX)
    const result = applyUpdateProp(dir, {
      componentName: 'Button',
      occurrence: 9,
      propName: 'variant',
      value: 'ghost',
    })
    expect(result).toMatchObject({ ok: false, status: 422 })
  })

  it('refuses to patch expression-valued props', () => {
    write(
      'src/App.tsx',
      `<Button variant={isDanger ? ('destructive') : ('outline')}>X</Button>`,
    )
    const result = applyUpdateProp(dir, {
      componentName: 'Button',
      occurrence: 1,
      propName: 'variant',
      value: 'ghost',
    })
    expect(result).toMatchObject({ ok: false, status: 422 })
    expect((result as { error: string }).error).toContain('expression')
  })

  it('does not confuse components with a shared prefix', () => {
    write(
      'src/App.tsx',
      `<div><ButtonGroup><Button>A</Button></ButtonGroup></div>`,
    )
    const result = applyUpdateProp(dir, {
      componentName: 'Button',
      occurrence: 1,
      propName: 'variant',
      value: 'ghost',
    })
    expect(result.ok).toBe(true)
    expect(read('src/App.tsx')).toContain('<ButtonGroup><Button variant="ghost">A</Button></ButtonGroup>')
  })

  it('validates inputs', () => {
    write('src/App.tsx', APP_TSX)
    expect(
      applyUpdateProp(dir, { componentName: 'Button; rm -rf', occurrence: 1, propName: 'x', value: 'y' }),
    ).toMatchObject({ ok: false, status: 400 })
    expect(
      applyUpdateProp(dir, { componentName: 'Button', occurrence: 0, propName: 'x', value: 'y' }),
    ).toMatchObject({ ok: false, status: 400 })
  })
})
