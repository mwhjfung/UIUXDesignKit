import { describe, it, expect, beforeEach, beforeAll, afterAll } from 'vitest'
import { createMarkupStore } from '../src/vite/markup-store'
import { createServer } from 'node:http'
import type { Server } from 'node:http'
import { createMarkupRouter } from '../src/vite/markup-router'

describe('MarkupStore', () => {
  let store: ReturnType<typeof createMarkupStore>

  beforeEach(() => {
    store = createMarkupStore()
  })

  it('creates a session and retrieves it by id', () => {
    const session = store.createSession('http://localhost:5173/prototypes/test')
    expect(session.id).toBeTruthy()
    expect(store.getSession(session.id)).toBe(session)
  })

  it('returns undefined for unknown session id', () => {
    expect(store.getSession('nonexistent')).toBeUndefined()
  })

  it('lists all sessions', () => {
    store.createSession('http://localhost:5173/a')
    store.createSession('http://localhost:5173/b')
    expect(store.getAllSessions()).toHaveLength(2)
  })

  it('adds an annotation to a session', () => {
    const session = store.createSession('http://localhost:5173/a')
    const annotation = store.addAnnotation(session.id, { comment: 'Fix this', selector: '.btn' })
    expect(annotation).not.toBeNull()
    expect(annotation!.id).toBeTruthy()
    expect(annotation!.status).toBe('pending')
    expect(annotation!.comment).toBe('Fix this')
  })

  it('returns null when adding annotation to unknown session', () => {
    const annotation = store.addAnnotation('nonexistent', { comment: 'Fix this' })
    expect(annotation).toBeNull()
  })

  it('updates annotation status', () => {
    const session = store.createSession('http://localhost:5173/a')
    const annotation = store.addAnnotation(session.id, { comment: 'Fix' })!
    const updated = store.updateAnnotation(annotation.id, { status: 'resolved' })
    expect(updated!.status).toBe('resolved')
  })

  it('deletes an annotation', () => {
    const session = store.createSession('http://localhost:5173/a')
    const annotation = store.addAnnotation(session.id, { comment: 'Fix' })!
    const result = store.deleteAnnotation(annotation.id)
    expect(result.deleted).toBe(true)
    expect(result.sessionId).toBe(session.id)
    const fetched = store.getSession(session.id)
    expect(fetched!.annotations.size).toBe(0)
  })

  it('serializeSession includes annotations array', () => {
    const session = store.createSession('http://localhost:5173/a')
    store.addAnnotation(session.id, { comment: 'Fix' })
    const serialized = store.serializeSession(session)
    expect(serialized.annotations).toHaveLength(1)
    expect(serialized.annotations[0]).toMatchObject({ comment: 'Fix', status: 'pending' })
  })
})

describe('Markup HTTP API', () => {
  let base: string
  let httpServer: Server
  let routerStore: ReturnType<typeof createMarkupStore>

  beforeAll(async () => {
    routerStore = createMarkupStore()
    const router = createMarkupRouter(routerStore)
    httpServer = createServer((req, res) => {
      router(req, res, () => {
        res.writeHead(404)
        res.end(JSON.stringify({ error: 'Not found' }))
      })
    })
    await new Promise<void>((resolve) => httpServer.listen(0, resolve))
    const addr = httpServer.address() as { port: number }
    base = `http://localhost:${addr.port}`
  })

  afterAll(() => new Promise<void>((resolve) => httpServer.close(() => resolve())))

  it('GET /health returns { ok: true }', async () => {
    const res = await fetch(`${base}/health`)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
  })

  it('POST /sessions creates a session', async () => {
    const res = await fetch(`${base}/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: 'http://localhost:5173/prototypes/test' }),
    })
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body).toMatchObject({ id: expect.any(String), url: 'http://localhost:5173/prototypes/test' })
  })

  it('GET /sessions returns all sessions', async () => {
    await fetch(`${base}/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: 'http://localhost:5173/prototypes/test' }),
    })
    const res = await fetch(`${base}/sessions`)
    const sessions = await res.json()
    expect(Array.isArray(sessions)).toBe(true)
    expect(sessions.length).toBeGreaterThan(0)
  })

  it('POST /sessions/:id/annotations adds an annotation', async () => {
    const sessionRes = await fetch(`${base}/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: 'http://localhost:5173/prototypes/test' }),
    })
    const session = await sessionRes.json()

    const res = await fetch(`${base}/sessions/${session.id}/annotations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ comment: 'Fix button colour', selector: '.btn-primary' }),
    })
    expect(res.status).toBe(201)
    const annotation = await res.json()
    expect(annotation).toMatchObject({ id: expect.any(String), comment: 'Fix button colour', status: 'pending' })
  })

  it('POST /sessions/:id/action returns success', async () => {
    const sessionRes = await fetch(`${base}/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: 'http://localhost:5173/prototypes/test' }),
    })
    const session = await sessionRes.json()

    const res = await fetch(`${base}/sessions/${session.id}/action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ output: '## Feedback\n\n- Fix button' }),
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toMatchObject({ success: true, annotationCount: expect.any(Number) })
  })

  it('PATCH /annotations/:id updates status', async () => {
    const sessionRes = await fetch(`${base}/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: 'http://localhost:5173/prototypes/test' }),
    })
    const session = await sessionRes.json()
    const annoRes = await fetch(`${base}/sessions/${session.id}/annotations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ comment: 'Fix spacing' }),
    })
    const annotation = await annoRes.json()

    const patchRes = await fetch(`${base}/annotations/${annotation.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'resolved' }),
    })
    expect(patchRes.status).toBe(200)
    expect((await patchRes.json()).status).toBe('resolved')
  })

  it('PATCH /annotations/:id returns 200 even when annotation was already deleted (toolbar clear race)', async () => {
    // Simulate: annotation was synced to server then deleted by toolbar clearAll,
    // but still referenced in lastAction. The skill should be able to resolve it.
    const nonExistentId = 'deleted-annotation-id'
    const patchRes = await fetch(`${base}/annotations/${nonExistentId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'resolved' }),
    })
    expect(patchRes.status).toBe(200)
    expect((await patchRes.json()).status).toBe('resolved')
  })

  it('returns 404 for unknown session', async () => {
    const res = await fetch(`${base}/sessions/does-not-exist`)
    expect(res.status).toBe(404)
  })
})
