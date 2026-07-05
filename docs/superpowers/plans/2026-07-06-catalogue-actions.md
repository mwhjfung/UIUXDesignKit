# Catalogue Actions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Catalogue buttons for start-from-scratch / start-from-existing-screen / hand-over, backed by a git-ignored request queue ("order tickets") that a new `/orders` skill drains, plus a status lifecycle (draft → ready-for-dev → handed-off) editable from each card.

**Architecture:** Queue CRUD + status updates + screen discovery live as tested functions in `@pdk/core` (new `./requests` subpath + one addition to `link.ts`); `catalogue/vite-plugins.ts` exposes them as thin HTTP endpoints; the Vue catalogue grows a two-mode create modal, a status menu, a Hand-over modal, and ticket chips; the `/orders` skill processes tickets and the handoff skill gains a `handoff/<slug>` branch step.

**Tech Stack:** TypeScript (Node ≥20, ESM), vitest, Vue 3 `<script setup>` + Tailwind (existing catalogue idiom), lucide-vue-next icons.

## Global Constraints

- Public white-label repo: no organisation-specific content.
- Skills stay thin wrappers over vitest-covered TS; engine logic goes in pdk-core, not vite-plugins.ts or Vue files.
- Node built-ins only in pdk-core engine code.
- Queue file: `.pdk/requests.json` at the kit root, git-ignored (`.pdk/` added to root `.gitignore`).
- Allowed prototype statuses (exact set): `draft`, `in-review`, `ready-for-dev`, `handed-off`, `experimental`, `validated`, `merged`, `archived`. The card menu shows the lifecycle five: draft, in-review, ready-for-dev, handed-off, archived.
- Ticket lifecycle (exact strings): `pending` → `in-progress` → `done` | `failed`. Tickets are never deleted by code; `/orders` never processes a non-pending ticket.
- Mock-only boundary is untouched: nothing in this feature wires prototypes to live data.
- Catalogue visual idiom: Tailwind utility classes matching the existing files (rounded-md, border-border, text-sm, hover:bg-accent); icons from lucide-vue-next.
- Run commands from repo root `/Users/mfungy/Documents/RobotStuff/PersonalAI/UIUXDesignKit` unless stated.

---

### Task 1: Request store + status updater (`@pdk/core/requests`)

**Files:**
- Create: `pdk-core/src/requests/store.ts`
- Modify: `pdk-core/package.json` (add `./requests` to `exports`)
- Modify: `.gitignore` (root — add `.pdk/` under a new comment)
- Test: `pdk-core/tests/requests/store.test.ts`

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces (later tasks rely on these exact names):
  ```ts
  export type RequestType = 'import-screen' | 'handoff'
  export type RequestStatus = 'pending' | 'in-progress' | 'done' | 'failed'
  export interface ImportScreenPayload { repoPath: string; appDir: string; file: string; title: string; stack: string }
  export interface HandoffPayload { slug: string; targetRepo: string; targetSubdir?: string }
  export interface CatalogueRequest {
    id: string; type: RequestType; status: RequestStatus
    createdAt: string; updatedAt: string; note?: string
    screen?: ImportScreenPayload; handoff?: HandoffPayload
  }
  export function listRequests(root: string): CatalogueRequest[]        // [] on missing; corrupt → rewrites [] + console.warn
  export function addRequest(root: string, partial: { type: RequestType; screen?: ImportScreenPayload; handoff?: HandoffPayload }): CatalogueRequest
  export function updateRequest(root: string, id: string, patch: { status?: RequestStatus; note?: string }): CatalogueRequest  // throws on unknown id
  export const ALLOWED_STATUSES: readonly string[]                       // the 8 statuses from Global Constraints
  export function updatePrototypeStatus(root: string, slug: string, status: string): void
  // throws Error containing 'Unknown prototype' when prototypes/<slug>/pdk.json missing,
  // 'Invalid status' when status not in ALLOWED_STATUSES
  ```

- [ ] **Step 1: Write the failing tests**

Create `pdk-core/tests/requests/store.test.ts`:
```ts
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  addRequest,
  ALLOWED_STATUSES,
  listRequests,
  updatePrototypeStatus,
  updateRequest,
} from '../../src/requests/store.js'

let root: string
afterEach(() => {
  if (root) rmSync(root, { recursive: true, force: true })
})

function makeRoot(): string {
  return mkdtempSync(join(tmpdir(), 'pdk-req-'))
}

describe('request store', () => {
  it('returns [] when the queue file does not exist', () => {
    root = makeRoot()
    expect(listRequests(root)).toEqual([])
  })

  it('add → list → update round-trip persists to .pdk/requests.json', () => {
    root = makeRoot()
    const created = addRequest(root, {
      type: 'handoff',
      handoff: { slug: 'tasks', targetRepo: '/tmp/flywheel' },
    })
    expect(created.status).toBe('pending')
    expect(created.id).toMatch(/[0-9a-f-]{36}/)

    const listed = listRequests(root)
    expect(listed).toHaveLength(1)
    expect(listed[0].handoff?.slug).toBe('tasks')

    const updated = updateRequest(root, created.id, { status: 'failed', note: 'target repo dirty' })
    expect(updated.status).toBe('failed')
    expect(updated.note).toBe('target repo dirty')
    expect(updated.updatedAt >= created.updatedAt).toBe(true)
    expect(listRequests(root)[0].status).toBe('failed')
    expect(existsSync(join(root, '.pdk', 'requests.json'))).toBe(true)
  })

  it('rebuilds an empty queue from a corrupt file with a warning', () => {
    root = makeRoot()
    mkdirSync(join(root, '.pdk'), { recursive: true })
    writeFileSync(join(root, '.pdk', 'requests.json'), '{not json')
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(listRequests(root)).toEqual([])
    expect(warn).toHaveBeenCalledOnce()
    expect(readFileSync(join(root, '.pdk', 'requests.json'), 'utf8').trim()).toBe('[]')
    warn.mockRestore()
  })

  it('updateRequest throws on unknown id', () => {
    root = makeRoot()
    expect(() => updateRequest(root, 'nope', { status: 'done' })).toThrow(/nope/)
  })
})

describe('updatePrototypeStatus', () => {
  it('rewrites pdk.json status for a valid transition', () => {
    root = makeRoot()
    const proto = join(root, 'prototypes', 'tasks')
    mkdirSync(proto, { recursive: true })
    writeFileSync(join(proto, 'pdk.json'), JSON.stringify({ slug: 'tasks', status: 'draft' }, null, 2))
    updatePrototypeStatus(root, 'tasks', 'ready-for-dev')
    expect(JSON.parse(readFileSync(join(proto, 'pdk.json'), 'utf8')).status).toBe('ready-for-dev')
  })

  it('rejects unknown statuses and unknown slugs', () => {
    root = makeRoot()
    expect(ALLOWED_STATUSES).toContain('ready-for-dev')
    expect(() => updatePrototypeStatus(root, 'ghost', 'draft')).toThrow(/Unknown prototype/)
    const proto = join(root, 'prototypes', 'tasks')
    mkdirSync(proto, { recursive: true })
    writeFileSync(join(proto, 'pdk.json'), '{"slug":"tasks","status":"draft"}')
    expect(() => updatePrototypeStatus(root, 'tasks', 'shipped')).toThrow(/Invalid status/)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd pdk-core && npx vitest run tests/requests/store.test.ts`
