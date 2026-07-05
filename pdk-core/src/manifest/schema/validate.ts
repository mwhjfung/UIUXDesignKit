/**
 * Hand-rolled validators for the three manifest JSON files.
 *
 * Deliberately dependency-free (no ajv): the schemas are small and the error
 * contract matters more than JSON-Schema fidelity. Each validator returns a
 * list of errors as `path: problem` strings; an empty list means valid.
 */

import type {
  ComponentsManifest,
  IconsManifest,
  PropFieldType,
  TokenCategory,
  TokensManifest,
} from './types.js'

const PROP_TYPES: PropFieldType[] = ['string', 'boolean', 'number', 'select']
const TOKEN_CATEGORIES: TokenCategory[] = [
  'color',
  'spacing',
  'typography',
  'radius',
  'shadow',
  'motion',
  'other',
]

export interface ValidationResult<T> {
  ok: boolean
  errors: string[]
  value: T | null
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

export function validateComponents(data: unknown): ValidationResult<ComponentsManifest> {
  const errors: string[] = []
  if (!isRecord(data)) {
    return { ok: false, errors: ['(root): expected an object'], value: null }
  }
  if (!Array.isArray(data.components)) {
    errors.push('components: expected an array')
  } else {
    data.components.forEach((c, i) => {
      const at = `components[${i}]`
      if (!isRecord(c)) {
        errors.push(`${at}: expected an object`)
        return
      }
      if (typeof c.name !== 'string' || c.name === '') errors.push(`${at}.name: expected a non-empty string`)
      if (typeof c.importPath !== 'string' || c.importPath === '')
        errors.push(`${at}.importPath: expected a non-empty string`)
      if (c.detect !== undefined && !isRecord(c.detect)) errors.push(`${at}.detect: expected an object`)
      if (!Array.isArray(c.props)) {
        errors.push(`${at}.props: expected an array`)
        return
      }
      c.props.forEach((p, j) => {
        const pat = `${at}.props[${j}]`
        if (!isRecord(p)) {
          errors.push(`${pat}: expected an object`)
          return
        }
        if (typeof p.name !== 'string' || p.name === '') errors.push(`${pat}.name: expected a non-empty string`)
        if (typeof p.label !== 'string' || p.label === '') errors.push(`${pat}.label: expected a non-empty string`)
        if (!PROP_TYPES.includes(p.type as PropFieldType))
          errors.push(`${pat}.type: expected one of ${PROP_TYPES.join(', ')}`)
        if (p.type === 'select') {
          if (!Array.isArray(p.options) || p.options.length === 0)
            errors.push(`${pat}.options: select props require a non-empty options array`)
          else if (p.options.some((o) => typeof o !== 'string'))
            errors.push(`${pat}.options: expected strings`)
        }
      })
    })
  }
  return errors.length
    ? { ok: false, errors, value: null }
    : { ok: true, errors: [], value: data as unknown as ComponentsManifest }
}

export function validateTokens(data: unknown): ValidationResult<TokensManifest> {
  const errors: string[] = []
  if (!isRecord(data)) {
    return { ok: false, errors: ['(root): expected an object'], value: null }
  }
  if (!Array.isArray(data.tokens)) {
    errors.push('tokens: expected an array')
  } else {
    data.tokens.forEach((t, i) => {
      const at = `tokens[${i}]`
      if (!isRecord(t)) {
        errors.push(`${at}: expected an object`)
        return
      }
      if (typeof t.name !== 'string' || t.name === '') errors.push(`${at}.name: expected a non-empty string`)
      if (typeof t.value !== 'string') errors.push(`${at}.value: expected a string`)
      if (!TOKEN_CATEGORIES.includes(t.category as TokenCategory))
        errors.push(`${at}.category: expected one of ${TOKEN_CATEGORIES.join(', ')}`)
    })
  }
  return errors.length
    ? { ok: false, errors, value: null }
    : { ok: true, errors: [], value: data as unknown as TokensManifest }
}

export function validateIcons(data: unknown): ValidationResult<IconsManifest> {
  const errors: string[] = []
  if (!isRecord(data)) {
    return { ok: false, errors: ['(root): expected an object'], value: null }
  }
  if (data.pack !== undefined && typeof data.pack !== 'string') errors.push('pack: expected a string')
  if (!Array.isArray(data.icons)) errors.push('icons: expected an array')
  else if (data.icons.some((i) => typeof i !== 'string')) errors.push('icons: expected strings')
  return errors.length
    ? { ok: false, errors, value: null }
    : { ok: true, errors: [], value: data as unknown as IconsManifest }
}
