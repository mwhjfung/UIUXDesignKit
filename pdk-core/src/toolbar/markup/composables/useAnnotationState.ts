import { ref } from 'vue'
import { originalSetTimeout } from '../utils/freeze-animations'
import type { Annotation } from '../types'

/**
 * Pending annotation shape (data collected from click/draw/drag
 * before the user types a comment).
 */
export type PendingAnnotation = {
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
  computedStylesObj?: Record<string, string>
  nearbyElements?: string
  reactComponents?: string
  elementBoundingBoxes?: Array<{ x: number; y: number; width: number; height: number }>
  multiSelectElements?: HTMLElement[]
  targetElement?: HTMLElement
  drawingIndex?: number
  strokeId?: string
}

export function useAnnotationState() {
  const pendingAnnotation = ref<PendingAnnotation | null>(null)
  const pendingExiting = ref(false)

  const editingAnnotation = ref<Annotation | null>(null)
  const editExiting = ref(false)
  const editingTargetElement = ref<HTMLElement | null>(null)
  const editingTargetElements = ref<HTMLElement[]>([])

  // Cancel pending with exit animation
  function cancelPending(
    onBeforeRemove?: (strokeId: string | undefined) => void,
  ) {
    const strokeId = pendingAnnotation.value?.strokeId
    pendingExiting.value = true

    if (strokeId && onBeforeRemove) {
      onBeforeRemove(strokeId)
    }

    originalSetTimeout(() => {
      pendingAnnotation.value = null
      pendingExiting.value = false
    }, 150)
  }

  // Submit pending annotation (wrap the add, animate exit)
  function submitPending(
    addAnnotation: (comment: string, pending: PendingAnnotation) => void,
  ) {
    return (comment: string) => {
      if (!pendingAnnotation.value) return
      addAnnotation(comment, pendingAnnotation.value)

      pendingExiting.value = true
      originalSetTimeout(() => {
        pendingAnnotation.value = null
        pendingExiting.value = false
      }, 150)
    }
  }

  // Start editing
  function startEditing(annotation: Annotation) {
    editingAnnotation.value = annotation
  }

  // Cancel editing with exit animation
  function cancelEditing() {
    editExiting.value = true
    originalSetTimeout(() => {
      editingAnnotation.value = null
      editingTargetElement.value = null
      editingTargetElements.value = []
      editExiting.value = false
    }, 150)
  }

  // Close editing (for delete-while-editing case)
  function closeEditingForDelete() {
    editExiting.value = true
    originalSetTimeout(() => {
      editingAnnotation.value = null
      editingTargetElement.value = null
      editingTargetElements.value = []
      editExiting.value = false
    }, 150)
  }

  // Update + close editing
  function submitEditing(
    updateAnnotationComment: (annotation: Annotation, comment: string) => void,
  ) {
    return (newComment: string) => {
      if (!editingAnnotation.value) return
      updateAnnotationComment(editingAnnotation.value, newComment)

      editExiting.value = true
      originalSetTimeout(() => {
        editingAnnotation.value = null
        editingTargetElement.value = null
        editingTargetElements.value = []
        editExiting.value = false
      }, 150)
    }
  }

  // Reset all states
  function resetAll() {
    pendingAnnotation.value = null
    pendingExiting.value = false
    editingAnnotation.value = null
    editExiting.value = false
    editingTargetElement.value = null
    editingTargetElements.value = []
  }

  return {
    pendingAnnotation,
    pendingExiting,
    editingAnnotation,
    editExiting,
    editingTargetElement,
    editingTargetElements,
    cancelPending,
    submitPending,
    startEditing,
    cancelEditing,
    closeEditingForDelete,
    submitEditing,
    resetAll,
  }
}