Expected: FAIL — cannot find module `../../src/requests/store.js`

- [ ] **Step 3: Implement the store**

Create `pdk-core/src/requests/store.ts`:
```ts
/**
 * Catalogue request queue ("order tickets") + prototype status updates.
 *
 * Buttons in the catalogue file requests here; the /orders skill drains
 * them. State lives in .pdk/requests.json at the kit root — per-device,
 * git-ignored working state (like Markup annotations, not code).
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'

export type RequestType = 'import-screen' | 'handoff'
export type RequestStatus = 'pending' | 'in-progress' | 'done' | 'failed'

export interface ImportScreenPayload {
  repoPath: string
  appDir: string
  file: string
  title: string
  stack: string
}

export interface HandoffPayload {
  slug: string
  targetRepo: string
  targetSubdir?: string
}

export interface CatalogueRequest {
  id: string
  type: RequestType
  status: RequestStatus
  createdAt: string
  updatedAt: string
  note?: string
  screen?: ImportScreenPayload
  handoff?: HandoffPayload
}

function queuePath(root: string): string {
  return join(root, '.pdk', 'requests.json')
}

function writeQueue(root: string, requests: CatalogueRequest[]): void {
  mkdirSync(join(root, '.pdk'), { recursive: true })
  writeFileSync(queuePath(root), JSON.stringify(requests, null, 2) + '\n')
}

export function listRequests(root: string): CatalogueRequest[] {
  const path = queuePath(root)
  if (!existsSync(path)) return []
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8'))
    return Array.isArray(parsed) ? parsed : []
  } catch {
    console.warn(`[pdk] ${path} was corrupt — rebuilt as an empty queue.`)
    writeQueue(root, [])
    return []
  }
}

export function addRequest(
  root: string,
  partial: { type: RequestType; screen?: ImportScreenPayload; handoff?: HandoffPayload },
): CatalogueRequest {
  const now = new Date().toISOString()
  const request: CatalogueRequest = {
    id: randomUUID(),
    status: 'pending',
    createdAt: now,
    updatedAt: now,
    ...partial,
  }
  writeQueue(root, [...listRequests(root), request])
  return request
}

export function updateRequest(
  root: string,
  id: string,
  patch: { status?: RequestStatus; note?: string },
): CatalogueRequest {
  const requests = listRequests(root)
  const index = requests.findIndex((r) => r.id === id)
  if (index === -1) throw new Error(`No request with id '${id}'.`)
  requests[index] = { ...requests[index], ...patch, updatedAt: new Date().toISOString() }
  writeQueue(root, requests)
  return requests[index]
}

export const ALLOWED_STATUSES = [
  'draft',
  'in-review',
  'ready-for-dev',
  'handed-off',
  'experimental',
  'validated',
  'merged',
  'archived',
] as const

export function updatePrototypeStatus(root: string, slug: string, status: string): void {
  if (!(ALLOWED_STATUSES as readonly string[]).includes(status)) {
    throw new Error(`Invalid status '${status}'. Allowed: ${ALLOWED_STATUSES.join(', ')}.`)
  }
  const pdkPath = join(root, 'prototypes', slug, 'pdk.json')
  if (!existsSync(pdkPath)) {
    throw new Error(`Unknown prototype '${slug}' (${pdkPath} not found).`)
  }
  const pdk = JSON.parse(readFileSync(pdkPath, 'utf8'))
  pdk.status = status
  writeFileSync(pdkPath, JSON.stringify(pdk, null, 2) + '\n')
}
```

- [ ] **Step 4: Wire the subpath export and gitignore**

In `pdk-core/package.json`, the `exports` map currently has `./manifest` and `./vite` entries pointing at dist. Add alongside them (same shape — types + default keys):
```json
    "./requests": {
      "types": "./dist/requests/store.d.ts",
      "default": "./dist/requests/store.js"
    }
```

In root `.gitignore`, append:
```
# Catalogue request queue — per-device working state (order tickets)
.pdk/
```

- [ ] **Step 5: Run tests + build**

