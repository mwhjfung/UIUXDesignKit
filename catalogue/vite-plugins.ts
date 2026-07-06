/**
 * Catalogue dev-server plugins.
 *
 * serveTooling()  — serves the PDK browser tooling under /tooling/* so any
 *                   prototype (any port, any framework) can load it via
 *                   tooling/pdk-prelude.js.
 * prototypesApi() — the scaffolding API behind the catalogue UI:
 *                     GET  /__api/prototypes       list prototypes
 *                     GET  /__api/stacks           list stack templates
 *                     POST /__api/create-prototype copy a stack template
 *                     POST /__api/remix-prototype  copy an existing prototype
 *                     GET  /__api/screens          list screens from linked product repos
 *                     GET  /__api/requests         list catalogue requests
 *                     POST /__api/requests         create a catalogue request
 *                     PATCH /__api/requests/<id>   update a catalogue request
 *                     POST /__api/update-status    update a prototype's status
 *
 * Scaffolding is a directory-tree copy of a stack template (or an existing
 * prototype, for remix) with placeholder-token substitution and automatic
 * port assignment.
 */

import {
  cpSync,
  existsSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { extname, join, resolve } from 'node:path'
import type { Plugin } from 'vite'
import { linkedRepos, listScreens } from '@pdk/core/manifest'
import {
  addRequest,
  listRequests,
  updatePrototypeStatus,
  updateRequest,
} from '@pdk/core/requests'

const repoRoot = resolve(__dirname, '..')
const prototypesDir = join(repoRoot, 'prototypes')
const stackTemplatesDir = join(repoRoot, 'stack-templates')

// 'manifest' stays behind by design: prototypes read the manifest from their
// stack-template — single source of truth per stack (see the manifest spec).
const COPY_EXCLUDES = new Set(['node_modules', 'dist', '.git', 'package-lock.json', 'manifest'])
const TEXT_EXTENSIONS = new Set(['.json', '.ts', '.tsx', '.vue', '.html', '.md', '.css', '.js', '.svg'])
const SLUG_RE = /^[a-z0-9][a-z0-9-]*$/

function json(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(body))
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolveBody) => {
    let body = ''
    req.on('data', (chunk: Buffer) => {
      body += chunk.toString()
    })
    req.on('end', () => resolveBody(body))
  })
}

function readPdkJson(dir: string): Record<string, unknown> | null {
  const path = join(dir, 'pdk.json')
  if (!existsSync(path)) return null
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch {
    return null
  }
}

function usedPorts(): Set<number> {
  const used = new Set<number>([5170])
  if (!existsSync(prototypesDir)) return used
  for (const entry of readdirSync(prototypesDir)) {
    const pdk = readPdkJson(join(prototypesDir, entry))
    const port = Number(pdk?.defaultPort)
    if (Number.isInteger(port)) used.add(port)
  }
  return used
}

function nextFreePort(): number {
  const used = usedPorts()
  let port = 5171
  while (used.has(port)) port++
  return port
}

/** Recursively copy, excluding heavy dirs, replacing placeholder tokens in text files. */
function copyWithTokens(
  srcDir: string,
  destDir: string,
  tokens: Record<string, string>,
): void {
  cpSync(srcDir, destDir, {
    recursive: true,
    filter: (src) => {
      const base = src.split('/').pop() ?? ''
      return !COPY_EXCLUDES.has(base)
    },
  })
  // Second pass: token replacement in text files.
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name)
      if (entry.isDirectory()) {
        walk(full)
      } else if (TEXT_EXTENSIONS.has(extname(entry.name))) {
        let content = readFileSync(full, 'utf8')
        // Quoted port first so JSON keeps a numeric value.
        content = content.replaceAll('"PROTOTYPE_PORT"', tokens.PROTOTYPE_PORT)
        for (const [token, value] of Object.entries(tokens)) {
          content = content.replaceAll(token, value)
        }
        writeFileSync(full, content)
      }
    }
  }
  walk(destDir)
}

function titleFromSlug(slug: string): string {
  return slug
    .split('-')
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(' ')
}

export function serveTooling(): Plugin {
  const sources: Record<string, string> = {
    '/pdk-prelude.js': join(repoRoot, 'tooling', 'pdk-prelude.js'),
    '/pdk-tools.js': join(repoRoot, 'pdk-core', 'dist', 'tooling', 'pdk-tools.js'),
  }
  return {
    name: 'pdk-serve-tooling',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/tooling', (req, res, next) => {
        const path = sources[(req.url ?? '').split('?')[0]]
        if (!path) return next()
        res.setHeader('Access-Control-Allow-Origin', '*')
        if (!existsSync(path)) {
          res.statusCode = 404
          res.setHeader('Content-Type', 'application/javascript')
          res.end(
            `console.warn('[pdk] ${req.url} is not built yet - run: npm run build:tools');`,
          )
          return
        }
        res.setHeader('Content-Type', 'application/javascript')
        res.end(readFileSync(path))
      })
    },
  }
}

