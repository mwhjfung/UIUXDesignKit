import { ref, watch, type Ref } from 'vue'
import {
  createSession,
  getSession,
  syncAnnotation,
  deleteAnnotation as deleteAnnotationFromServer,
} from '../utils/sync'
import {
  loadAnnotations,
  loadAllAnnotations,
  saveSessionId,
  loadSessionId,
  clearSessionId,
  saveAnnotationsWithSyncMarker,
} from '../utils/storage'
import {
  originalSetInterval,
  originalSetTimeout,
} from '../utils/freeze-animations'
import type { Annotation } from '../types'

export function useServerSync(options: {
  endpoint?: string
  initialSessionId?: string
  pathname: string
  mounted: Ref<boolean>
  annotations: Ref<Annotation[]>
  exitingMarkers: Ref<Set<string>>
  onSessionCreated?: (sessionId: string) => void
}) {
  const {
    endpoint,
    initialSessionId,
    pathname,
    mounted,
    annotations,
    exitingMarkers,
    onSessionCreated,
  } = options

  const currentSessionId = ref<string | null>(initialSessionId ?? null)
  const connectionStatus = ref<'disconnected' | 'connecting' | 'connected'>(
    endpoint ? 'connecting' : 'disconnected',
  )
  let sessionInitialized = false
  let prevConnectionStatus: typeof connectionStatus.value | null = null

  async function initSession() {
    if (!endpoint || !mounted.value || sessionInitialized) return
    sessionInitialized = true
    connectionStatus.value = 'connecting'

    try {
      const storedSessionId = loadSessionId(pathname)
      const sessionIdToJoin = initialSessionId || storedSessionId
      let sessionEstablished = false

      if (sessionIdToJoin) {
        try {
          const session = await getSession(endpoint, sessionIdToJoin)
          currentSessionId.value = session.id
          connectionStatus.value = 'connected'
          saveSessionId(pathname, session.id)
          sessionEstablished = true

          const allLocalAnnotations = loadAnnotations<Annotation>(pathname)
          const serverIds = new Set(session.annotations.map((a) => a.id))
          const localToMerge = allLocalAnnotations.filter((a) => !serverIds.has(a.id))

          if (localToMerge.length > 0) {
            const baseUrl = typeof window !== 'undefined' ? window.location.origin : ''
            const pageUrl = `${baseUrl}${pathname}`

            const results = await Promise.allSettled(
              localToMerge.map((annotation) =>
                syncAnnotation(endpoint, session.id, {
                  ...annotation,
                  sessionId: session.id,
                  url: pageUrl,
                }),
              ),
            )

            const syncedAnnotations = results.map((result, i) => {
              if (result.status === 'fulfilled') return result.value
              console.warn('[Agentation] Failed to sync annotation:', result.reason)
              return localToMerge[i]
            })

            const allAnnotations = [...session.annotations, ...syncedAnnotations]
              .filter((a) => {
                const s = (a as Annotation & { status?: string }).status
                return s !== 'dismissed' && s !== 'resolved'
              })
            annotations.value = allAnnotations
            saveAnnotationsWithSyncMarker(pathname, allAnnotations, session.id)
          } else {
            const activeAnnotations = session.annotations
              .filter((a) => {
                const s = (a as Annotation & { status?: string }).status
                return s !== 'dismissed' && s !== 'resolved'
              })
            annotations.value = activeAnnotations
            saveAnnotationsWithSyncMarker(pathname, activeAnnotations, session.id)
          }
        } catch (joinError) {
          console.warn('[Agentation] Could not join session, creating new:', joinError)
          clearSessionId(pathname)
        }
      }

      if (!sessionEstablished) {
        const currentUrl = typeof window !== 'undefined' ? window.location.href : '/'
        const session = await createSession(endpoint, currentUrl)
        currentSessionId.value = session.id
        connectionStatus.value = 'connected'
        saveSessionId(pathname, session.id)
        onSessionCreated?.(session.id)

        const allAnnotations = loadAllAnnotations<Annotation>()
        const baseUrl = typeof window !== 'undefined' ? window.location.origin : ''

        const syncPromises: Promise<void>[] = []
        for (const [pagePath, pageAnnotations] of allAnnotations) {
          const unsyncedAnnotations = pageAnnotations.filter(
            (a) => !(a as Annotation & { _syncedTo?: string })._syncedTo,
          )
          if (unsyncedAnnotations.length === 0) continue

          const pageUrl = `${baseUrl}${pagePath}`
          const isCurrentPage = pagePath === pathname

          syncPromises.push(
            (async () => {
              try {
                const targetSession = isCurrentPage
                  ? session
                  : await createSession(endpoint, pageUrl)

                const results = await Promise.allSettled(
                  unsyncedAnnotations.map((annotation) =>
                    syncAnnotation(endpoint, targetSession.id, {
                      ...annotation,
                      sessionId: targetSession.id,
                      url: pageUrl,
                    }),
                  ),
                )

                const syncedAnnotations = results.map((result, i) => {
                  if (result.status === 'fulfilled') return result.value
                  console.warn('[Agentation] Failed to sync annotation:', result.reason)
                  return unsyncedAnnotations[i]
                })

                saveAnnotationsWithSyncMarker(pagePath, syncedAnnotations, targetSession.id)

                if (isCurrentPage) {
                  const originalIds = new Set(unsyncedAnnotations.map((a) => a.id))
                  const prev = annotations.value
                  const newDuringSync = prev.filter((a) => !originalIds.has(a.id))
                  annotations.value = [...syncedAnnotations, ...newDuringSync]
                }
              } catch (err) {
                console.warn(`[Agentation] Failed to sync annotations for ${pagePath}:`, err)
              }
            })(),
          )
        }

        await Promise.allSettled(syncPromises)
      }
    } catch (error) {
      connectionStatus.value = 'disconnected'
      console.warn('[Agentation] Failed to initialize session, using local storage:', error)
    }
  }

  function startHealthCheck(): (() => void) | undefined {
    if (!endpoint || !mounted.value) return undefined

    const checkHealth = async () => {
      try {
        const response = await fetch(`${endpoint}/health`)
        if (response.ok) {
          connectionStatus.value = 'connected'
        } else {
          connectionStatus.value = 'disconnected'
        }
      } catch {
        connectionStatus.value = 'disconnected'
      }
    }

    checkHealth()
    const interval = originalSetInterval(checkHealth, 10000)
    return () => clearInterval(interval)
  }

  function startEventSource(): (() => void) | undefined {
    if (!endpoint || !mounted.value || !currentSessionId.value) return undefined

    const eventSource = new EventSource(
      `${endpoint}/sessions/${currentSessionId.value}/events`,
    )
    const handler = (e: MessageEvent) => {
      try {
        const event = JSON.parse(e.data)
        console.log('[Markup] SSE annotation.updated received:', JSON.stringify(event))
        const id = event.payload?.id as string | undefined
        const status = event.payload?.status as string | undefined
        console.log(`[Markup] SSE parsed: id=${id} status=${status}, annotations in state: ${annotations.value.length}, ids: ${annotations.value.map(a => a.id).join(',')}`)
        if (!id) return

        if (status === 'dismissed') {
          // Animate out and remove — designer confirmed the fix
          exitingMarkers.value = new Set(exitingMarkers.value).add(id)
          originalSetTimeout(() => {
            annotations.value = annotations.value.filter((a) => a.id !== id)
            const next = new Set(exitingMarkers.value)
            next.delete(id)
            exitingMarkers.value = next
          }, 150)
        } else if (status === 'resolved') {
          // Update in-place — stays visible for designer review before dismissing
          annotations.value = annotations.value.map((a) =>
            a.id === id ? { ...a, status: 'resolved' as const } : a,
          )
        }
      } catch {
        // Ignore parse errors
      }
    }

    eventSource.addEventListener('annotation.updated', handler)

    return () => {
      eventSource.removeEventListener('annotation.updated', handler)
      eventSource.close()
    }
  }

  async function syncOnReconnect() {
    if (!endpoint || !mounted.value) return

    const wasDisconnected = prevConnectionStatus === 'disconnected'
    const isNowConnected = connectionStatus.value === 'connected'
    prevConnectionStatus = connectionStatus.value

    if (wasDisconnected && isNowConnected) {
      try {
        const localAnnotations = loadAnnotations<Annotation>(pathname)
        if (localAnnotations.length === 0) return

        const baseUrl = typeof window !== 'undefined' ? window.location.origin : ''
        const pageUrl = `${baseUrl}${pathname}`

        let sessionId = currentSessionId.value
        let serverAnnotations: Annotation[] = []

        if (sessionId) {
          try {
            const session = await getSession(endpoint, sessionId)
            serverAnnotations = session.annotations
          } catch {
            sessionId = null
          }
        }

        if (!sessionId) {
          const newSession = await createSession(endpoint, pageUrl)
          sessionId = newSession.id
          currentSessionId.value = sessionId
          saveSessionId(pathname, sessionId)
        }

        const serverIds = new Set(serverAnnotations.map((a) => a.id))
        const unsyncedLocal = localAnnotations.filter((a) => !serverIds.has(a.id))

        if (unsyncedLocal.length > 0) {
          const results = await Promise.allSettled(
            unsyncedLocal.map((annotation) =>
              syncAnnotation(endpoint, sessionId!, {
                ...annotation,
                sessionId: sessionId!,
                url: pageUrl,
              }),
            ),
          )

          const syncedAnnotations = results.map((result, i) => {
            if (result.status === 'fulfilled') return result.value
            console.warn('[Agentation] Failed to sync annotation on reconnect:', result.reason)
            return unsyncedLocal[i]
          })

          const allAnnotations = [...serverAnnotations, ...syncedAnnotations]
          annotations.value = allAnnotations
          saveAnnotationsWithSyncMarker(pathname, allAnnotations, sessionId!)
        }
      } catch (err) {
        console.warn('[Agentation] Failed to sync on reconnect:', err)
      }
    }
  }

  return {
    currentSessionId,
    connectionStatus,
    initSession,
    startHealthCheck,
    startEventSource,
    syncOnReconnect,
  }
}
