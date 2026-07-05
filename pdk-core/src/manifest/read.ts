/**
 * Manifest reader — the single entry point consumers use.
 *
 * Error contract (per the manifest design spec):
 * - missing manifest/ directory  → hard error naming the scaffold command
 * - missing individual JSON file → hard error naming the file
 * - schema-invalid JSON          → hard error listing path + problem
 * - empty/stub curated MD files  → allowed; consumers soft-warn
 */

import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import type { Manifest, ManifestMeta } from './schema/types.js'
import { validateComponents, validateIcons, validateTokens } from './schema/validate.js'

export class ManifestError extends Error {}

export interface ReadOptions {
  /** Repo root containing stack-templates/. Defaults to process.cwd(). */
  root?: string
}

/** Resolve the manifest directory for a stack, erroring per the contract. */
export function manifestDir(stack: string, opts: ReadOptions = {}): string {
  const root = resolve(opts.root ?? process.cwd())
  const stackDir = join(root, 'stack-templates', stack)
  if (!existsSync(stackDir)) {
    throw new ManifestError(
      `Unknown stack '${stack}': ${stackDir} does not exist. Available stacks live in stack-templates/.`,
    )
  }
  const dir = join(stackDir, 'manifest')
  if (!existsSync(dir)) {
    throw new ManifestError(
      `No manifest for stack '${stack}'. Run /scaffold-manifest ${stack} first.`,
    )
  }
  return dir
}

function readJsonFile(dir: string, file: string, stack: string): unknown {
  const path = join(dir, file)
  if (!existsSync(path)) {
    throw new ManifestError(
      `Manifest for stack '${stack}' is missing ${file}. Run /scaffold-manifest ${stack} to regenerate it.`,
    )
  }
  const raw = readFileSync(path, 'utf8')
  try {
    return JSON.parse(raw)
  } catch (e) {
    throw new ManifestError(`${path} is not valid JSON: ${(e as Error).message}`)
  }
}

function readMd(dir: string, file: string): string {
  const path = join(dir, file)
  if (!existsSync(path)) return ''
  return readFileSync(path, 'utf8')
}

/** True when a curated MD body is still the unedited stub (or empty). */
export function isStubMd(body: string): boolean {
  return body.trim() === '' || body.includes('pdk:stub')
}

export function getManifest(stack: string, opts: ReadOptions = {}): Manifest {
  const dir = manifestDir(stack, opts)

  const componentsRaw = readJsonFile(dir, 'components.json', stack)
  const components = validateComponents(componentsRaw)
  if (!components.ok) {
    throw new ManifestError(
      `${join(dir, 'components.json')} failed validation:\n  ${components.errors.join('\n  ')}`,
    )
  }

  const tokensRaw = readJsonFile(dir, 'tokens.json', stack)
  const tokens = validateTokens(tokensRaw)
  if (!tokens.ok) {
    throw new ManifestError(
      `${join(dir, 'tokens.json')} failed validation:\n  ${tokens.errors.join('\n  ')}`,
    )
  }

  const iconsRaw = readJsonFile(dir, 'icons.json', stack)
  const icons = validateIcons(iconsRaw)
  if (!icons.ok) {
    throw new ManifestError(
      `${join(dir, 'icons.json')} failed validation:\n  ${icons.errors.join('\n  ')}`,
    )
  }

  let meta: ManifestMeta | null = null
  const metaPath = join(dir, '_meta.json')
  if (existsSync(metaPath)) {
    try {
      meta = JSON.parse(readFileSync(metaPath, 'utf8')) as ManifestMeta
    } catch {
      meta = null // _meta.json is advisory; a broken one only degrades sync.
    }
  }

  return {
    stack,
    components: components.value!,
    tokens: tokens.value!,
    icons: icons.value!,
    meta,
    patterns: readMd(dir, 'patterns.md'),
    rules: readMd(dir, 'rules.md'),
    voice: readMd(dir, 'voice.md'),
  }
}
