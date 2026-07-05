/**
 * pdkPrototypePlugin — the one Vite plugin every PDK prototype (and stack
 * template) mounts in its dev server.
 *
 * Dev-only endpoints:
 *   GET /__pdk/manifest   — the stack's scanned manifest JSON (components,
 *                           tokens, icons). Curated markdown never reaches
 *                           the browser.
 *   GET /__pdk/info       — prototype identity (slug, stack, repo root name)
 *
 * The Markup annotation API (/markup/*) and the Tweaker patch endpoint
 * (/__api/update-prop) are mounted here too — see markup-server.ts and
 * update-prop.ts.
 */

import { existsSync, readFileSync } from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { basename, dirname, join, resolve } from 'node:path'
import { getManifest, ManifestError } from '../manifest/read.js'
import { createMarkupRouter } from './markup-router.js'
import { globalStore } from './markup-store.js'
import { createUpdatePropHandler } from './update-prop.js'

export interface PdkPluginOptions {
  /** Stack name; defaults to pdk.json's "stack" field, or the folder name when under stack-templates/. */
  stack?: string
  /** PDK repo root; defaults to walking up until stack-templates/ is found. */
  repoRoot?: string
}

interface PrototypeIdentity {
  slug: string
  stack: string
  repoRoot: string
  dir: string
}

/** Walk up from a prototype dir to the repo root containing stack-templates/. */
export function findRepoRoot(from: string): string | null {
  let dir = resolve(from)
  for (let i = 0; i < 8; i++) {
    if (existsSync(join(dir, 'stack-templates'))) return dir
    const parent = dirname(dir)
    if (parent === dir) return null
    dir = parent
  }
  return null
}

export function resolveIdentity(configRoot: string, opts: PdkPluginOptions): PrototypeIdentity {
  const dir = resolve(configRoot)
  const repoRoot = opts.repoRoot ?? findRepoRoot(dir)
  if (!repoRoot) {
    throw new Error(
      `[pdk] Could not find the PDK repo root (a directory containing stack-templates/) above ${dir}. ` +
        `Pass { repoRoot } to pdkPrototypePlugin().`,
    )
  }
  let slug = basename(dir)
  let stack = opts.stack
  const pdkJsonPath = join(dir, 'pdk.json')
  if (existsSync(pdkJsonPath)) {
    try {
      const pdk = JSON.parse(readFileSync(pdkJsonPath, 'utf8'))
      if (typeof pdk.slug === 'string' && !pdk.slug.startsWith('PROTOTYPE')) slug = pdk.slug
      if (!stack && typeof pdk.stack === 'string') stack = pdk.stack
    } catch {
      // Fall back to folder-derived identity; pdk.json problems surface elsewhere.
    }
  }
  if (!stack) {
    // A stack template running its own dev server is its own stack.
    if (dirname(dir) === join(repoRoot, 'stack-templates')) stack = basename(dir)
  }
  if (!stack) {
    throw new Error(
      `[pdk] ${pdkJsonPath} has no "stack" field. Prototypes must declare which stack-template they use, ` +
        `e.g. { "stack": "react-shadcn" }.`,
    )
  }
  return { slug, stack, repoRoot, dir }
}

function json(res: import('node:http').ServerResponse, status: number, body: unknown): void {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  // The catalogue (a different port) probes these endpoints to show liveness.
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.end(JSON.stringify(body))
}

/**
 * Structural plugin type instead of vite's own `Plugin`: prototypes carry
 * their own vite copy, and typing against pdk-core's vite declarations would
 * make every prototype typecheck fail on private-property mismatches between
 * the two vite versions.
 */
export interface PdkVitePlugin {
  name: string
  apply: 'serve'
  configureServer(server: {
    config: { root: string }
    middlewares: {
      use(
        route: string,
        handler: (req: IncomingMessage, res: ServerResponse, next: () => void) => void,
      ): void
    }
  }): void
}

export function pdkPrototypePlugin(opts: PdkPluginOptions = {}): PdkVitePlugin {
  let identity: PrototypeIdentity | null = null

  return {
    name: 'pdk-prototype',
    apply: 'serve',
    configureServer(server) {
      identity = resolveIdentity(server.config.root, opts)
      const id = identity

      // Markup annotation API (REST + SSE).
      server.middlewares.use('/markup', createMarkupRouter(globalStore))

      // Tweaker write path: patch a component prop in this prototype's source.
      server.middlewares.use('/__api/update-prop', createUpdatePropHandler(id.dir))

      server.middlewares.use('/__pdk/info', (_req, res) => {
        json(res, 200, { slug: id.slug, stack: id.stack })
      })

      server.middlewares.use('/__pdk/manifest', (_req, res) => {
        try {
          const m = getManifest(id.stack, { root: id.repoRoot })
          json(res, 200, {
            stack: m.stack,
            components: m.components,
            tokens: m.tokens,
            icons: m.icons,
          })
        } catch (e) {
          const message = (e as Error).message
          json(res, e instanceof ManifestError ? 404 : 500, { error: message })
        }
      })
    },
  }
}
