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
