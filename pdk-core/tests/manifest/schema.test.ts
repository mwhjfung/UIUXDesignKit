import { describe, expect, it } from 'vitest'
import {
  validateComponents,
  validateIcons,
  validateTokens,
} from '../../src/manifest/schema/validate.js'

describe('validateComponents', () => {
  it('accepts a well-formed manifest', () => {
    const result = validateComponents({
      components: [
        {
          name: 'Button',
          importPath: '@/components/ui/button',
          detect: { dataSlot: 'button' },
          props: [
            { name: 'variant', label: 'Variant', type: 'select', options: ['default', 'outline'] },
            { name: 'disabled', label: 'Disabled', type: 'boolean' },
          ],
          hasChildren: true,
        },
      ],
    })
    expect(result.ok).toBe(true)
    expect(result.value!.components[0].name).toBe('Button')
  })

  it('rejects non-object roots', () => {
    expect(validateComponents([]).ok).toBe(false)
    expect(validateComponents(null).ok).toBe(false)
  })

  it('names the exact path of a bad prop', () => {
    const result = validateComponents({
      components: [
        {
          name: 'Button',
          importPath: 'x',
          props: [{ name: 'variant', label: 'Variant', type: 'select' }],
        },
      ],
    })
    expect(result.ok).toBe(false)
    expect(result.errors.join('\n')).toContain('components[0].props[0].options')
  })

  it('rejects unknown prop types', () => {
    const result = validateComponents({
      components: [
        { name: 'X', importPath: 'x', props: [{ name: 'a', label: 'A', type: 'enum' }] },
      ],
    })
    expect(result.ok).toBe(false)
    expect(result.errors[0]).toContain('type')
  })

  it('requires name and importPath', () => {
    const result = validateComponents({ components: [{ props: [] }] })
    expect(result.ok).toBe(false)
    expect(result.errors.some((e) => e.includes('.name'))).toBe(true)
    expect(result.errors.some((e) => e.includes('.importPath'))).toBe(true)
  })
})

describe('validateTokens', () => {
  it('accepts a well-formed token list', () => {
    const result = validateTokens({
      tokens: [{ name: '--primary', value: 'oklch(0.2 0 0)', category: 'color' }],
    })
    expect(result.ok).toBe(true)
  })

  it('rejects unknown categories with the path', () => {
    const result = validateTokens({ tokens: [{ name: '--x', value: '1px', category: 'nope' }] })
    expect(result.ok).toBe(false)
    expect(result.errors[0]).toContain('tokens[0].category')
  })
})

describe('validateIcons', () => {
  it('accepts icons with a pack', () => {
    expect(validateIcons({ pack: 'lucide-react', icons: ['ArrowRight'] }).ok).toBe(true)
  })
  it('accepts an empty icon list', () => {
    expect(validateIcons({ icons: [] }).ok).toBe(true)
  })
  it('rejects non-string icons', () => {
    expect(validateIcons({ icons: [1] }).ok).toBe(false)
  })
})