Run: `cd pdk-core && npx vitest run tests/requests/store.test.ts` → 6 tests PASS.
Run: `cd .. && npm test -w @pdk/core && npm run build:core` → full suite green (87 existing + 6 new = 93), build clean, `pdk-core/dist/requests/store.js` exists.

- [ ] **Step 6: Commit**

```bash
git add pdk-core/src/requests pdk-core/tests/requests pdk-core/package.json .gitignore
git commit -m "feat(requests): order-ticket queue store + prototype status updater

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: `listScreens()` in link.ts

**Files:**
- Modify: `pdk-core/src/manifest/link.ts` (new export; `SCREEN_DIRS` is defined at line ~49)
- Modify: `pdk-core/src/manifest/index.ts` (re-export)
- Test: `pdk-core/tests/manifest/link.test.ts` (append)

**Interfaces:**
- Consumes: existing `SCREEN_DIRS` const in link.ts.
- Produces:
  ```ts
  export interface ScreenEntry { file: string; name: string }  // file relative to appDir
  export function listScreens(repoPath: string, appDir?: string): ScreenEntry[]  // appDir default '.'
  ```
  Name derivation: basename minus extension, camelCase/kebab/underscore boundaries split, title-cased, a trailing word "Page"/"View"/"Screen" dropped (e.g. `TasksPage.tsx` → "Tasks", `user-settings.vue` → "User Settings").

- [ ] **Step 1: Write the failing tests**

Append to `pdk-core/tests/manifest/link.test.ts` (module level; `FIXTURES`, `join` already exist there):
```ts
import { listScreens } from '../../src/manifest/link.js'

