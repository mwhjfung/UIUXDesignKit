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
  if (!/^[a-z0-9][a-z0-9-]*$/.test(slug)) {
    throw new Error(`Unknown prototype '${slug}' — slugs are kebab-case.`)
  }
  const pdkPath = join(root, 'prototypes', slug, 'pdk.json')
  if (!existsSync(pdkPath)) {
    throw new Error(`Unknown prototype '${slug}' (${pdkPath} not found).`)
  }
  const pdk = JSON.parse(readFileSync(pdkPath, 'utf8'))
  pdk.status = status
  writeFileSync(pdkPath, JSON.stringify(pdk, null, 2) + '\n')
}
