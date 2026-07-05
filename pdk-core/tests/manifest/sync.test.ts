import { describe, expect, it } from 'vitest'
import type { ComponentEntry } from '../../src/manifest/schema/types.js'
import { diffComponents, findStaleReferences } from '../../src/manifest/sync.js'

function comp(name: string, props: ComponentEntry['props'] = []): ComponentEntry {
  return { name, importPath: `@/components/ui/${name.toLowerCase()}`, props }
}

describe('diffComponents', () => {
  it('reports added and removed components', () => {
    const diff = diffComponents([comp('Button'), comp('Card')], [comp('Button'), comp('Sheet')])
    expect(diff.added).toEqual(['Sheet'])
    expect(diff.removed).toEqual(['Card'])
  })

  it('reports gained and lost select options', () => {
    const before = [
      comp('Button', [
        { name: 'variant', label: 'Variant', type: 'select', options: ['default', 'outline'] },
      ]),
    ]
    const after = [
      comp('Button', [
        { name: 'variant', label: 'Variant', type: 'select', options: ['default', 'subtle'] },
      ]),
    ]
    const diff = diffComponents(before, after)
    expect(diff.changed.Button.join(' ')).toContain("gained option(s): subtle")
    expect(diff.changed.Button.join(' ')).toContain("lost option(s): outline")
  })

  it('reports added, removed, and retyped props', () => {
    const before = [
      comp('Card', [
        { name: 'padding', label: 'Padding', type: 'select', options: ['s', 'm'] },
        { name: 'raised', label: 'Raised', type: 'boolean' },
      ]),
    ]
    const after = [
      comp('Card', [
        { name: 'raised', label: 'Raised', type: 'string' },
        { name: 'elevation', label: 'Elevation', type: 'number' },
      ]),
    ]
    const diff = diffComponents(before, after)
    const text = diff.changed.Card.join('; ')
    expect(text).toContain("prop 'padding' removed")
    expect(text).toContain("prop 'elevation' added")
    expect(text).toContain("prop 'raised' type changed boolean → string")
  })

  it('is empty for identical inputs', () => {
    const a = [comp('Button', [{ name: 'x', label: 'X', type: 'boolean' }])]
    const diff = diffComponents(a, a)
    expect(diff.added).toHaveLength(0)
    expect(diff.removed).toHaveLength(0)
    expect(Object.keys(diff.changed)).toHaveLength(0)
  })
})

describe('findStaleReferences', () => {
  it('flags curated MD files that mention removed components', () => {
    const stale = findStaleReferences(
      {
        'rules.md': 'Always use Sheet for detail; never Modal.',
        'patterns.md': 'The list page uses Table.',
      },
      ['Modal', 'Drawer'],
    )
    expect(stale['rules.md']).toEqual(['Modal'])
    expect(stale['patterns.md']).toBeUndefined()
  })

  it('does not match substrings of longer identifiers', () => {
    const stale = findStaleReferences({ 'rules.md': 'Use ModalDialog here.' }, ['Modal'])
    expect(stale['rules.md']).toBeUndefined()
  })
})