describe('listScreens', () => {
  it('finds screens in a product repo and humanises names', () => {
    const screens = listScreens(join(FIXTURES, 'vendored-app'))
    expect(screens).toEqual([{ file: 'src/pages/Tasks.tsx', name: 'Tasks' }])
  })

  it('returns [] for a design-system repo with no screen dirs', () => {
    expect(listScreens(join(FIXTURES, 'ds-repo'))).toEqual([])
  })

  it('respects appDir in a monorepo', () => {
    const screens = listScreens(join(FIXTURES, 'monorepo'), 'apps/web')
    expect(screens).toEqual([{ file: 'src/pages/Home.tsx', name: 'Home' }])
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `cd pdk-core && npx vitest run tests/manifest/link.test.ts`
Expected: FAIL — `listScreens` is not exported.

- [ ] **Step 3: Implement**

Add to `pdk-core/src/manifest/link.ts` (after `inspectRepo`; `readdirSync`, `statSync`, `existsSync`, `join`, `relative`, `resolve` are already imported):
```ts
export interface ScreenEntry {
  file: string
  name: string
}

const SCREEN_FILE_RE = /\.(tsx|jsx|vue)$/
const SCREEN_NAME_SUFFIXES = /\s+(page|view|screen)$/i

function humaniseScreenName(filename: string): string {
  const base = filename.replace(/\.[^.]+$/, '')
  const words = base
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[-_]+/g, ' ')
    .trim()
    .split(/\s+/)
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(' ')
  return words.replace(SCREEN_NAME_SUFFIXES, '') || base
}

/** List candidate screens in a (product) repo's screen directories. */
export function listScreens(repoPath: string, appDir = '.'): ScreenEntry[] {
  const base = join(resolve(repoPath), appDir)
  const screens: ScreenEntry[] = []
  const walkScreens = (dir: string, depth: number): void => {
    if (depth > 3 || !existsSync(dir)) return
    for (const entry of readdirSync(dir)) {
      if (entry === 'node_modules' || entry.startsWith('.') || entry.startsWith('_')) continue
      const full = join(dir, entry)
      if (statSync(full).isDirectory()) walkScreens(full, depth + 1)
      else if (SCREEN_FILE_RE.test(entry)) {
        screens.push({ file: relative(base, full), name: humaniseScreenName(entry) })
      }
    }
  }
  for (const dir of SCREEN_DIRS) walkScreens(join(base, dir), 0)
  return screens.sort((a, b) => a.name.localeCompare(b.name))
}
```

Add to `pdk-core/src/manifest/index.ts` link re-exports: `listScreens` in the value list, `ScreenEntry` in the type list.

- [ ] **Step 4: Run tests + build**

Run: `cd pdk-core && npx vitest run tests/manifest/link.test.ts` → all pass (3 new on top of the existing count).
Run: `cd .. && npm test -w @pdk/core && npm run build:core` → green, clean.

- [ ] **Step 5: Commit**

```bash
git add pdk-core/src/manifest/link.ts pdk-core/src/manifest/index.ts pdk-core/tests/manifest/link.test.ts
git commit -m "feat(link): listScreens — enumerate candidate screens in linked repos

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: Catalogue HTTP endpoints

**Files:**
- Modify: `catalogue/vite-plugins.ts` (extend `prototypesApi()`; update the header-comment endpoint list)
- Modify: `catalogue/package.json` (ensure `"@pdk/core": "file:../pdk-core"` in devDependencies; add only if absent)

**Interfaces:**
- Consumes: Task 1 store (`listRequests`, `addRequest`, `updateRequest`, `updatePrototypeStatus` from `@pdk/core/requests`), Task 2 `listScreens` + existing `linkedRepos` (from `@pdk/core/manifest`).
- Produces HTTP contract for Tasks 4–5:
  - `GET  /__api/screens` → `{ screens: Array<{ repoPath, appDir, file, name, stack }>, reason?: string }` (reason set when empty: `no-linked-product-repo` | `linked-repo-missing`)
  - `GET  /__api/requests` → `{ requests: CatalogueRequest[] }`
  - `POST /__api/requests` body `{ type, screen?, handoff? }` → 201 `{ request }`; 400 on bad shape
  - `PATCH /__api/requests/<id>` body `{ status?, note? }` → 200 `{ request }`; 404 unknown id
  - `POST /__api/update-status` body `{ slug, status }` → 200 `{ ok: true }`; 404 'Unknown prototype'; 422 'Invalid status'
  - `GET /__api/stacks` gains per-stack `productRepo?: { path: string; appDir: string }` (first `linkedRepos` entry with role 'product')

- [ ] **Step 1: Wire dependency + imports**

Check `catalogue/package.json`: if `@pdk/core` is not in dependencies/devDependencies, add `"@pdk/core": "file:../pdk-core"` to devDependencies and run `npm install` at repo root.

Add imports at the top of `catalogue/vite-plugins.ts`:
```ts
import { linkedRepos, listScreens } from '@pdk/core/manifest'
import {
  addRequest,
  listRequests,
  updatePrototypeStatus,
  updateRequest,
} from '@pdk/core/requests'
```
(The vite config loader resolves these from `pdk-core/dist`, which `npm run dev` builds first via `build:core`.)

- [ ] **Step 2: Extend the stacks endpoint**

In the `/__api/stacks` handler's mapped object, add after `hasManifest`:
```ts
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
```

- [ ] **Step 3: Add the four new endpoints**

Inside `prototypesApi()`'s `configureServer`, after the remix handler, add:
```ts
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
            return json(res, 201, {
              request: addRequest(repoRoot, { type: body.type, screen: body.screen, handoff: body.handoff }),
            })
          }
          if (req.method === 'PATCH') {
            const id = (req.url ?? '').split('?')[0].replace(/^\//, '')
            if (!id) return json(res, 400, { error: 'PATCH /__api/requests/<id>' })
            const patch = JSON.parse(await readBody(req))
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
```

Update the file's header comment endpoint list to include the four new routes.

- [ ] **Step 4: Verify with a live round-trip**

Run `npm run build:core`, then start the dev server in the background and curl:
```bash
curl -s localhost:5170/__api/screens; echo
curl -s -X POST localhost:5170/__api/requests -H 'Content-Type: application/json' -d '{"type":"handoff","handoff":{"slug":"example-tasks","targetRepo":"/tmp/x"}}'
curl -s localhost:5170/__api/requests
# use the id from the create response:
curl -s -X PATCH localhost:5170/__api/requests/<id> -H 'Content-Type: application/json' -d '{"status":"failed","note":"test"}'
curl -s -X POST localhost:5170/__api/update-status -H 'Content-Type: application/json' -d '{"slug":"example-tasks","status":"ready-for-dev"}'
curl -s -X POST localhost:5170/__api/update-status -H 'Content-Type: application/json' -d '{"slug":"example-tasks","status":"bogus"}'
```
Expected: screens 200 with reason `no-linked-product-repo` (this kit has no linked repos); create 201; list shows it; PATCH 200 with failed/test; update-status 200 then 422. **Afterwards restore state:** `git checkout prototypes/example-tasks/pdk.json`, `rm -rf .pdk`, kill the dev server.

- [ ] **Step 5: Commit**

```bash
git add catalogue/vite-plugins.ts catalogue/package.json package-lock.json
git commit -m "feat(catalogue): screens/requests/update-status endpoints + productRepo on stacks

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: Catalogue UI

**Files:**
- Modify: `catalogue/src/types.ts` (new types)
- Modify: `catalogue/src/CreatePrototypeModal.vue` (two-mode chooser)
- Modify: `catalogue/src/PrototypeCard.vue` (status menu, Hand over, ticket chip)
- Create: `catalogue/src/HandoverModal.vue`
- Modify: `catalogue/src/CataloguePage.vue` (wiring, request polling, pending-imports strip)

**Interfaces:**
- Consumes: Task 3 HTTP contract exactly as specified.
- Produces: user-visible behavior only. Status menu options (exact list + labels): `draft` "Draft", `in-review` "In review", `ready-for-dev` "Ready for dev", `handed-off` "Handed off", `archived` "Archived".

- [ ] **Step 1: types.ts additions**

Append to `catalogue/src/types.ts`:
```ts
export interface ScreenOption {
  repoPath: string
  appDir: string
  file: string
  name: string
  stack: string
}

export interface CatalogueRequest {
  id: string
  type: 'import-screen' | 'handoff'
  status: 'pending' | 'in-progress' | 'done' | 'failed'
  createdAt: string
  updatedAt: string
  note?: string
  screen?: { repoPath: string; appDir: string; file: string; title: string; stack: string }
  handoff?: { slug: string; targetRepo: string; targetSubdir?: string }
}
```
And extend `StackInfo` with `productRepo?: { path: string; appDir: string }`.

- [ ] **Step 2: CreatePrototypeModal — two modes**

Keep the modal shell and the existing scratch flow; add a mode toggle and a screen mode that files an import ticket. Replace the script block with:
```ts
import { X } from 'lucide-vue-next'
import { computed, onMounted, ref } from 'vue'
import type { ScreenOption, StackInfo } from './types'

const props = defineProps<{ stacks: StackInfo[] }>()
const emit = defineEmits<{ close: []; created: [slug: string]; queued: [] }>()

const mode = ref<'scratch' | 'screen'>('scratch')
const name = ref('')
const description = ref('')
const author = ref(localStorage.getItem('pdk-author') ?? '')
const stack = ref(props.stacks.find((s) => s.name === 'react-shadcn')?.name ?? props.stacks[0]?.name ?? '')
const busy = ref(false)
const error = ref('')

const screens = ref<ScreenOption[]>([])
const screensReason = ref<string | undefined>()
const selectedScreen = ref<ScreenOption | null>(null)
const screenTitle = ref('')

const slugValid = computed(() => /^[a-z0-9][a-z0-9-]*$/.test(name.value))
const screensAvailable = computed(() => screens.value.length > 0)
const screensHint = computed(() =>
  screensReason.value === 'no-linked-product-repo'
    ? 'No product codebase is linked yet — run /link-repo in Claude Code first.'
    : screensReason.value === 'linked-repo-missing'
      ? 'The linked codebase folder was not found at its stored path.'
      : 'No screens found in the linked codebase.',
)

onMounted(async () => {
  try {
    const body = await (await fetch('/__api/screens')).json()
    screens.value = body.screens ?? []
    screensReason.value = body.reason
  } catch {
    screensReason.value = 'no-linked-product-repo'
  }
})

async function create(): Promise<void> {
  if (!slugValid.value || !stack.value) return
  busy.value = true
  error.value = ''
  try {
    const res = await fetch('/__api/create-prototype', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stack: stack.value, name: name.value, description: description.value, author: author.value }),
    })
    const body = await res.json()
    if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`)
    localStorage.setItem('pdk-author', author.value)
    emit('created', body.slug)
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to create prototype.'
  } finally {
    busy.value = false
  }
}

async function queueImport(): Promise<void> {
  if (!selectedScreen.value || !screenTitle.value.trim()) return
  busy.value = true
  error.value = ''
  try {
    const s = selectedScreen.value
    const res = await fetch('/__api/requests', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'import-screen',
        screen: { repoPath: s.repoPath, appDir: s.appDir, file: s.file, title: screenTitle.value.trim(), stack: s.stack },
      }),
    })
    const body = await res.json()
    if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`)
    emit('queued')
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to queue the import.'
  } finally {
    busy.value = false
  }
}
```

Template: directly under the heading row add the mode toggle:
```html
      <div class="mb-4 grid grid-cols-2 gap-1 rounded-md border border-border p-1 text-sm">
        <button
          class="rounded px-3 py-1.5"
          :class="mode === 'scratch' ? 'bg-primary text-primary-foreground' : 'hover:bg-accent'"
          @click="mode = 'scratch'"
        >
          Start from scratch
        </button>
        <button
          class="rounded px-3 py-1.5 disabled:opacity-50"
          :class="mode === 'screen' ? 'bg-primary text-primary-foreground' : 'hover:bg-accent'"
          :disabled="!screensAvailable"
          :title="screensAvailable ? '' : screensHint"
          @click="mode = 'screen'"
        >
          From existing screen
        </button>
      </div>
      <p v-if="!screensAvailable" class="text-xs text-muted-foreground -mt-2 mb-3">{{ screensHint }}</p>
```
Wrap the existing form fields in `<div v-if="mode === 'scratch'" class="space-y-4">…</div>` (unchanged content), and add the screen branch:
```html
      <div v-else class="space-y-4">
        <label class="block">
          <span class="text-sm font-medium">Screen</span>
          <select
            v-model="selectedScreen"
            class="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
          >
            <option v-for="s in screens" :key="s.repoPath + s.file" :value="s">
              {{ s.name }} — {{ s.file }} ({{ s.stack }})
            </option>
          </select>
        </label>
        <label class="block">
          <span class="text-sm font-medium">Prototype title</span>
          <input
            v-model="screenTitle"
            :placeholder="selectedScreen?.name ? `${selectedScreen.name} redesign` : 'Title'"
            class="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
          />
        </label>
        <p class="text-xs text-muted-foreground">
          Files an order ticket — Claude Code imports the screen with safe pretend data
          (run <code>/orders</code> if it isn't already watching).
        </p>
        <p v-if="error" class="text-sm text-red-600">{{ error }}</p>
        <div class="flex justify-end gap-2 pt-2">
          <button class="rounded-md border border-border px-3 py-2 text-sm hover:bg-accent" @click="emit('close')">Cancel</button>
          <button
            class="rounded-md bg-primary text-primary-foreground px-3 py-2 text-sm disabled:opacity-50"
            :disabled="!selectedScreen || !screenTitle.trim() || busy"
            @click="queueImport"
          >
            {{ busy ? 'Queuing…' : 'Queue import' }}
          </button>
        </div>
      </div>
```

- [ ] **Step 3: PrototypeCard — status menu, Hand over, chip**

Modify `catalogue/src/PrototypeCard.vue`:
- Props gain `request?: CatalogueRequest` (import the type from './types'). Emits become `{ remix: []; handover: []; status: [status: string]; retry: [id: string] }`.
- Script additions:
```ts
const statusMenuOpen = ref(false)
const LIFECYCLE: Array<{ value: string; label: string }> = [
  { value: 'draft', label: 'Draft' },
  { value: 'in-review', label: 'In review' },
  { value: 'ready-for-dev', label: 'Ready for dev' },
  { value: 'handed-off', label: 'Handed off' },
  { value: 'archived', label: 'Archived' },
]
```
- statusColor map gains: `'in-review': 'var(--status-experimental)', 'ready-for-dev': 'var(--status-validated)', 'handed-off': 'var(--status-merged)'`.
- Replace the status badge `<span class="ml-auto shrink-0 …">…</span>` with a relative wrapper + menu:
```html
      <div class="ml-auto shrink-0 relative">
        <button
          class="inline-flex items-center gap-1.5 rounded-full border border-border px-2 py-0.5 text-xs capitalize hover:bg-accent"
          @click="statusMenuOpen = !statusMenuOpen"
        >
          <span class="size-1.5 rounded-full" :style="{ background: statusColor }" />
          {{ prototype.status }}
        </button>
        <div
          v-if="statusMenuOpen"
          class="absolute right-0 top-full mt-1 z-10 w-36 rounded-md border border-border bg-background shadow-md py-1"
        >
          <button
            v-for="opt in LIFECYCLE"
            :key="opt.value"
            class="block w-full text-left px-3 py-1.5 text-xs hover:bg-accent"
            :class="{ 'font-semibold': prototype.status === opt.value }"
            @click="statusMenuOpen = false; $emit('status', opt.value)"
          >
            {{ opt.label }}
          </button>
        </div>
      </div>
```
- Ticket chip, inserted between the header div and the description `<p>`:
```html
    <p
      v-if="request && request.status !== 'done'"
      class="text-xs rounded-md border px-2 py-1 flex items-center gap-2"
      :class="request.status === 'failed' ? 'border-red-300 text-red-700' : 'border-border text-muted-foreground'"
    >
      <span v-if="request.status === 'pending'">Handoff queued — run /orders in Claude Code</span>
      <span v-else-if="request.status === 'in-progress'">Handoff in progress…</span>
      <span v-else>Handoff failed: {{ request.note ?? 'see Claude Code' }}</span>
      <button v-if="request.status === 'failed'" class="ml-auto underline" @click="$emit('retry', request.id)">
        Retry
      </button>
    </p>
```
- Actions row: add a Hand over button before Remix (import `Send` from lucide-vue-next) and move `ml-auto` from Remix to it:
```html
      <button
        class="inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-sm ml-auto"
        :class="
          prototype.status === 'ready-for-dev'
            ? 'bg-primary text-primary-foreground border-transparent hover:opacity-90'
            : 'border-border hover:bg-accent'
        "
        title="File a handoff order ticket for developers"
        @click="$emit('handover')"
      >
        <Send class="size-3.5" /> Hand over
      </button>
```

- [ ] **Step 4: HandoverModal**

Create `catalogue/src/HandoverModal.vue`:
```vue
<script setup lang="ts">
import { X } from 'lucide-vue-next'
import { computed, ref } from 'vue'
import type { PrototypeInfo, StackInfo } from './types'

const props = defineProps<{ prototype: PrototypeInfo; stacks: StackInfo[] }>()
const emit = defineEmits<{ close: []; queued: [] }>()

const linked = computed(
  () => props.stacks.find((s) => s.name === props.prototype.stack)?.productRepo ?? null,
)
const targetRepo = ref(linked.value?.path ?? '')
const targetSubdir = ref(`src/features/${props.prototype.slug}`)
const busy = ref(false)
const error = ref('')

async function queue(): Promise<void> {
  if (!targetRepo.value.trim()) return
  busy.value = true
  error.value = ''
  try {
    const res = await fetch('/__api/requests', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'handoff',
        handoff: {
          slug: props.prototype.folder,
          targetRepo: targetRepo.value.trim(),
          targetSubdir: targetSubdir.value.trim() || undefined,
        },
      }),
    })
    const body = await res.json()
    if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`)
    emit('queued')
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to queue the handoff.'
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" @click.self="emit('close')">
    <div class="w-full max-w-md rounded-lg bg-background border border-border p-6">
      <div class="flex items-center mb-4">
        <h2 class="font-semibold">Hand over "{{ prototype.title }}"</h2>
        <button class="ml-auto rounded p-1 hover:bg-accent" @click="emit('close')">
          <X class="size-4" />
        </button>
      </div>

      <div class="space-y-4">
        <p
          v-if="prototype.status !== 'ready-for-dev'"
          class="text-xs rounded-md border border-border px-2 py-1.5 text-muted-foreground"
        >
          Tip: mark it "Ready for dev" first so the team knows it's approved.
        </p>

        <label class="block">
          <span class="text-sm font-medium">Destination repo (absolute path)</span>
          <input
            v-model.trim="targetRepo"
            placeholder="/path/to/your/product-repo"
            class="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
          />
          <span v-if="linked" class="text-xs text-muted-foreground">Pre-filled from the linked codebase.</span>
        </label>

        <label class="block">
          <span class="text-sm font-medium">Subdirectory for the code</span>
          <input
            v-model.trim="targetSubdir"
            class="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
          />
        </label>

        <p class="text-xs text-muted-foreground">
          Files an order ticket. Claude Code exports the prototype onto a
          <code>handoff/{{ prototype.folder }}</code> branch in that repo with a
          HANDOFF.md checklist, then marks this card "Handed off".
        </p>

        <p v-if="error" class="text-sm text-red-600">{{ error }}</p>

        <div class="flex justify-end gap-2 pt-2">
          <button class="rounded-md border border-border px-3 py-2 text-sm hover:bg-accent" @click="emit('close')">
            Cancel
          </button>
          <button
            class="rounded-md bg-primary text-primary-foreground px-3 py-2 text-sm disabled:opacity-50"
            :disabled="!targetRepo.trim() || busy"
            @click="queue"
          >
            {{ busy ? 'Queuing…' : 'Queue handoff' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
```

- [ ] **Step 5: CataloguePage wiring**

Modify `catalogue/src/CataloguePage.vue`. Script additions (merge into the existing setup; keep existing refs/functions):
```ts
import HandoverModal from './HandoverModal.vue'
import type { CatalogueRequest } from './types'
import { onBeforeUnmount } from 'vue'

const requests = ref<CatalogueRequest[]>([])
const handoverSource = ref<PrototypeInfo | null>(null)
let pollTimer: ReturnType<typeof setInterval> | null = null

async function loadRequests(): Promise<void> {
  try {
    requests.value = (await (await fetch('/__api/requests')).json()).requests ?? []
  } catch {
    /* catalogue works without the queue */
  }
}

const pendingImports = computed(() =>
  requests.value.filter((r) => r.type === 'import-screen' && r.status !== 'done'),
)

function requestFor(folder: string): CatalogueRequest | undefined {
  return [...requests.value]
    .reverse()
    .find((r) => r.type === 'handoff' && r.handoff?.slug === folder && r.status !== 'done')
}

async function setStatus(proto: PrototypeInfo, status: string): Promise<void> {
  const res = await fetch('/__api/update-status', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ slug: proto.folder, status }),
  })
  if (res.ok) load()
  else error.value = (await res.json()).error ?? 'Failed to update status.'
}