export function prototypesApi(): Plugin {
  return {
    name: 'pdk-prototypes-api',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__api/prototypes', (req, res) => {
        if (req.method !== 'GET') return json(res, 405, { error: 'Method not allowed' })
        const list = existsSync(prototypesDir)
          ? readdirSync(prototypesDir, { withFileTypes: true })
              .filter((e) => e.isDirectory())
              .map((e) => {
                const pdk = readPdkJson(join(prototypesDir, e.name))
                return pdk ? { folder: e.name, ...pdk } : null
              })
              .filter((p): p is NonNullable<typeof p> => p !== null)
          : []
        json(res, 200, { prototypes: list })
      })

      server.middlewares.use('/__api/stacks', (req, res) => {
        if (req.method !== 'GET') return json(res, 405, { error: 'Method not allowed' })
        const stacks = readdirSync(stackTemplatesDir, { withFileTypes: true })
          .filter((e) => e.isDirectory())
          .map((e) => {
            const pdk = readPdkJson(join(stackTemplatesDir, e.name))
            return pdk
              ? {
                  name: e.name,
                  framework: pdk.framework ?? 'unknown',
                  library: pdk.library ?? 'unknown',
                  hasManifest: existsSync(join(stackTemplatesDir, e.name, 'manifest')),
                  productRepo: (() => {
                    try {
                      const product = linkedRepos(join(stackTemplatesDir, e.name)).find(
                        (r) => r.role === 'product',
                      )
                      return product ? { path: product.path, appDir: product.appDir } : undefined
                    } catch {
                      return undefined
                    }
                  })(),
                }
              : null
          })
          .filter((s): s is NonNullable<typeof s> => s !== null)
        json(res, 200, { stacks })
      })

      server.middlewares.use('/__api/create-prototype', async (req, res) => {
        if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' })
        try {
          const { stack, name, description, author } = JSON.parse(await readBody(req)) as {
            stack: string
            name: string
            description?: string
            author?: string
          }
          if (!SLUG_RE.test(name ?? '')) {
            return json(res, 400, {
              error: 'Name must be kebab-case: lowercase letters, digits, and dashes.',
            })
          }
          const templateDir = join(stackTemplatesDir, stack ?? '')
          if (!existsSync(templateDir)) {
            return json(res, 400, { error: `Stack template "${stack}" not found.` })
          }
          const targetDir = join(prototypesDir, name)
          if (existsSync(targetDir)) {
            return json(res, 409, { error: `A prototype named "${name}" already exists.` })
          }

          const port = nextFreePort()
          copyWithTokens(templateDir, targetDir, {
            PROTOTYPE_TITLE: titleFromSlug(name),
            PROTOTYPE_SLUG: name,
            PROTOTYPE_DESCRIPTION: description?.trim() || `Prototype scaffolded from ${stack}.`,
            PROTOTYPE_AUTHOR: author?.trim() || 'unknown',
            PROTOTYPE_PORT: String(port),
          })

          // Stamp identity the tokens can't express.
          const pdkPath = join(targetDir, 'pdk.json')
          const pdk = JSON.parse(readFileSync(pdkPath, 'utf8'))
          pdk.stack = stack
          pdk.created = new Date().toISOString().slice(0, 10)
          writeFileSync(pdkPath, JSON.stringify(pdk, null, 2) + '\n')

          json(res, 201, { slug: name, port })
        } catch (e) {
          json(res, 500, { error: e instanceof Error ? e.message : 'Unknown error' })
        }
      })

      server.middlewares.use('/__api/remix-prototype', async (req, res) => {
        if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' })
        try {
          const { source, name, author } = JSON.parse(await readBody(req)) as {
            source: string
            name: string
            author?: string
          }
          if (!SLUG_RE.test(name ?? '')) {
            return json(res, 400, {
              error: 'Name must be kebab-case: lowercase letters, digits, and dashes.',
            })
          }
          const sourceDir = join(prototypesDir, source ?? '')
          const sourcePdk = readPdkJson(sourceDir)
          if (!sourcePdk) {
            return json(res, 400, { error: `Source prototype "${source}" not found.` })
          }
          const targetDir = join(prototypesDir, name)
          if (existsSync(targetDir)) {
            return json(res, 409, { error: `A prototype named "${name}" already exists.` })
          }

          const port = nextFreePort()
          const oldPort = Number(sourcePdk.defaultPort)
          copyWithTokens(sourceDir, targetDir, {})

          const pdkPath = join(targetDir, 'pdk.json')
          const pdk = JSON.parse(readFileSync(pdkPath, 'utf8'))
          pdk.title = titleFromSlug(name)
          pdk.slug = name
          pdk.author = author?.trim() || pdk.author
          pdk.parent = source
          pdk.created = new Date().toISOString().slice(0, 10)
          pdk.defaultPort = port
          pdk.status = 'draft'
          writeFileSync(pdkPath, JSON.stringify(pdk, null, 2) + '\n')

          const pkgPath = join(targetDir, 'package.json')
          if (existsSync(pkgPath)) {
            const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'))
            pkg.name = `pdk-prototype-${name}`
            for (const script of ['dev', 'preview']) {
              if (typeof pkg.scripts?.[script] === 'string' && Number.isInteger(oldPort)) {
                pkg.scripts[script] = pkg.scripts[script].replaceAll(String(oldPort), String(port))
              }
            }
            writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n')
          }

          json(res, 201, { slug: name, port })
        } catch (e) {
          json(res, 500, { error: e instanceof Error ? e.message : 'Unknown error' })
        }
      })

      server.middlewares.use('/__api/screens', (req, res) => {
        if (req.method !== 'GET') return json(res, 405, { error: 'Method not allowed' })
        const screens: Array<Record<string, unknown>> = []
        let sawProductRepo = false
        let sawMissingPath = false
        for (const entry of readdirSync(stackTemplatesDir, { withFileTypes: true })) {
          if (!entry.isDirectory()) continue
          let repos
          try {
            repos = linkedRepos(join(stackTemplatesDir, entry.name))
          } catch {
            continue
          }
          for (const repo of repos.filter((r) => r.role === 'product')) {
            sawProductRepo = true
            if (!existsSync(join(repo.path, repo.appDir))) {
              sawMissingPath = true
              continue
            }
            for (const screen of listScreens(repo.path, repo.appDir)) {
              screens.push({
                repoPath: repo.path,
                appDir: repo.appDir,
                file: screen.file,
                name: screen.name,
                stack: entry.name,
              })
            }
          }
        }
        const reason =
          screens.length > 0
            ? undefined
            : !sawProductRepo
              ? 'no-linked-product-repo'
              : sawMissingPath
                ? 'linked-repo-missing'
                : undefined
        json(res, 200, { screens, reason })
      })

      server.middlewares.use('/__api/requests', async (req, res) => {
        try {
          if (req.method === 'GET') {
            return json(res, 200, { requests: listRequests(repoRoot) })
          }
          if (req.method === 'POST') {
            const body = JSON.parse(await readBody(req))
            const validShape =
              (body?.type === 'import-screen' &&
                body.screen?.repoPath &&
                body.screen?.file &&
                body.screen?.title &&
                body.screen?.stack) ||
              (body?.type === 'handoff' && body.handoff?.slug && body.handoff?.targetRepo)
            if (!validShape) {
              return json(res, 400, {
                error: 'Request needs type import-screen (with screen) or handoff (with handoff).',
              })
            }
            const checkPath =
              body.type === 'import-screen'
                ? join(body.screen.repoPath, body.screen.appDir ?? '.')
                : body.handoff.targetRepo
            if (!existsSync(checkPath)) {
              return json(res, 422, {
                error: `That path no longer exists on this machine: ${checkPath}. Re-link the repo or correct the path.`,
              })
            }
            return json(res, 201, {
              request: addRequest(repoRoot, {
                type: body.type,
                screen: body.type === 'import-screen' ? body.screen : undefined,
                handoff: body.type === 'handoff' ? body.handoff : undefined,
              }),
            })
          }
          if (req.method === 'PATCH') {
            const id = (req.url ?? '').split('?')[0].replace(/^\//, '')
            if (!id) return json(res, 400, { error: 'PATCH /__api/requests/<id>' })
            const patch = JSON.parse(await readBody(req))
            if (patch.status && !['pending', 'in-progress', 'done', 'failed'].includes(patch.status)) {
              return json(res, 422, { error: `Invalid ticket status '${patch.status}'.` })
            }
            try {
              return json(res, 200, {
                request: updateRequest(repoRoot, id, { status: patch.status, note: patch.note }),
              })
            } catch (e) {
              return json(res, 404, { error: (e as Error).message })
            }
          }
          return json(res, 405, { error: 'Method not allowed' })
        } catch (e) {
          return json(res, 500, { error: e instanceof Error ? e.message : 'Unknown error' })
        }
      })

      server.middlewares.use('/__api/update-status', async (req, res) => {
        if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' })
        try {
          const { slug, status } = JSON.parse(await readBody(req))
          updatePrototypeStatus(repoRoot, slug ?? '', status ?? '')
          return json(res, 200, { ok: true })
        } catch (e) {
          const message = e instanceof Error ? e.message : 'Unknown error'
          const code = message.includes('Unknown prototype')
            ? 404
            : message.includes('Invalid status')
              ? 422
              : 500
          return json(res, code, { error: message })
        }
      })
    },
  }
}
