/**
 * Scanner for npm-packaged design systems with TypeScript declarations
 * (Material UI, Atlaskit, Mantine, Chakra, ...).
 *
 * v1 scope (per the manifest design spec): extract only props that map onto
 * Tweaker field types — string-literal unions (select), boolean, number,
 * string. Anything the scanner cannot confidently parse is skipped and the
 * component is recorded in the unscanned list. Never fabricate.
 */

import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { Project, SyntaxKind, type Type } from 'ts-morph'
import type { ComponentEntry, PropField } from '../schema/types.js'
import { kebabCase } from './cva-local.js'

export interface TsScanResult {
  components: ComponentEntry[]
  unscanned: string[]
}

/** Props that are never useful in the Tweaker. */
const SKIP_PROPS = new Set([
  'children',
  'className',
  'classes',
  'style',
  'sx',
  'component',
  'components',
  'componentsProps',
  'slotProps',
  'slots',
  'ref',
  'key',
  'id',
  'tabIndex',
])

const MAX_PROPS_PER_COMPONENT = 24
const MAX_COMPONENTS = 400

function labelFor(propName: string): string {
  const words = kebabCase(propName).replace(/-/g, ' ')
  return words.charAt(0).toUpperCase() + words.slice(1)
}

function fieldForType(name: string, t: Type): PropField | null {
  // Unwrap `X | undefined` from optional props.
  const parts = t.isUnion() ? t.getUnionTypes().filter((u) => !u.isUndefined() && !u.isNull()) : [t]
  if (parts.length === 0) return null

  if (parts.every((p) => p.isBooleanLiteral()) || (parts.length === 1 && parts[0].isBoolean())) {
    return { name, label: labelFor(name), type: 'boolean' }
  }
  if (parts.every((p) => p.isStringLiteral())) {
    const options = [...new Set(parts.map((p) => p.getLiteralValue() as string))]
    if (options.length === 1) return null // a fixed literal is not tweakable
    return { name, label: labelFor(name), type: 'select', options }
  }
  if (parts.length === 1 && parts[0].isString()) {
    return { name, label: labelFor(name), type: 'string' }
  }
  if (parts.length === 1 && parts[0].isNumber()) {
    return { name, label: labelFor(name), type: 'number' }
  }
  // Mixed unions like `'small' | 'large' | string` → treat as select if ≥2 literals.
  const literals = parts.filter((p) => p.isStringLiteral())
  if (literals.length >= 2) {
    return {
      name,
      label: labelFor(name),
      type: 'select',
      options: [...new Set(literals.map((p) => p.getLiteralValue() as string))],
    }
  }
  return null
}

function typesEntryFor(pkgDir: string): string | null {
  const pkgJsonPath = join(pkgDir, 'package.json')
  if (!existsSync(pkgJsonPath)) return null
  const pkgJson = JSON.parse(readFileSync(pkgJsonPath, 'utf8'))
  const candidates: string[] = []
  const rootExport = pkgJson.exports?.['.']
  if (rootExport) {
    for (const v of [
      rootExport.types,
      rootExport.import?.types,
      rootExport.require?.types,
      rootExport.default?.types,
    ]) {
      if (typeof v === 'string') candidates.push(v)
    }
  }
  for (const v of [pkgJson.types, pkgJson.typings, 'index.d.ts', 'dist/index.d.ts']) {
    if (typeof v === 'string') candidates.push(v)
  }
  for (const rel of candidates) {
    const path = join(pkgDir, rel)
    if (existsSync(path)) return path
  }
  return null
}

function resolvePkgDir(templateDir: string, pkg: string): string | null {
  let dir = templateDir
  for (let i = 0; i < 5; i++) {
    const candidate = join(dir, 'node_modules', pkg)
    if (existsSync(candidate)) return candidate
    dir = join(dir, '..')
  }
  return null
}