async function retryRequest(id: string): Promise<void> {
  await fetch(`/__api/requests/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'pending' }),
  })
  loadRequests()
}

function onQueued(): void {
  showCreate.value = false
  handoverSource.value = null
  loadRequests()
}
```
Replace the existing `onMounted(load)` with:
```ts
onMounted(() => {
  load()
  loadRequests()
  pollTimer = setInterval(loadRequests, 5000)
})
onBeforeUnmount(() => {
  if (pollTimer) clearInterval(pollTimer)
})
```
Template additions:
- Pending-imports strip between the error `<p>` and the loading/grid block:
```html
      <div v-if="pendingImports.length" class="mb-4 space-y-2">
        <p
          v-for="r in pendingImports"
          :key="r.id"
          class="text-xs rounded-md border px-3 py-2 flex items-center gap-2"
          :class="r.status === 'failed' ? 'border-red-300 text-red-700' : 'border-border text-muted-foreground'"
        >
          <span v-if="r.status === 'pending'">
            Import "{{ r.screen?.title }}" queued — run <code>/orders</code> in Claude Code
          </span>
          <span v-else-if="r.status === 'in-progress'">Importing "{{ r.screen?.title }}"…</span>
          <span v-else>Import "{{ r.screen?.title }}" failed: {{ r.note ?? 'see Claude Code' }}</span>
          <button v-if="r.status === 'failed'" class="ml-auto underline" @click="retryRequest(r.id)">Retry</button>
        </p>
      </div>
```
- PrototypeCard bindings: add `:request="requestFor(proto.folder)"` `@handover="handoverSource = proto"` `@status="(s: string) => setStatus(proto, s)"` `@retry="retryRequest"`.
- CreatePrototypeModal gains `@queued="onQueued"`; after RemixModal add:
```html
    <HandoverModal
      v-if="handoverSource"
      :prototype="handoverSource"
      :stacks="stacks"
      @close="handoverSource = null"
      @queued="onQueued"
    />
```

- [ ] **Step 6: Verify in the browser**

`npm run dev`, open http://localhost:5170 and check: the create modal shows the two-mode toggle with "From existing screen" disabled + the no-linked-repo hint (this kit has no linked repos); the status badge opens the menu and picking "Ready for dev" updates the badge; Hand over opens the modal and queuing to `/tmp/x` shows the card chip "Handoff queued"; `curl -X PATCH …/{id} -d '{"status":"failed","note":"boom"}'` flips the chip to failed + Retry within 5s; Retry returns it to queued. Watch the vite console for compile errors. **Clean up:** flip the status back to draft via the menu (or `git checkout prototypes/example-tasks/pdk.json`), `rm -rf .pdk`, stop the server.

- [ ] **Step 7: Commit**

```bash
git add catalogue/src
git commit -m "feat(catalogue): create-mode chooser, status menu, handover modal, ticket chips

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: /orders skill, session hook, handoff branch step, docs

**Files:**
- Create: `.claude/skills/orders/SKILL.md`
- Modify: `.claude/settings.json` (SessionStart hook)
- Modify: `.claude/skills/handoff/SKILL.md` (branch + commit step)
- Modify: `README.md` ("Already have a product?" section gains a bullet)
- Modify: `CLAUDE.md` (repo map `.pdk/` line + orders mention in flow section)
- Modify: `docs/decisions.md` (new entry)

**Interfaces:**
- Consumes: Task 1 queue semantics, Task 3 endpoints, existing import-screen/handoff skills.
- Produces: the `/orders` operator loop; handoff branch contract `handoff/<slug>` (suffix `-2`, `-3`… when taken).

- [ ] **Step 1: Write `.claude/skills/orders/SKILL.md`**

```markdown
---
name: orders
description: >
  Process catalogue order tickets — requests filed from the catalogue UI
  (import a screen, hand off a prototype). Use when the user runs /orders,
  says "process the catalogue requests/orders", or a session-start note
  says orders are waiting.
metadata:
  version: "1.0"
  category: workflow
---

# Orders — drain the catalogue request queue

The catalogue's buttons file order tickets into `.pdk/requests.json` at the
kit root. This skill processes them so the button "just worked" from the
designer's point of view.

## Ground rules

- Process tickets **oldest first**, one at a time.
- Only touch `pending` tickets. Never re-run `in-progress`/`done`/`failed`
  ones (Retry in the catalogue re-files a ticket as pending).
- Never delete tickets. Every state change goes through the API so the
  catalogue chips update live.
- Prefer the API (`http://localhost:5170/__api/requests`) for reads and
  updates; fall back to editing `.pdk/requests.json` directly only when
  the catalogue isn't running.

## Loop

For each pending ticket:

1. Mark it in-progress:
   `curl -s -X PATCH localhost:5170/__api/requests/<id> -H 'Content-Type: application/json' -d '{"status":"in-progress"}'`
2. Execute by type:
   - **import-screen** — run the import-screen skill flow with the
     ticket's fields: repo `screen.repoPath` (+ `screen.appDir`), screen
     file `screen.file`, prototype title `screen.title`, stack
     `screen.stack`. The skill scaffolds via the catalogue create API as
     usual.
   - **handoff** — run the handoff skill flow with slug `handoff.slug`,
     target `handoff.targetRepo` (+ `handoff.targetSubdir` when set).
     After the handoff completes, advance the prototype's status:
     `curl -s -X POST localhost:5170/__api/update-status -H 'Content-Type: application/json' -d '{"slug":"<slug>","status":"handed-off"}'`
3. Mark the outcome:
   - success → `{"status":"done","note":"<one line: what was produced, e.g. branch handoff/tasks in /path>"}`
   - failure → `{"status":"failed","note":"<plain-language reason the designer can act on>"}`
     Failure notes are shown verbatim on the catalogue card — write them
     for a designer, not a stack trace (e.g. "the target repo has
     uncommitted changes — commit or stash them, then Retry").
4. Continue to the next pending ticket. When none remain, report a short
   summary: N done, N failed (with reasons).

## Never

- Never process the same ticket twice in one run.
- Never mark a ticket done without the underlying skill's own verification
  passing (the import renders / the handoff branch exists).
- Never wire live endpoints — ticket or not, the mock-only boundary holds.
```

- [ ] **Step 2: SessionStart hook**

In `.claude/settings.json`, inside the same `"hooks"` object as `UserPromptSubmit`, add:
```json
    "SessionStart": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "node -e \"try{const fs=require('fs');if(fs.existsSync('.pdk/requests.json')){const q=JSON.parse(fs.readFileSync('.pdk/requests.json','utf8'));const n=(Array.isArray(q)?q:[]).filter(r=>r.status==='pending').length;if(n>0)console.log(n+' catalogue order(s) waiting - run /orders to process them.')}}catch(e){}\""
          }
        ]
      }
    ]
