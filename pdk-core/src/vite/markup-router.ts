import type { IncomingMessage, ServerResponse } from 'node:http'
import type { createMarkupStore } from './markup-store'

type Store = ReturnType<typeof createMarkupStore>
type Next = () => void

function json(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
  })
  res.end(body === null ? '' : JSON.stringify(body))
}

function readBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    let raw = ''
    req.on('data', (chunk: Buffer) => (raw += chunk.toString()))
    req.on('end', () => {
      try {
        resolve(raw ? JSON.parse(raw) : {})
      } catch {
        resolve({})
      }
    })
    req.on('error', reject)
  })
}

export function createMarkupRouter(store: Store) {
  return async function markupRouter(
    req: IncomingMessage,
    res: ServerResponse,
    next: Next,
  ) {
    const url = req.url ?? '/'
    const method = req.method ?? 'GET'

    // CORS preflight
    if (method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      })
      res.end()
      return
    }

    // GET /health
    if (url === '/health' && method === 'GET')
      return json(res, 200, { ok: true })

    // GET /sessions
    if (url === '/sessions' && method === 'GET')
      return json(res, 200, store.getAllSessions().map(store.serializeSession))

    // POST /sessions
    if (url === '/sessions' && method === 'POST') {
      const body = await readBody(req)
      const session = store.createSession((body.url as string | undefined) ?? '/')
      return json(res, 201, store.serializeSession(session))
    }

    // GET /sessions/:id
    const sessionMatch = url.match(/^\/sessions\/([^/]+)$/)
    if (sessionMatch && method === 'GET') {
      const session = store.getSession(sessionMatch[1])
      if (!session) return json(res, 404, { error: 'Session not found' })
      return json(res, 200, store.serializeSession(session))
    }

    // POST /sessions/:id/annotations
    const annotationsMatch = url.match(/^\/sessions\/([^/]+)\/annotations$/)
    if (annotationsMatch && method === 'POST') {
      const body = await readBody(req)
      const annotation = store.addAnnotation(annotationsMatch[1], body as never)
      if (!annotation) return json(res, 404, { error: 'Session not found' })
      store.broadcast(annotationsMatch[1], 'annotation.updated', {
        payload: { id: annotation.id, status: annotation.status },
      })
      return json(res, 201, annotation)
    }

    // POST /sessions/:id/action  (Send button)
    const actionMatch = url.match(/^\/sessions\/([^/]+)\/action$/)
    if (actionMatch && method === 'POST') {
      const body = await readBody(req)
      const session = store.getSession(actionMatch[1])
      if (!session) return json(res, 404, { error: 'Session not found' })
      const currentAnnotations = Array.from(session.annotations.values())
      const annotationCount = currentAnnotations.length
      // Snapshot annotations so they survive toolbar clear before the skill reads them
      store.setLastAction(actionMatch[1], (body.output as string) ?? '', currentAnnotations)
      const sseDelivered = store.broadcast(actionMatch[1], 'action.requested', {
        payload: { output: body.output ?? '' },
      })
      return json(res, 200, {
        success: true,
        annotationCount,
        delivered: { sseListeners: sseDelivered, webhooks: 0, total: sseDelivered },
      })
    }

    // GET /sessions/:id/events  (SSE)
    const eventsMatch = url.match(/^\/sessions\/([^/]+)\/events$/)
    if (eventsMatch && method === 'GET') {
      const session = store.getSession(eventsMatch[1])
      if (!session) return json(res, 404, { error: 'Session not found' })
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        'Access-Control-Allow-Origin': '*',
      })
      res.write('data: {"type":"connected"}\n\n')
      session.sseClients.add(res)
      req.on('close', () => session.sseClients.delete(res))
      return // Keep connection open — do NOT call next()
    }

    // PATCH /annotations/:id
    const annotationMatch = url.match(/^\/annotations\/([^/]+)$/)
    if (annotationMatch && method === 'PATCH') {
      const body = await readBody(req)
      // Strip immutable fields — id, sessionId, timestamp must not be overwritten via API
      const { id: _id, sessionId: _sid, timestamp: _ts, ...safeData } = body
      const annotationId = annotationMatch[1]
      console.log(`[Markup] PATCH /annotations/${annotationId} status=${safeData.status}`)
      const annotation = store.updateAnnotation(annotationId, safeData as never)
      console.log(`[Markup] updateAnnotation result: ${annotation ? `found, status=${annotation.status}` : 'NOT FOUND in live store'}`)

      if (!annotation) {
        // Annotation was deleted from the live store (e.g. toolbar clear) but may still be in
        // a lastAction snapshot. Remove it from all snapshots and return 200 — from the skill's
        // perspective the annotation is gone, which is the resolved state.
        if ((safeData as Record<string, unknown>).status === 'resolved') {
          for (const session of store.getAllSessions()) {
            store.resolveFromLastAction(session.id, annotationId)
          }
        }
        return json(res, 200, { id: annotationId, status: 'resolved' })
      }

      const sessionId = store.getAnnotationSession(annotation.id)
      if (sessionId) {
        const newStatus = (safeData as Record<string, unknown>).status as string | undefined
        // If resolved, remove from the action snapshot so the skill doesn't re-process it
        if (newStatus === 'resolved') {
          store.resolveFromLastAction(sessionId, annotation.id)
        }
        // If reworked back to pending, re-queue into lastAction so the skill picks it up
        if (newStatus === 'pending') {
          store.requeueToLastAction(sessionId, annotation)
        }
        const delivered = store.broadcast(sessionId, 'annotation.updated', {
          payload: { id: annotation.id, status: annotation.status },
        })
        console.log(`[Markup] SSE broadcast annotation.updated id=${annotation.id} status=${annotation.status} → ${delivered} client(s)`)
      }
      return json(res, 200, annotation)
    }

    // DELETE /annotations/:id
    if (annotationMatch && method === 'DELETE') {
      const { deleted } = store.deleteAnnotation(annotationMatch[1])
      if (!deleted) return json(res, 404, { error: 'Annotation not found' })
      return json(res, 204, null)
    }

    // GET /debug — full state dump for diagnostics
    if (url === '/debug' && method === 'GET') {
      const state = store.getAllSessions().map((s) => ({
        id: s.id,
        url: s.url,
        sseClients: s.sseClients.size,
        annotations: Array.from(s.annotations.values()).map((a) => ({
          id: a.id,
          status: a.status,
          comment: a.comment,
        })),
        lastAction: s.lastAction
          ? {
              annotationCount: s.lastAction.annotations.length,
              annotationIds: s.lastAction.annotations.map((a) => a.id),
              timestamp: new Date(s.lastAction.timestamp).toISOString(),
            }
          : null,
      }))
      return json(res, 200, state)
    }

    next()
  }
}
