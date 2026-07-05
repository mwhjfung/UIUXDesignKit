import { randomUUID } from 'node:crypto'
import type { ServerResponse } from 'node:http'

export type AnnotationStatus = 'pending' | 'resolved' | 'dismissed'

export type Annotation = {
  id: string
  sessionId: string
  timestamp: number
  status: AnnotationStatus
  comment?: string
  selector?: string
  elementPath?: string
  vueComponent?: string
  position?: { x: number; y: number; width: number; height: number }
  nearbyText?: string
  [key: string]: unknown
}

export type PendingAction = {
  output: string
  annotations: Annotation[]
  timestamp: number
}

export type Session = {
  id: string
  url: string
  createdAt: number
  annotations: Map<string, Annotation>
  sseClients: Set<ServerResponse>
  lastAction: PendingAction | null
}

export function createMarkupStore() {
  const sessions = new Map<string, Session>()
  const annotationIndex = new Map<string, string>() // annotationId → sessionId

  return {
    createSession(url: string): Session {
      const id = randomUUID()
      const session: Session = {
        id,
        url,
        createdAt: Date.now(),
        annotations: new Map(),
        sseClients: new Set(),
        lastAction: null,
      }
      sessions.set(id, session)
      return session
    },

    getSession(id: string): Session | undefined {
      return sessions.get(id)
    },

    getAllSessions(): Session[] {
      return Array.from(sessions.values())
    },

    addAnnotation(
      sessionId: string,
      data: Omit<Annotation, 'id' | 'sessionId' | 'timestamp' | 'status'> & { id?: string },
    ): Annotation | null {
      const session = sessions.get(sessionId)
      if (!session) return null
      const annotation: Annotation = {
        ...data,
        id: data.id ?? randomUUID(), // Preserve the toolbar's existing ID if provided
        sessionId,
        timestamp: Date.now(),
        status: 'pending',
      }
      session.annotations.set(annotation.id, annotation)
      annotationIndex.set(annotation.id, sessionId)
      return annotation
    },

    updateAnnotation(id: string, data: Partial<Annotation>): Annotation | null {
      const sessionId = annotationIndex.get(id)
      if (!sessionId) return null
      const session = sessions.get(sessionId)
      if (!session) return null
      const annotation = session.annotations.get(id)
      if (!annotation) return null
      Object.assign(annotation, data)
      return annotation
    },

    deleteAnnotation(id: string): { deleted: boolean; sessionId: string | null } {
      const sessionId = annotationIndex.get(id)
      if (!sessionId) return { deleted: false, sessionId: null }
      const session = sessions.get(sessionId)
      if (!session || !session.annotations.has(id))
        return { deleted: false, sessionId: null }
      session.annotations.delete(id)
      annotationIndex.delete(id)
      return { deleted: true, sessionId }
    },

    broadcast(sessionId: string, eventName: string, payload: unknown): number {
      const session = sessions.get(sessionId)
      if (!session) return 0
      const data = `event: ${eventName}\ndata: ${JSON.stringify(payload)}\n\n`
      let count = 0
      const dead: ServerResponse[] = []
      for (const client of session.sseClients) {
        try {
          client.write(data)
          count++
        } catch {
          dead.push(client)
        }
      }
      // Remove stale clients after iteration (mutating during iteration can skip entries)
      dead.forEach(c => session.sseClients.delete(c))
      return count
    },

    getAnnotationSession(annotationId: string): string | null {
      return annotationIndex.get(annotationId) ?? null
    },

    setLastAction(sessionId: string, output: string, annotations: Annotation[]): boolean {
      const session = sessions.get(sessionId)
      if (!session) return false
      session.lastAction = { output, annotations: [...annotations], timestamp: Date.now() }
      return true
    },

    resolveFromLastAction(sessionId: string, annotationId: string): boolean {
      const session = sessions.get(sessionId)
      if (!session?.lastAction) return false
      session.lastAction.annotations = session.lastAction.annotations.filter(a => a.id !== annotationId)
      if (session.lastAction.annotations.length === 0) session.lastAction = null
      return true
    },

    requeueToLastAction(sessionId: string, annotation: Annotation): boolean {
      const session = sessions.get(sessionId)
      if (!session) return false
      if (!session.lastAction) {
        session.lastAction = { output: '', annotations: [annotation], timestamp: Date.now() }
      } else {
        // Replace if exists (updated comment), add if not
        const existing = session.lastAction.annotations.findIndex(a => a.id === annotation.id)
        if (existing >= 0) {
          session.lastAction.annotations[existing] = annotation
        } else {
          session.lastAction.annotations.push(annotation)
        }
        session.lastAction.timestamp = Date.now()
      }
      return true
    },

    serializeSession(session: Session) {
      return {
        id: session.id,
        url: session.url,
        createdAt: session.createdAt,
        annotations: Array.from(session.annotations.values()),
        lastAction: session.lastAction ?? null,
      }
    },
  }
}

// Singleton for use by the Vite plugin at runtime
export const globalStore = createMarkupStore()