```

- [ ] **Step 3: Handoff branch step**

In `.claude/skills/handoff/SKILL.md`, immediately before the final report/verification-summary step, add:

```markdown
## Land it on a branch

After the export verifies (typecheck/build in the target), commit it so
the developer picks it up inside their normal git workflow:

1. `git -C <target> checkout -b handoff/<slug>` (if taken, suffix `-2`,
   `-3`, …).
2. `git -C <target> add` the exported files + `HANDOFF.md` +
   `DESIGN-CONTEXT.md`, and commit:
   `feat(handoff): <title> prototype — connect endpoints per HANDOFF.md`.
3. Leave the target checked out on that branch and name it in your report
   — "checked out branch handoff/<slug>; open a PR when the endpoints are
   connected."
```

- [ ] **Step 4: Docs**

`README.md` — in the "## Already have a product? Point the kit at it" section, append a fourth bullet:
```markdown
- **Click, don't type** — the gallery has buttons for all of this: start
  from scratch or from a real screen, flip a prototype's status (draft →
  ready for dev → handed off), and hand it to developers. Buttons file
  "order tickets" that your AI assistant picks up — if it isn't already
  running, it announces waiting orders the next time you open it.
```

`CLAUDE.md` — repo map: after the `tooling/` line add:
```
.pdk/                 Per-device order-ticket queue (git-ignored) — see the orders skill
```
and append to "The prototyping flow (enforced)" section:
```markdown
Catalogue buttons file order tickets (import a screen, hand off) into
`.pdk/requests.json`; process them with the `orders` skill. Status flips
(ready-for-dev etc.) are direct pdk.json updates via the catalogue.
```

`docs/decisions.md` — new entry at the top (after the `---` separator, above the existing entries):
```markdown
## 2026-07-06 — Michael Fung (with Claude)