export function scanPackageTypes(templateDir: string, packages: string[]): TsScanResult {
  const result: TsScanResult = { components: [], unscanned: [] }
  const project = new Project({
    compilerOptions: { skipLibCheck: true },
    skipAddingFilesFromTsConfig: true,
  })

  for (const pkg of packages) {
    const pkgDir = resolvePkgDir(templateDir, pkg)
    if (!pkgDir) {
      result.unscanned.push(`(package '${pkg}' is not installed — run npm install in the template first)`)
      continue
    }
    const entry = typesEntryFor(pkgDir)
    if (!entry) {
      result.unscanned.push(`(no TypeScript declarations found for '${pkg}')`)
      continue
    }

    const sourceFile = project.addSourceFileAtPath(entry)
    const exported = sourceFile.getExportedDeclarations()

    // Pass 1: collect exported `<Name>Props` interfaces/type-aliases.
    const propTypes = new Map<string, Type>()
    for (const [name, decls] of exported) {
      const m = name.match(/^([A-Z][A-Za-z0-9]*)Props$/)
      if (!m) continue
      const decl = decls[0]
      try {
        const kind = decl.getKind()
        if (kind === SyntaxKind.InterfaceDeclaration || kind === SyntaxKind.TypeAliasDeclaration) {
          propTypes.set(m[1], decl.getType())
        }
      } catch {
        result.unscanned.push(`${pkg}:${name}`)
      }
    }

    // Default export (Atlaskit-style `export default Button`): name it after
    // the package's last path segment when a matching Props type exists.
    const defaultDecls = exported.get('default')
    if (defaultDecls) {
      const segment = pkg.split('/').pop() ?? pkg
      const guessName = segment
        .split('-')
        .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
        .join('')
      const propsType =
        propTypes.get(guessName) ??
        (propTypes.size === 1 ? [...propTypes.values()][0] : undefined)
      if (propsType && !exported.has(guessName)) {
        try {
          const props: PropField[] = []
          let hasChildren = false
          for (const prop of propsType.getProperties()) {
            const propName = prop.getName()
            if (propName === 'children') {
              hasChildren = true
              continue
            }
            if (SKIP_PROPS.has(propName) || propName.startsWith('on') || propName.startsWith('aria-'))
              continue
            if (props.length >= MAX_PROPS_PER_COMPONENT) break
            const decl = prop.getDeclarations()[0]
            if (!decl) continue
            const field = fieldForType(propName, prop.getTypeAtLocation(decl))
            if (field) props.push(field)
          }
          result.components.push({ name: guessName, importPath: pkg, props, hasChildren })
        } catch {
          result.unscanned.push(`${pkg}:default`)
        }
      }
    }

    // Pass 2: exported PascalCase values that have a matching Props type.
    for (const [name, decls] of exported) {
      if (result.components.length >= MAX_COMPONENTS) {
        result.unscanned.push(`(${pkg}: component cap of ${MAX_COMPONENTS} reached)`)
        break
      }
      if (!/^[A-Z][A-Za-z0-9]*$/.test(name) || name.endsWith('Props')) continue
      const propsType = propTypes.get(name)
      if (!propsType) continue
      const isValueExport = decls.some((d) =>
        [
          SyntaxKind.VariableDeclaration,
          SyntaxKind.FunctionDeclaration,
          SyntaxKind.ClassDeclaration,
          SyntaxKind.ExportAssignment,
        ].includes(d.getKind()),
      )
      if (!isValueExport) continue

      try {
        const props: PropField[] = []
        let hasChildren = false
        for (const prop of propsType.getProperties()) {
          const propName = prop.getName()
          if (propName === 'children') {
            hasChildren = true
            continue
          }
          if (SKIP_PROPS.has(propName) || propName.startsWith('on') || propName.startsWith('aria-'))
            continue
          if (props.length >= MAX_PROPS_PER_COMPONENT) break
          const decl = prop.getDeclarations()[0]
          if (!decl) continue
          const field = fieldForType(propName, prop.getTypeAtLocation(decl))
          if (field) props.push(field)
        }
        result.components.push({
          name,
          importPath: pkg,
          props,
          hasChildren,
        })
      } catch {
        result.unscanned.push(`${pkg}:${name}`)
      }
    }
  }

  result.components.sort((a, b) => a.name.localeCompare(b.name))
  return result
}
