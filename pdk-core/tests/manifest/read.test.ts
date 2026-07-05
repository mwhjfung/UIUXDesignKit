import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { getManifest, isStubMd, ManifestError } from '../../src/manifest/read.js'

let root: string

function writeManifest(stack: string, files: Record<string, string>) {
  const dir = join(root, 'stack-templates', stack, 'manifest')
  mkdirSync(dir, { recursive: true })
  for (const [name, body] of Object.entries(files)) {
    writeFileSync(join(dir, name), body)
  }
}

const GOOD = {
  'components.json': JSON.stringify({
    components: [{ name: 'Button', importPath: '@/components/ui/button', props: [] }],
  }),
  'tokens.json': JSON.stringify({ tokens: [] }),
  'icons.json': JSON.stringify({ icons: [] }),
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'pdk-manifest-'))
  mkdirSync(join(root, 'stack-templates', 'react-x'), { recursive: true })
})

afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

describe('getManifest', () => {
  it('reads a complete manifest', () => {
    writeManifest('react-x', { ...GOOD, 'patterns.md': '# Patterns\nreal content' })
    const m = getManifest('react-x', { root })
    expect(m.components.components[0].name).toBe('Button')
    expect(m.patterns).toContain('real content')
    expect(m.rules).toBe('')
  })

  it('errors on unknown stack, naming the folder', () => {
    expect(() => getManifest('react-nope', { root })).toThrow(/react-nope/)
  })

  it('errors on missing manifest dir, naming the scaffold command', () => {
    expect(() => getManifest('react-x', { root })).toThrow(
      /No manifest for stack 'react-x'\. Run \/scaffold-manifest react-x first\./,
    )
  })

  it('errors on a missing JSON file, naming which one', () => {
    const { 'icons.json': _omit, ...partial } = GOOD
    writeManifest('react-x', partial)
    expect(() => getManifest('react-x', { root })).toThrow(/missing icons\.json/)
  })

  it('errors on invalid JSON syntax with the file path', () => {
    writeManifest('react-x', { ...GOOD, 'tokens.json': '{oops' })
    expect(() => getManifest('react-x', { root })).toThrow(/tokens\.json is not valid JSON/)
  })

  it('errors on schema violations with field paths, without auto-repair', () => {
    writeManifest('react-x', {
      ...GOOD,
      'components.json': JSON.stringify({ components: [{ name: 'X', props: [] }] }),
    })
    try {
      getManifest('react-x', { root })
      expect.fail('should have thrown')
    } catch (e) {
      expect(e).toBeInstanceOf(ManifestError)
      expect((e as Error).message).toContain('components[0].importPath')
    }
  })

  it('tolerates a broken _meta.json (meta is advisory)', () => {
    writeManifest('react-x', { ...GOOD, '_meta.json': '{broken' })
    expect(getManifest('react-x', { root }).meta).toBeNull()
  })
})

describe('isStubMd', () => {
  it('treats empty and pdk:stub bodies as stubs', () => {
    expect(isStubMd('')).toBe(true)
    expect(isStubMd('<!-- pdk:stub -->\n# Patterns')).toBe(true)
    expect(isStubMd('# Patterns\nOur list page uses Table.')).toBe(false)
  })

  it('treats pdk:mined drafts as not yet curated', () => {
    expect(isStubMd('<!-- pdk:mined — confirm via the shortened curation pass -->\n# Patterns')).toBe(true)
  })
})