**Catalogue actions: order tickets, not typed commands**

1. Buttons that need the AI (screen import, handoff) file order tickets
   in a git-ignored, per-device queue (.pdk/requests.json) drained by
   /orders — same pattern as Markup annotations. Copyable-command and
   headless-Claude bridges were considered and rejected (friction /
   invisible spend).
2. Handover is two steps: "ready for dev" is a status flip a designer
   owns; the handoff ticket exports to a committed handoff/<slug> branch
   in the target repo and advances the status to "handed off".
3. Queues are deliberately not shared between machines — collaboration
   travels through git (prototypes + statuses), tickets stay personal.
```

- [ ] **Step 5: Verify + full suite**

Run: `node -e "JSON.parse(require('fs').readFileSync('.claude/settings.json','utf8'));console.log('settings.json valid')"`.
Run: `npm test -w @pdk/core` (93 green) and `npm run build:core` (clean).
Hook check: `mkdir -p .pdk && echo '[{"status":"pending"}]' > .pdk/requests.json`, run the hook's node command directly → expect "1 catalogue order(s) waiting…", then `rm -rf .pdk`.

- [ ] **Step 6: Commit**

```bash
git add .claude CLAUDE.md README.md docs/decisions.md
git commit -m "feat(skills): /orders queue processor, session hook, handoff branch step, docs

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Self-review notes

