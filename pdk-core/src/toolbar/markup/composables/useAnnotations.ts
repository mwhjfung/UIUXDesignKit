import { ref, type Ref } from 'vue'
import {
  saveAnnotations,
  saveAnnotationsWithSyncMarker,
  getStorageKey,
} from '../utils/storage'
import {
  syncAnnotation,
  updateAnnotation as updateAnnotationOnServer,
  deleteAnnotation as deleteAnnotationFromServer,
} from '../utils/sync'
import { originalSetTimeout } from '../utils/freeze-animations'
import type { Annotation } from '../types'

type DrawStroke = {
  id: string
  points: Array<{ x: number; y: number }>
  color: string
  fixed: boolean
}

export function useAnnotations(options: {
  pathname: string
  mounted: Ref<boolean>
  endpoint?: string
  currentSessionId: Ref<string | null>
  exitingMarkers: Ref<Set<string>>
  animatedMarkers: Ref<Set<string>>
  drawStrokes: Ref<DrawStroke[]>
  drawCanvasRef: Ref<HTMLCanvasElement | null>
  redrawCanvas: (
    ctx: CanvasRenderingContext2D,
    strokes: DrawStroke[],
    hoveredIdx?: number | null,
    dimAmount?: number,
  ) => void
  dimAmountRef: { value: number }
  visualHighlightRef: { value: number | null }
  exitingStrokeIdRef: { value: string | null }
  exitingAlphaRef: { value: number }
  drawStrokesRef: { value: DrawStroke[] }
  onAnnotationAdd?: (annotation: Annotation) => void
  onAnnotationDelete?: (annotation: Annotation) => void
  onAnnotationUpdate?: (annotation: Annotation) => void
  onAnnotationsClear?: (annotations: Annotation[]) => void
  fireWebhook: (event: string, payload: Record<string, unknown>, force?: boolean) => Promise<boolean>
}) {
  const {
    pathname,
    mounted,
    endpoint,
    currentSessionId,
    exitingMarkers,
    animatedMarkers,
    drawStrokes,
    drawCanvasRef,
    redrawCanvas,
    dimAmountRef,
    visualHighlightRef,
    exitingStrokeIdRef,
    exitingAlphaRef,
    drawStrokesRef,
    onAnnotationAdd,
    onAnnotationDelete,
    onAnnotationUpdate,
    onAnnotationsClear,
    fireWebhook,
  } = options

  const annotations = ref<Annotation[]>([])
  // Mirror for synchronous reads inside callbacks (like useRef pattern)
  let annotationsSnapshot: Annotation[] = []

  function updateAnnotationsSnapshot() {
    annotationsSnapshot = annotations.value
  }

  function getAnnotationsSnapshot() {
    return annotationsSnapshot
  }

  // Recently added marker ID to prevent immediate hover
  let recentlyAddedId: string | null = null
  function getRecentlyAddedId() { return recentlyAddedId }

  // Save annotations to localStorage
  function persistAnnotations() {
    if (mounted.value && annotations.value.length > 0) {
      if (currentSessionId.value) {
        saveAnnotationsWithSyncMarker(pathname, annotations.value, currentSessionId.value)
      } else {
        saveAnnotations(pathname, annotations.value)
      }
    } else if (mounted.value && annotations.value.length === 0) {
      localStorage.removeItem(getStorageKey(pathname))
    }
  }

  // Add annotation
  function addAnnotation(
    comment: string,
    pendingAnnotation: {
      x: number
      y: number
      clientY: number
      element: string
      elementPath: string
      selectedText?: string
      boundingBox?: { x: number; y: number; width: number; height: number }
      nearbyText?: string
      cssClasses?: string
      isMultiSelect?: boolean
      isFixed?: boolean
      fullPath?: string
      accessibility?: string
      computedStyles?: string
      nearbyElements?: string
      reactComponents?: string
      elementBoundingBoxes?: Array<{ x: number; y: number; width: number; height: number }>
      drawingIndex?: number
      strokeId?: string
    },
  ): Annotation {
    const newAnnotation: Annotation = {
      id: Date.now().toString(),
      x: pendingAnnotation.x,
      y: pendingAnnotation.y,
      comment,
      element: pendingAnnotation.element,
      elementPath: pendingAnnotation.elementPath,
      timestamp: Date.now(),
      selectedText: pendingAnnotation.selectedText,
      boundingBox: pendingAnnotation.boundingBox,
      nearbyText: pendingAnnotation.nearbyText,
      cssClasses: pendingAnnotation.cssClasses,
      isMultiSelect: pendingAnnotation.isMultiSelect,
      isFixed: pendingAnnotation.isFixed,
      fullPath: pendingAnnotation.fullPath,
      accessibility: pendingAnnotation.accessibility,
      computedStyles: pendingAnnotation.computedStyles,
      nearbyElements: pendingAnnotation.nearbyElements,
      reactComponents: pendingAnnotation.reactComponents,
      elementBoundingBoxes: pendingAnnotation.elementBoundingBoxes,
      drawingIndex: pendingAnnotation.drawingIndex,
      strokeId: pendingAnnotation.strokeId,
      ...(endpoint && currentSessionId.value
        ? {
            sessionId: currentSessionId.value,
            url: typeof window !== 'undefined' ? window.location.href : undefined,
            status: 'pending' as const,
          }
        : {}),
    }

    annotations.value = [...annotations.value, newAnnotation]
    updateAnnotationsSnapshot()

    recentlyAddedId = newAnnotation.id
    originalSetTimeout(() => { recentlyAddedId = null }, 300)

    originalSetTimeout(() => {
      animatedMarkers.value = new Set(animatedMarkers.value).add(newAnnotation.id)
    }, 250)

    onAnnotationAdd?.(newAnnotation)
    fireWebhook('annotation.add', { annotation: newAnnotation })

    window.getSelection()?.removeAllRanges()

    // Sync to server
    if (endpoint && currentSessionId.value) {
      syncAnnotation(endpoint, currentSessionId.value, newAnnotation)
        .then((serverAnnotation) => {
          if (serverAnnotation.id !== newAnnotation.id) {
            annotations.value = annotations.value.map((a) =>
              a.id === newAnnotation.id ? { ...a, id: serverAnnotation.id } : a,
            )
            const next = new Set(animatedMarkers.value)
            next.delete(newAnnotation.id)
            next.add(serverAnnotation.id)
            animatedMarkers.value = next
            updateAnnotationsSnapshot()
          }
        })
        .catch((error) => {
          console.warn('[Agentation] Failed to sync annotation:', error)
        })
    }

    return newAnnotation
  }

  // Delete annotation with exit animation
  function deleteAnnotation(
    id: string,
    editingAnnotation: Annotation | null,
    onEditClose: () => void,
  ) {
    const currentAnnotations = annotationsSnapshot
    const deletedIndex = currentAnnotations.findIndex((a) => a.id === id)
    const deletedAnnotation = currentAnnotations[deletedIndex]

    // Close edit panel if deleting the annotation being edited
    if (editingAnnotation?.id === id) {
      onEditClose()
    }

    exitingMarkers.value = new Set(exitingMarkers.value).add(id)

    // Fire callback
    if (deletedAnnotation) {
      onAnnotationDelete?.(deletedAnnotation)
      fireWebhook('annotation.delete', { annotation: deletedAnnotation })
    }

    // Sync to server
    if (endpoint) {
      deleteAnnotationFromServer(endpoint, id).catch((error) => {
        console.warn('[Agentation] Failed to delete annotation from server:', error)
      })
    }

    // Fade linked stroke
    if (deletedAnnotation?.strokeId) {
      exitingStrokeIdRef.value = deletedAnnotation.strokeId
      exitingAlphaRef.value = 1
      const canvas = drawCanvasRef.value
      const ctx = canvas?.getContext('2d')
      if (ctx) {
        const start = performance.now()
        const fade = (now: number) => {
          const t = Math.min((now - start) / 150, 1)
          exitingAlphaRef.value = 1 - t
          redrawCanvas(ctx, drawStrokesRef.value, visualHighlightRef.value, dimAmountRef.value)
          if (t < 1) requestAnimationFrame(fade)
        }
        requestAnimationFrame(fade)
      }
    }

    // After exit animation, remove
    originalSetTimeout(() => {
      exitingStrokeIdRef.value = null
      const latestAnn = annotationsSnapshot.find((a) => a.id === id)
      const strokeId = latestAnn?.strokeId
      const currentStrokes = drawStrokesRef.value
      const drawingIdx = strokeId ? currentStrokes.findIndex((s) => s.id === strokeId) : -1

      if (drawingIdx >= 0) {
        drawStrokes.value = drawStrokes.value.filter((s) => s.id !== strokeId)
        annotations.value = annotations.value
          .filter((a) => a.id !== id)
          .map((a) =>
            a.drawingIndex != null && a.drawingIndex > drawingIdx
              ? { ...a, drawingIndex: a.drawingIndex - 1 }
              : a,
          )
      } else {
        annotations.value = annotations.value.filter((a) => a.id !== id)
      }
      const next = new Set(exitingMarkers.value)
      next.delete(id)
      exitingMarkers.value = next
      updateAnnotationsSnapshot()
    }, 150)

    return { deletedIndex, deletedAnnotation }
  }

  // Update annotation (edit mode)
  function updateAnnotationComment(
    editingAnnotation: Annotation,
    newComment: string,
  ) {
    const updatedAnnotation = { ...editingAnnotation, comment: newComment }

    annotations.value = annotations.value.map((a) =>
      a.id === editingAnnotation.id ? updatedAnnotation : a,
    )
    updateAnnotationsSnapshot()

    onAnnotationUpdate?.(updatedAnnotation)
    fireWebhook('annotation.update', { annotation: updatedAnnotation })

    if (endpoint) {
      updateAnnotationOnServer(endpoint, editingAnnotation.id, {
        comment: newComment,
      }).catch((error) => {
        console.warn('[Agentation] Failed to update annotation on server:', error)
      })
    }
  }

  // Clear all annotations
  function clearAll() {
    const count = annotations.value.length
    if (count === 0 && drawStrokes.value.length === 0) return

    onAnnotationsClear?.(annotations.value)
    fireWebhook('annotations.clear', { annotations: annotations.value })

    if (endpoint) {
      Promise.all(
        annotations.value.map((a) =>
          deleteAnnotationFromServer(endpoint, a.id).catch((error) => {
            console.warn('[Agentation] Failed to delete annotation from server:', error)
          }),
        ),
      )
    }

    // Clear draw strokes
    drawStrokes.value = []
    const canvas = drawCanvasRef.value
    if (canvas) {
      const ctx = canvas.getContext('2d')
      if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height)
    }

    const totalAnimationTime = count * 30 + 200
    originalSetTimeout(() => {
      annotations.value = []
      animatedMarkers.value = new Set()
      localStorage.removeItem(getStorageKey(pathname))
      updateAnnotationsSnapshot()
    }, totalAnimationTime)
  }

  return {
    annotations,
    getAnnotationsSnapshot,
    updateAnnotationsSnapshot,
    getRecentlyAddedId,
    persistAnnotations,
    addAnnotation,
    deleteAnnotation,
    updateAnnotationComment,
    clearAll,
  }
}