- Spec coverage: queue store + status updater (Task 1), screen discovery (Task 2), all five endpoints incl. stacks.productRepo (Task 3), two-mode create modal / status menu with the lifecycle five / handover modal with prefill / ticket chips + pending-imports strip + Retry + 5s polling (Task 4), /orders + session-start announcement + handoff/<slug> branch + docs + decisions entry (Task 5). Error handling per spec: corrupt-queue rebuild (T1 test), unknown id 404 / invalid status 422 (T1 tests + T3 mapping), screens `reason` for no-repo/missing-path (T3), failure notes verbatim on cards (T4 chip + T5 skill rules).
- Known deviation from spec prose (deliberate): `listRequests` returns a plain array and logs the corrupt-file warning to the server console rather than a one-time UI banner — the chips and `reason` fields cover every user-visible failure case.
- Type consistency: `CatalogueRequest`/payload field names identical across store (T1), endpoint bodies (T3), and UI types (T4); `ScreenEntry {file,name}` (T2) is wrapped by the endpoint into `{repoPath, appDir, file, name, stack}` = UI `ScreenOption` (T4); status strings match `ALLOWED_STATUSES`; branch name `handoff/<slug>` consistent between HandoverModal copy (T4) and the handoff skill (T5).
- The endpoints delegate to tested functions; vite-plugins.ts additions are shims verified by the live curl round-trip (T3 Step 4) and the browser pass (T4 Step 6).
