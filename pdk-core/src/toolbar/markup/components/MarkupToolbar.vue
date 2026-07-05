<script setup lang="ts">
import {
  ref,
  computed,
  watch,
  watchEffect,
  onMounted,
  onUnmounted,
  nextTick,
  Teleport,
} from 'vue'

import type { Annotation } from '../types'
import {
  identifyElement,
  getNearbyText,
  getElementClasses,
  getDetailedComputedStyles,
  getForensicComputedStyles,
  parseComputedStylesString,
  getFullElementPath,
  getAccessibilityInfo,
  getNearbyElements,
  closestCrossingShadow,
} from '../utils/element-identification'
import {
  loadAnnotations,
  saveAnnotations,
} from '../utils/storage'
import {
  freeze as freezeAll,
  unfreeze as unfreezeAll,
  originalSetTimeout,
  originalSetInterval,
} from '../utils/freeze-animations'
import { getComponentName } from '../utils/component-detection'

import styles from '../styles/page-toolbar.module.scss'

// Sub-components
import AnnotationPopup from './AnnotationPopup.vue'
import AnnotationMarker from './AnnotationMarker.vue'
import ToolbarSettingsPanel from './ToolbarSettingsPanel.vue'
import ToolbarTooltip from './ToolbarTooltip.vue'

// Icons
import {
  IconListSparkle,
  IconPausePlayAnimated,
  IconPencil,
  IconEyeAnimated,
  IconCopyAnimated,
  IconSendArrow,
  IconTrashAlt,
  IconGear,
  IconXmarkLarge,
  IconPlus,
  IconXmark,
  IconClose,
  IconEdit,
} from './icons'

// Composables
import {
  useToolbarSettings,
  isValidUrl,
  type ReactComponentMode,
  OUTPUT_TO_REACT_MODE,
} from '../composables/useToolbarSettings'
import { useServerSync } from '../composables/useServerSync'
import { useAnnotationState, type PendingAnnotation } from '../composables/useAnnotationState'
import { useDrawing, findStrokeAtPoint, classifyStrokeGesture, hexToRgba, type DrawStroke } from '../composables/useDrawing'
import { useDragSelect } from '../composables/useDragSelect'
import { useMultiSelect } from '../composables/useMultiSelect'
import { useHover } from '../composables/useHover'
import { useMarkerVisibility } from '../composables/useMarkerVisibility'
import { useCursorStyles } from '../composables/useCursorStyles'
import { deepElementFromPoint, isElementFixed, generateOutput } from '../composables/useCopyOutput'
import { useKeyboardShortcuts } from '../composables/useKeyboardShortcuts'

// =============================================================================
// Declare build-time constant
// =============================================================================
declare const __VERSION__: string

// =============================================================================
// Expose browser globals for template access
// (Vue templates can't access window/document directly)
// =============================================================================
const _window = window
const _document = document

// =============================================================================
// Types for Demo Annotations
// =============================================================================

export type DemoAnnotation = {
  selector: string
  comment: string
  selectedText?: string
}

// =============================================================================
// Props
// =============================================================================

const props = withDefaults(defineProps<{
  demoAnnotations?: DemoAnnotation[]
  demoDelay?: number
  enableDemoMode?: boolean
  onAnnotationAdd?: (annotation: Annotation) => void
  onAnnotationDelete?: (annotation: Annotation) => void
  onAnnotationUpdate?: (annotation: Annotation) => void
  onAnnotationsClear?: (annotations: Annotation[]) => void
  onCopy?: (markdown: string) => void
  onSubmit?: (output: string, annotations: Annotation[]) => void
  copyToClipboard?: boolean
  endpoint?: string
  sessionId?: string
  onSessionCreated?: (sessionId: string) => void
  webhookUrl?: string
}>(), {
  demoDelay: 1000,
  enableDemoMode: false,
  copyToClipboard: true,
})

// =============================================================================
// Vue component detection (equivalent to identifyElementWithReact)
// =============================================================================

function identifyElementWithVue(
  element: HTMLElement,
  reactMode: ReactComponentMode = 'filtered',
): {
  name: string
  elementName: string
  path: string
  reactComponents: string | null
} {
  const { name: elementName, path } = identifyElement(element)
  if (reactMode === 'off') {
    return { name: elementName, elementName, path, reactComponents: null }
  }
  const vueInfo = getComponentName(element, { mode: reactMode as any })
  return {
    name: vueInfo.path ? `${vueInfo.path} ${elementName}` : elementName,
    elementName,
    path,
    reactComponents: vueInfo.path,
  }
}

// =============================================================================
// Toolbar settings composable
// =============================================================================

const {
  settings,
  isDarkMode,
  showEntranceAnimation,
  mounted,
  toolbarPosition,
  isDraggingToolbar,
  dragStartPos,
  dragRotation,
  isLocalhost,
  pathname,
  getEffectiveReactMode,
  loadFromStorage,
  saveSettings,
  saveTheme,
  saveToolbarPosition,
  handleToolbarMouseDown,
  getJustFinishedToolbarDrag,
  setJustFinishedToolbarDrag,
} = useToolbarSettings()

// =============================================================================
// Core state
// =============================================================================

const isActive = ref(false)
const showMarkers = ref(true)
const scrollY = ref(0)
const isScrolling = ref(false)
const isFrozen = ref(false)
const showSettings = ref(false)
const showSettingsVisible = ref(false)
const settingsPage = ref<'main' | 'automations'>('main')
const isTransitioning = ref(false)
const tooltipsHidden = ref(false)
const copied = ref(false)
const sendState = ref<'idle' | 'sending' | 'sent' | 'failed'>('idle')
const cleared = ref(false)
const isClearing = ref(false)
const hoveredMarkerId = ref<string | null>(null)
const tooltipExitingId = ref<string | null>(null)
const hoveredTargetElement = ref<HTMLElement | null>(null)
const hoveredTargetElements = ref<HTMLElement[]>([])
const deletingMarkerId = ref<string | null>(null)
const renumberFrom = ref<number | null>(null)

// =============================================================================
// Drawing composable
// =============================================================================

const {
  isDrawMode,
  drawStrokes,
  hoveredDrawingIdx,
  drawCanvasRef,
  dimAmountRef,
  visualHighlightRef,
  exitingStrokeIdRef,
  exitingAlphaRef,
  drawStrokesRef,
  updateDrawStrokesRef,
  redrawCanvas,
  resizeCanvas,
  getIsDrawing,
  setIsDrawing,
  getCurrentStroke,
  setCurrentStroke,
} = useDrawing()

// Watch drawStrokes to keep the ref in sync
watch(drawStrokes, () => { updateDrawStrokesRef() }, { deep: true })

// =============================================================================
// Annotation state composable
// =============================================================================

const {
  pendingAnnotation,
  pendingExiting,
  editingAnnotation,
  editExiting,
  editingTargetElement,
  editingTargetElements,
  cancelPending,
  startEditing,
  cancelEditing,
  closeEditingForDelete,
  resetAll: resetAnnotationState,
} = useAnnotationState()

// =============================================================================
// Marker visibility composable
// =============================================================================

const {
  markersVisible,
  markersExiting,
  animatedMarkers,
  exitingMarkers,
  getShouldShowMarkers,
  updateVisibility,
} = useMarkerVisibility({
  isActive,
  showMarkers,
  annotations: ref([]) as any, // will be replaced
})

// =============================================================================
// Annotations state (manual, not composable, to keep control flow simple)
// =============================================================================

const annotations = ref<Annotation[]>([])
let annotationsSnapshot: Annotation[] = []

function updateAnnotationsSnapshot() {
  annotationsSnapshot = annotations.value
}
watch(annotations, updateAnnotationsSnapshot, { deep: true })

// Recently added marker ID
let recentlyAddedId: string | null = null

// =============================================================================
// Hover composable
// =============================================================================

const { hoverInfo, hoverPosition, setHover, clearHover } = useHover()

// =============================================================================
// Drag select composable
// =============================================================================

const dragSelect = useDragSelect()

// =============================================================================
// Multi-select composable
// =============================================================================

const multiSelect = useMultiSelect()

// =============================================================================
// Cursor styles composable
// =============================================================================

const { injectCursorStyles, removeCursorStyles, setDrawingHoverCursor } = useCursorStyles()

// =============================================================================
// Server sync composable
// =============================================================================

const {
  currentSessionId,
  connectionStatus,
  initSession,
  startHealthCheck,
  startEventSource,
  syncOnReconnect,
} = useServerSync({
  endpoint: props.endpoint,
  initialSessionId: props.sessionId,
  pathname,
  mounted,
  annotations,
  exitingMarkers,
  onSessionCreated: props.onSessionCreated,
})

// =============================================================================
// Popup refs
// =============================================================================

const popupRef = ref<InstanceType<typeof AnnotationPopup> | null>(null)
const editPopupRef = ref<InstanceType<typeof AnnotationPopup> | null>(null)
let scrollTimeoutId: ReturnType<typeof setTimeout> | null = null

// Drag rect / highlights container refs (for drag select)
const dragRectRef = ref<HTMLDivElement | null>(null)
const highlightsContainerRef = ref<HTMLDivElement | null>(null)

// =============================================================================
// Derived values
// =============================================================================

const effectiveReactMode = computed(() => getEffectiveReactMode())
const hasAnnotations = computed(() => annotations.value.length > 0)
const canSendViaEndpoint = computed(() => !!(props.endpoint && currentSessionId.value))
const shouldShowMarkers = computed(() => isActive.value && showMarkers.value)

const visibleAnnotations = computed(() =>
  annotations.value.filter((a) => !exitingMarkers.value.has(a.id)),
)
const exitingAnnotationsList = computed(() =>
  annotations.value.filter((a) => exitingMarkers.value.has(a.id)),
)

// =============================================================================
// Webhook firing
// =============================================================================

async function fireWebhook(
  event: string,
  payload: Record<string, unknown>,
  force?: boolean,
): Promise<boolean> {
  const targetUrl = settings.webhookUrl || props.webhookUrl
  if (!targetUrl || (!settings.webhooksEnabled && !force)) return false
  try {
    const response = await fetch(targetUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event,
        timestamp: Date.now(),
        url: typeof window !== 'undefined' ? window.location.href : undefined,
        ...payload,
      }),
    })
    return response.ok
  } catch (error) {
    console.warn('[Agentation] Webhook failed:', error)
    return false
  }
}

// =============================================================================
// Freeze animations
// =============================================================================

function freezeAnimations() {
  if (isFrozen.value) return
  freezeAll()
  isFrozen.value = true
}

function unfreezeAnimations() {
  if (!isFrozen.value) return
  unfreezeAll()
  isFrozen.value = false
}

function toggleFreeze() {
  if (isFrozen.value) unfreezeAnimations()
  else freezeAnimations()
}

// =============================================================================
// Tooltip management
// =============================================================================

function hideTooltipsUntilMouseLeave() {
  tooltipsHidden.value = true
}

function showTooltipsAgain() {
  tooltipsHidden.value = false
}

// =============================================================================
// Save annotations to localStorage
// =============================================================================

import {
  saveAnnotationsWithSyncMarker,
  getStorageKey,
} from '../utils/storage'
import {
  syncAnnotation,
  updateAnnotation as updateAnnotationOnServer,
  deleteAnnotation as deleteAnnotationFromServer,
  requestAction,
} from '../utils/sync'

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

// =============================================================================
// Add annotation
// =============================================================================

function addAnnotation(comment: string) {
  if (!pendingAnnotation.value) return

  const pa = pendingAnnotation.value
  const newAnnotation: Annotation = {
    id: Date.now().toString(),
    x: pa.x,
    y: pa.y,
    comment,
    element: pa.element,
    elementPath: pa.elementPath,
    timestamp: Date.now(),
    selectedText: pa.selectedText,
    boundingBox: pa.boundingBox,
    nearbyText: pa.nearbyText,
    cssClasses: pa.cssClasses,
    isMultiSelect: pa.isMultiSelect,
    isFixed: pa.isFixed,
    fullPath: pa.fullPath,
    accessibility: pa.accessibility,
    computedStyles: pa.computedStyles,
    nearbyElements: pa.nearbyElements,
    reactComponents: pa.reactComponents,
    elementBoundingBoxes: pa.elementBoundingBoxes,
    drawingIndex: pa.drawingIndex,
    strokeId: pa.strokeId,
    ...(props.endpoint && currentSessionId.value
      ? {
          sessionId: currentSessionId.value,
          url: typeof window !== 'undefined' ? window.location.href : undefined,
          status: 'pending' as const,
        }
      : {}),
  }

  annotations.value = [...annotations.value, newAnnotation]
  recentlyAddedId = newAnnotation.id
  originalSetTimeout(() => { recentlyAddedId = null }, 300)
  originalSetTimeout(() => {
    animatedMarkers.value = new Set(animatedMarkers.value).add(newAnnotation.id)
  }, 250)

  props.onAnnotationAdd?.(newAnnotation)
  fireWebhook('annotation.add', { annotation: newAnnotation })

  // Exit animation for pending
  pendingExiting.value = true
  originalSetTimeout(() => {
    pendingAnnotation.value = null
    pendingExiting.value = false
  }, 150)

  window.getSelection()?.removeAllRanges()

  // Sync to server
  if (props.endpoint && currentSessionId.value) {
    syncAnnotation(props.endpoint, currentSessionId.value, newAnnotation)
      .then((serverAnnotation) => {
        if (serverAnnotation.id !== newAnnotation.id) {
          annotations.value = annotations.value.map((a) =>
            a.id === newAnnotation.id ? { ...a, id: serverAnnotation.id } : a,
          )
          const next = new Set(animatedMarkers.value)
          next.delete(newAnnotation.id)
          next.add(serverAnnotation.id)
          animatedMarkers.value = next
        }
      })
      .catch((error) => {
        console.warn('[Agentation] Failed to sync annotation:', error)
      })
  }
}

// =============================================================================
// Cancel pending annotation
// =============================================================================

function cancelAnnotation() {
  const strokeId = pendingAnnotation.value?.strokeId
  pendingExiting.value = true

  // Fade linked stroke
  if (strokeId) {
    exitingStrokeIdRef.value = strokeId
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

  originalSetTimeout(() => {
    exitingStrokeIdRef.value = null
    if (strokeId) {
      const currentStrokes = drawStrokesRef.value
      const drawingIdx = currentStrokes.findIndex((s) => s.id === strokeId)
      if (drawingIdx >= 0) {
        drawStrokes.value = drawStrokes.value.filter((s) => s.id !== strokeId)
        annotations.value = annotations.value.map((a) =>
          a.drawingIndex != null && a.drawingIndex > drawingIdx
            ? { ...a, drawingIndex: a.drawingIndex - 1 }
            : a,
        )
      }
    }
    pendingAnnotation.value = null
    pendingExiting.value = false
  }, 150)
}

// =============================================================================
// Delete annotation
// =============================================================================

function deleteAnnotation(id: string) {
  const deletedIndex = annotationsSnapshot.findIndex((a) => a.id === id)
  const deletedAnnotation = annotationsSnapshot[deletedIndex]

  if (editingAnnotation.value?.id === id) {
    editExiting.value = true
    originalSetTimeout(() => {
      editingAnnotation.value = null
      editingTargetElement.value = null
      editingTargetElements.value = []
      editExiting.value = false
    }, 150)
  }

  deletingMarkerId.value = id
  exitingMarkers.value = new Set(exitingMarkers.value).add(id)

  if (deletedAnnotation) {
    props.onAnnotationDelete?.(deletedAnnotation)
    fireWebhook('annotation.delete', { annotation: deletedAnnotation })
  }

  if (props.endpoint) {
    deleteAnnotationFromServer(props.endpoint, id).catch((error) => {
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
    deletingMarkerId.value = null

    // Renumber animation
    const currentIndex = annotationsSnapshot.findIndex((a) => a.id === id)
    if (currentIndex >= 0 && currentIndex < annotationsSnapshot.length - 1) {
      renumberFrom.value = currentIndex
      originalSetTimeout(() => { renumberFrom.value = null }, 200)
    }
  }, 150)
}

// =============================================================================
// Dismiss annotation (designer confirms Claude's fix — removes marker)
// =============================================================================

function reworkAnnotation(id: string, appendedComment: string) {
  // Update local annotation: back to pending with appended comment
  annotations.value = annotations.value.map((a) =>
    a.id === id ? { ...a, status: 'pending' as const, comment: appendedComment } : a,
  )
  // Sync to server: PATCH back to pending with new comment (server re-queues to lastAction)
  if (canSendViaEndpoint.value) {
    updateAnnotationOnServer(props.endpoint!, id, {
      status: 'pending',
      comment: appendedComment,
    }).catch((error) => {
      console.error('[Markup] Failed to rework annotation on server — local and server state may diverge. Reload the page if the marker does not return to blue.', error)
    })
  }
}

function dismissAnnotation(id: string) {
  // Synchronously remove from localStorage NOW — don't wait for Vue watch
  // This ensures a page refresh can't reload the annotation before the async cleanup completes
  const currentStored = loadAnnotations<Annotation>(pathname)
  saveAnnotations(pathname, currentStored.filter((a) => a.id !== id))

  // Remove from local state with exit animation
  exitingMarkers.value = new Set(exitingMarkers.value).add(id)
  originalSetTimeout(() => {
    annotations.value = annotations.value.filter((a) => a.id !== id)
    const next = new Set(exitingMarkers.value)
    next.delete(id)
    exitingMarkers.value = next
  }, 150)

  // Best-effort PATCH to keep server state in sync (server also filters dismissed on reload)
  if (props.endpoint && currentSessionId.value) {
    updateAnnotationOnServer(props.endpoint, id, { status: 'dismissed' }).catch((error) => {
      console.warn('[Markup] Failed to dismiss annotation on server:', error)
    })
  }
}

// =============================================================================
// Update annotation
// =============================================================================

function updateAnnotation(newComment: string) {
  if (!editingAnnotation.value) return
  const updatedAnnotation = { ...editingAnnotation.value, comment: newComment }

  annotations.value = annotations.value.map((a) =>
    a.id === editingAnnotation.value!.id ? updatedAnnotation : a,
  )

  props.onAnnotationUpdate?.(updatedAnnotation)
  fireWebhook('annotation.update', { annotation: updatedAnnotation })

  if (props.endpoint) {
    updateAnnotationOnServer(props.endpoint, editingAnnotation.value.id, {
      comment: newComment,
    }).catch((error) => {
      console.warn('[Agentation] Failed to update annotation on server:', error)
    })
  }

  editExiting.value = true
  originalSetTimeout(() => {
    editingAnnotation.value = null
    editingTargetElement.value = null
    editingTargetElements.value = []
    editExiting.value = false
  }, 150)
}

// =============================================================================
// Start editing
// =============================================================================

function startEditAnnotation(annotation: Annotation) {
  editingAnnotation.value = annotation
  hoveredMarkerId.value = null
  hoveredTargetElement.value = null
  hoveredTargetElements.value = []

  if (annotation.elementBoundingBoxes?.length) {
    const elements: HTMLElement[] = []
    for (const bb of annotation.elementBoundingBoxes) {
      const centerX = bb.x + bb.width / 2
      const centerY = bb.y + bb.height / 2 - window.scrollY
      const el = deepElementFromPoint(centerX, centerY)
      if (el) elements.push(el)
    }
    editingTargetElements.value = elements
    editingTargetElement.value = null
  } else if (annotation.boundingBox) {
    const bb = annotation.boundingBox
    const centerX = bb.x + bb.width / 2
    const centerY = annotation.isFixed ? bb.y + bb.height / 2 : bb.y + bb.height / 2 - window.scrollY
    const el = deepElementFromPoint(centerX, centerY)
    if (el) {
      const elRect = el.getBoundingClientRect()
      const widthRatio = elRect.width / bb.width
      const heightRatio = elRect.height / bb.height
      editingTargetElement.value = (widthRatio < 0.5 || heightRatio < 0.5) ? null : el
    } else {
      editingTargetElement.value = null
    }
    editingTargetElements.value = []
  } else {
    editingTargetElement.value = null
    editingTargetElements.value = []
  }
}

// =============================================================================
// Cancel edit
// =============================================================================

function cancelEditAnnotation() {
  editExiting.value = true
  originalSetTimeout(() => {
    editingAnnotation.value = null
    editingTargetElement.value = null
    editingTargetElements.value = []
    editExiting.value = false
  }, 150)
}

// =============================================================================
// Clear all
// =============================================================================

function clearAll() {
  const count = annotations.value.length
  if (count === 0 && drawStrokes.value.length === 0) return

  props.onAnnotationsClear?.(annotations.value)
  fireWebhook('annotations.clear', { annotations: annotations.value })

  if (props.endpoint) {
    Promise.all(
      annotations.value.map((a) =>
        deleteAnnotationFromServer(props.endpoint!, a.id).catch((error) => {
          console.warn('[Agentation] Failed to delete annotation from server:', error)
        }),
      ),
    )
  }

  isClearing.value = true
  cleared.value = true

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
    isClearing.value = false
  }, totalAnimationTime)

  originalSetTimeout(() => { cleared.value = false }, 1500)
}

// =============================================================================
// Copy output
// =============================================================================

async function copyOutput() {
  const displayUrl =
    typeof window !== 'undefined'
      ? window.location.pathname + window.location.search + window.location.hash
      : pathname

  let output = generateOutput(annotations.value, displayUrl, settings.outputDetail, effectiveReactMode.value)
  if (!output && drawStrokes.value.length === 0) return
  if (!output) output = `## Page Feedback: ${displayUrl}\n`

  // Describe draw strokes as text
  if (drawStrokes.value.length > 0) {
    const linkedDrawingIndices = new Set<number>()
    for (const a of annotations.value) {
      if (a.drawingIndex != null) linkedDrawingIndices.add(a.drawingIndex)
    }

    const canvas = drawCanvasRef.value
    if (canvas) canvas.style.visibility = 'hidden'

    const strokeDescriptions: string[] = []
    const sv = window.scrollY

    for (let strokeIdx = 0; strokeIdx < drawStrokes.value.length; strokeIdx++) {
      if (linkedDrawingIndices.has(strokeIdx)) continue
      const stroke = drawStrokes.value[strokeIdx]
      if (stroke.points.length < 2) continue

      const viewportPoints = stroke.fixed
        ? stroke.points
        : stroke.points.map((p) => ({ x: p.x, y: p.y - sv }))

      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
      for (const p of viewportPoints) {
        minX = Math.min(minX, p.x); minY = Math.min(minY, p.y)
        maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y)
      }

      const gesture = classifyStrokeGesture(stroke.points, stroke.fixed)
      const sampleCount = Math.min(10, viewportPoints.length)
      const step = Math.max(1, Math.floor(viewportPoints.length / sampleCount))
      const seenElements = new Set<HTMLElement>()
      const elementNames: string[] = []
      const start = viewportPoints[0]
      const end = viewportPoints[viewportPoints.length - 1]

      const samplePoints = [start]
      for (let i = step; i < viewportPoints.length - 1; i += step) samplePoints.push(viewportPoints[i])
      samplePoints.push(end)

      for (const p of samplePoints) {
        const el = deepElementFromPoint(p.x, p.y)
        if (!el || seenElements.has(el)) continue
        if (closestCrossingShadow(el, '[data-feedback-toolbar]')) continue
        seenElements.add(el)
        const { name } = identifyElement(el)
        if (!elementNames.includes(name)) elementNames.push(name)
      }

      const region = `${Math.round(minX)},${Math.round(minY)} \u2192 ${Math.round(maxX)},${Math.round(maxY)}`
      let desc: string
      const g = gesture.toLowerCase()
      if ((g === 'circle' || g === 'box') && elementNames.length > 0) {
        const verb = g === 'box' ? 'Boxed' : 'Circled'
        desc = `${verb} **${elementNames[0]}**${elementNames.length > 1 ? ` (and ${elementNames.slice(1).join(', ')})` : ''} (region: ${region})`
      } else if (g === 'underline' && elementNames.length > 0) {
        desc = `Underlined **${elementNames[0]}** (${region})`
      } else if (g === 'arrow' && elementNames.length >= 2) {
        desc = `Arrow from **${elementNames[0]}** to **${elementNames[elementNames.length - 1]}** (${Math.round(start.x)},${Math.round(start.y)} \u2192 ${Math.round(end.x)},${Math.round(end.y)})`
      } else if (elementNames.length > 0) {
        desc = `${g === 'arrow' ? 'Arrow' : 'Drawing'} near **${elementNames.join('**, **')}** (region: ${region})`
      } else {
        desc = `Drawing at ${region}`
      }
      strokeDescriptions.push(desc)
    }

    if (canvas) canvas.style.visibility = ''

    if (strokeDescriptions.length > 0) {
      output += `\n**Drawings:**\n`
      strokeDescriptions.forEach((d, i) => { output += `${i + 1}. ${d}\n` })
    }
  }

  if (props.copyToClipboard) {
    try { await navigator.clipboard.writeText(output) } catch { /* ignore */ }
  }

  props.onCopy?.(output)
  copied.value = true
  originalSetTimeout(() => { copied.value = false }, 2000)

  if (settings.autoClearAfterCopy) {
    originalSetTimeout(() => clearAll(), 500)
  }
}

// =============================================================================
// Send to webhook
// =============================================================================

async function sendToWebhook() {
  const displayUrl =
    typeof window !== 'undefined'
      ? window.location.pathname + window.location.search + window.location.hash
      : pathname
  const output = generateOutput(annotations.value, displayUrl, settings.outputDetail, effectiveReactMode.value)
  if (!output) return

  if (props.onSubmit) {
    props.onSubmit(output, annotations.value)
  }

  sendState.value = 'sending'
  await new Promise((resolve) => originalSetTimeout(resolve, 150))

  // Fire via MCP endpoint (Markup companion server) if connected
  let endpointSuccess = false
  if (canSendViaEndpoint.value) {
    try {
      await requestAction(props.endpoint, currentSessionId.value, output)
      endpointSuccess = true
    } catch {
      endpointSuccess = false
    }
  }

  const webhookSuccess = await fireWebhook('submit', { output, annotations: annotations.value }, true)
  const success = endpointSuccess || webhookSuccess
  sendState.value = success ? 'sent' : 'failed'
  originalSetTimeout(() => { sendState.value = 'idle' }, 2500)

  // Only auto-clear in the webhook-only (copy-paste) flow.
  // When the MCP endpoint is connected, annotations stay visible so the designer
  // can see Claude's resolved markers and dismiss them manually.
  if (success && settings.autoClearAfterCopy && !canSendViaEndpoint.value) {
    originalSetTimeout(() => clearAll(), 500)
  }
}

// =============================================================================
// Handle marker hover
// =============================================================================

function handleMarkerHover(annotation: Annotation | null) {
  if (!annotation) {
    if (hoveredMarkerId.value) {
      tooltipExitingId.value = hoveredMarkerId.value
      originalSetTimeout(() => { tooltipExitingId.value = null }, 100)
    }
    hoveredMarkerId.value = null
    hoveredTargetElement.value = null
    hoveredTargetElements.value = []
    hoveredDrawingIdx.value = null
    return
  }

  tooltipExitingId.value = null
  hoveredMarkerId.value = annotation.id

  if (annotation.drawingIndex != null && annotation.drawingIndex < drawStrokes.value.length) {
    hoveredDrawingIdx.value = annotation.drawingIndex
  } else {
    hoveredDrawingIdx.value = null
  }

  if (annotation.elementBoundingBoxes?.length) {
    const elements: HTMLElement[] = []
    for (const bb of annotation.elementBoundingBoxes) {
      const centerX = bb.x + bb.width / 2
      const centerY = bb.y + bb.height / 2 - window.scrollY
      const allEls = document.elementsFromPoint(centerX, centerY)
      const el = allEls.find(
        (e) => !e.closest('[data-annotation-marker]') && !e.closest('[data-agentation-root]'),
      ) as HTMLElement | undefined
      if (el) elements.push(el)
    }
    hoveredTargetElements.value = elements
    hoveredTargetElement.value = null
  } else if (annotation.boundingBox) {
    const bb = annotation.boundingBox
    const centerX = bb.x + bb.width / 2
    const centerY = annotation.isFixed ? bb.y + bb.height / 2 : bb.y + bb.height / 2 - window.scrollY
    const el = deepElementFromPoint(centerX, centerY)
    if (el) {
      const elRect = el.getBoundingClientRect()
      const widthRatio = elRect.width / bb.width
      const heightRatio = elRect.height / bb.height
      hoveredTargetElement.value = (widthRatio < 0.5 || heightRatio < 0.5) ? null : el
    } else {
      hoveredTargetElement.value = null
    }
    hoveredTargetElements.value = []
  } else {
    hoveredTargetElement.value = null
    hoveredTargetElements.value = []
  }
}

// =============================================================================
// Multi-select: create pending annotation
// =============================================================================

function createMultiSelectPendingAnnotation() {
  const elements = multiSelect.pendingMultiSelectElements.value
  if (elements.length === 0) return

  const firstItem = elements[0]
  const firstEl = firstItem.element
  const isMulti = elements.length > 1

  const freshRects = elements.map((item) => item.element.getBoundingClientRect())

  if (!isMulti) {
    const rect = freshRects[0]
    const isFixed = isElementFixed(firstEl)
    pendingAnnotation.value = {
      x: (rect.left / window.innerWidth) * 100,
      y: isFixed ? rect.top : rect.top + window.scrollY,
      clientY: rect.top,
      element: firstItem.name,
      elementPath: firstItem.path,
      boundingBox: { x: rect.left, y: isFixed ? rect.top : rect.top + window.scrollY, width: rect.width, height: rect.height },
      isFixed,
      fullPath: getFullElementPath(firstEl),
      accessibility: getAccessibilityInfo(firstEl),
      computedStyles: getForensicComputedStyles(firstEl),
      computedStylesObj: getDetailedComputedStyles(firstEl),
      nearbyElements: getNearbyElements(firstEl),
      cssClasses: getElementClasses(firstEl),
      nearbyText: getNearbyText(firstEl),
      reactComponents: firstItem.reactComponents,
    }
  } else {
    const bounds = {
      left: Math.min(...freshRects.map((r) => r.left)),
      top: Math.min(...freshRects.map((r) => r.top)),
      right: Math.max(...freshRects.map((r) => r.right)),
      bottom: Math.max(...freshRects.map((r) => r.bottom)),
    }
    const names = elements.slice(0, 5).map((item) => item.name).join(', ')
    const suffix = elements.length > 5 ? ` +${elements.length - 5} more` : ''
    const elementBoundingBoxes = freshRects.map((rect) => ({
      x: rect.left, y: rect.top + window.scrollY, width: rect.width, height: rect.height,
    }))
    const lastItem = elements[elements.length - 1]
    const lastEl = lastItem.element
    const lastRect = freshRects[freshRects.length - 1]
    const lastCenterX = lastRect.left + lastRect.width / 2
    const lastCenterY = lastRect.top + lastRect.height / 2
    const lastIsFixed = isElementFixed(lastEl)

    pendingAnnotation.value = {
      x: (lastCenterX / window.innerWidth) * 100,
      y: lastIsFixed ? lastCenterY : lastCenterY + window.scrollY,
      clientY: lastCenterY,
      element: `${elements.length} elements: ${names}${suffix}`,
      elementPath: 'multi-select',
      boundingBox: { x: bounds.left, y: bounds.top + window.scrollY, width: bounds.right - bounds.left, height: bounds.bottom - bounds.top },
      isMultiSelect: true,
      isFixed: lastIsFixed,
      elementBoundingBoxes,
      multiSelectElements: elements.map((item) => item.element),
      targetElement: lastEl,
      fullPath: getFullElementPath(firstEl),
      accessibility: getAccessibilityInfo(firstEl),
      computedStyles: getForensicComputedStyles(firstEl),
      computedStylesObj: getDetailedComputedStyles(firstEl),
      nearbyElements: getNearbyElements(firstEl),
      cssClasses: getElementClasses(firstEl),
      nearbyText: getNearbyText(firstEl),
    }
  }

  multiSelect.clear()
  clearHover()
}

// =============================================================================
// Keyboard shortcuts
// =============================================================================

const { handleKeyDown } = useKeyboardShortcuts({
  isActive,
  isDrawMode,
  pendingAnnotation: pendingAnnotation as any,
  annotationsLength: () => annotations.value.length,
  drawStrokesLength: () => drawStrokes.value.length,
  settingsWebhookUrl: () => settings.webhookUrl,
  webhookUrl: props.webhookUrl,
  sendState,
  onToggleActive: () => { isActive.value = !isActive.value },
  onToggleFreeze: toggleFreeze,
  onToggleDrawMode: () => { isDrawMode.value = !isDrawMode.value },
  onToggleMarkers: () => {
    showMarkers.value = !showMarkers.value
    if (isDrawMode.value) isDrawMode.value = false
  },
  onCopy: copyOutput,
  onClear: clearAll,
  onSend: sendToWebhook,
  onUndoStroke: () => {
    drawStrokes.value = drawStrokes.value.slice(0, -1)
    const canvas = drawCanvasRef.value
    if (canvas) {
      const ctx = canvas.getContext('2d')
      if (ctx) redrawCanvas(ctx, drawStrokes.value)
    }
  },
  onEscapeDrawMode: () => { isDrawMode.value = false },
  onClearMultiSelect: () => multiSelect.clear(),
  pendingMultiSelectLength: () => multiSelect.pendingMultiSelectElements.value.length,
  hideTooltips: hideTooltipsUntilMouseLeave,
})

// =============================================================================
// Watchers and lifecycle
// =============================================================================

// Settings panel show/hide
watch(showSettings, (val) => {
  if (val) {
    showSettingsVisible.value = true
  } else {
    tooltipsHidden.value = false
    settingsPage.value = 'main'
    const timer = originalSetTimeout(() => { showSettingsVisible.value = false }, 0)
  }
})

// Settings page transitions
watch(settingsPage, () => {
  isTransitioning.value = true
  const timer = originalSetTimeout(() => { isTransitioning.value = false }, 350)
})

// Marker visibility
watch([shouldShowMarkers, annotations], () => {
  // Re-initialize marker visibility with correct annotations ref
  const shouldShow = shouldShowMarkers.value
  if (shouldShow) {
    markersExiting.value = false
    markersVisible.value = true
    animatedMarkers.value = new Set()
    const enterMaxDelay = Math.max(0, annotations.value.length - 1) * 20
    originalSetTimeout(() => {
      const newSet = new Set(animatedMarkers.value)
      annotations.value.forEach((a) => newSet.add(a.id))
      animatedMarkers.value = newSet
    }, enterMaxDelay + 250 + 50)
  } else if (markersVisible.value) {
    markersExiting.value = true
    const maxDelay = Math.max(0, annotations.value.length - 1) * 20
    originalSetTimeout(() => {
      markersVisible.value = false
      markersExiting.value = false
    }, maxDelay + 200 + 50)
  }
}, { immediate: true })

// Save annotations when they change
watch(annotations, persistAnnotations, { deep: true })

// Save settings
watch(() => ({ ...settings }), saveSettings, { deep: true })

// Save theme
watch(isDarkMode, saveTheme)

// Save toolbar position when drag ends
let prevDragging = false
watch(isDraggingToolbar, (val) => {
  if (prevDragging && !val && toolbarPosition.value && mounted.value) {
    saveToolbarPosition()
  }
  prevDragging = val
})

// Reset when deactivating
watch(isActive, (val) => {
  if (!val) {
    pendingAnnotation.value = null
    editingAnnotation.value = null
    editingTargetElement.value = null
    editingTargetElements.value = []
    hoverInfo.value = null
    showSettings.value = false
    multiSelect.clear()
    multiSelect.resetModifiers()
    isDrawMode.value = false
    if (isFrozen.value) unfreezeAnimations()
  }
})

// Cursor styles
watch(isActive, (val) => {
  if (val) injectCursorStyles()
  else removeCursorStyles()
})

// Drawing hover cursor
watch(hoveredDrawingIdx, (val) => {
  setDrawingHoverCursor(val !== null && isActive.value)
})

// Scroll tracking
function handleScroll() {
  scrollY.value = window.scrollY
  isScrolling.value = true
  if (scrollTimeoutId) clearTimeout(scrollTimeoutId)
  scrollTimeoutId = originalSetTimeout(() => { isScrolling.value = false }, 150)
}

// Mouse move (hover detection)
function handleMouseMove(e: MouseEvent) {
  if (!isActive.value || pendingAnnotation.value || isDrawMode.value) return

  const target = (e.composedPath()[0] || e.target) as HTMLElement
  if (closestCrossingShadow(target, '[data-feedback-toolbar]')) {
    clearHover()
    if (!target.closest('[data-annotation-marker]')) hoveredDrawingIdx.value = null
    return
  }

  if (drawStrokes.value.length > 0) {
    const strokeIdx = findStrokeAtPoint(e.clientX, e.clientY, drawStrokes.value)
    if (strokeIdx !== null) {
      hoveredDrawingIdx.value = strokeIdx
      clearHover()
      return
    }
  }
  hoveredDrawingIdx.value = null

  const elementUnder = deepElementFromPoint(e.clientX, e.clientY)
  if (!elementUnder || closestCrossingShadow(elementUnder, '[data-feedback-toolbar]')) {
    clearHover()
    return
  }

  const { name, elementName, path, reactComponents } = identifyElementWithVue(elementUnder, effectiveReactMode.value)
  const rect = elementUnder.getBoundingClientRect()
  setHover(
    { element: name, elementName, elementPath: path, rect, reactComponents },
    { x: e.clientX, y: e.clientY },
  )
}

// Click handler
function handleClick(e: MouseEvent) {
  if (!isActive.value || isDrawMode.value) return

  if (dragSelect.getJustFinishedDrag()) {
    dragSelect.setJustFinishedDrag(false)
    return
  }

  const target = (e.composedPath()[0] || e.target) as HTMLElement
  if (closestCrossingShadow(target, '[data-feedback-toolbar]')) return
  if (closestCrossingShadow(target, '[data-annotation-popup]')) return
  if (closestCrossingShadow(target, '[data-annotation-marker]')) return

  // Click on drawing stroke
  if (drawStrokes.value.length > 0 && !pendingAnnotation.value && !editingAnnotation.value) {
    const strokeIdx = findStrokeAtPoint(e.clientX, e.clientY, drawStrokes.value)
    if (strokeIdx !== null) {
      e.preventDefault()
      e.stopPropagation()

      const existingAnnotation = annotations.value.find(
        (a) => a.strokeId === drawStrokes.value[strokeIdx]?.id || a.drawingIndex === strokeIdx,
      )
      if (existingAnnotation) {
        startEditAnnotation(existingAnnotation)
        return
      }

      const stroke = drawStrokes.value[strokeIdx]
      const scrollYNow = window.scrollY
      const canvas = drawCanvasRef.value
      if (canvas) canvas.style.visibility = 'hidden'
      const elementUnder = deepElementFromPoint(e.clientX, e.clientY)
      if (canvas) canvas.style.visibility = ''

      const gestureShape = classifyStrokeGesture(stroke.points, stroke.fixed)
      let name = `Drawing: ${gestureShape}`
      let path = ''
      let reactComponents: string | null = null
      let nearbyText: string | undefined
      let cssClasses: string | undefined
      let fullPath: string | undefined
      let accessibility: string | undefined
      let computedStylesStr: string | undefined
      let computedStylesObj: Record<string, string> | undefined
      let nearbyElements: string | undefined
      let elIsFixed = stroke.fixed
      let boundingBox: { x: number; y: number; width: number; height: number } | undefined

      if (elementUnder) {
        const info = identifyElementWithVue(elementUnder, effectiveReactMode.value)
        name = `Drawing: ${gestureShape} \u2192 ${info.name}`
        path = info.path
        reactComponents = info.reactComponents
        nearbyText = getNearbyText(elementUnder)
        cssClasses = getElementClasses(elementUnder)
        fullPath = getFullElementPath(elementUnder)
        accessibility = getAccessibilityInfo(elementUnder)
        computedStylesStr = getForensicComputedStyles(elementUnder)
        computedStylesObj = getDetailedComputedStyles(elementUnder)
        nearbyElements = getNearbyElements(elementUnder)
        const rect = elementUnder.getBoundingClientRect()
        boundingBox = { x: rect.left, y: elIsFixed ? rect.top : rect.top + scrollYNow, width: rect.width, height: rect.height }
      }

      pendingAnnotation.value = {
        x: (e.clientX / window.innerWidth) * 100,
        y: elIsFixed ? e.clientY : e.clientY + scrollYNow,
        clientY: e.clientY, element: name, elementPath: path, boundingBox, nearbyText,
        cssClasses, isFixed: elIsFixed, fullPath, accessibility, computedStyles: computedStylesStr,
        computedStylesObj, nearbyElements, reactComponents: reactComponents ?? undefined,
        targetElement: elementUnder ?? undefined, drawingIndex: strokeIdx, strokeId: stroke.id,
      }
      clearHover()
      hoveredDrawingIdx.value = null
      return
    }
  }

  // Cmd+shift+click multi-select
  if (e.metaKey && e.shiftKey && !pendingAnnotation.value && !editingAnnotation.value) {
    e.preventDefault()
    e.stopPropagation()
    const elementUnder = deepElementFromPoint(e.clientX, e.clientY)
    if (!elementUnder) return
    const rect = elementUnder.getBoundingClientRect()
    const { name, path, reactComponents } = identifyElementWithVue(elementUnder, effectiveReactMode.value)
    multiSelect.toggleElement(elementUnder, { element: elementUnder, rect, name, path, reactComponents: reactComponents ?? undefined })
    return
  }

  const isInteractive = closestCrossingShadow(target, 'button, a, input, select, textarea, [role=\'button\'], [onclick]')
  if (settings.blockInteractions && isInteractive) {
    e.preventDefault()
    e.stopPropagation()
  }

  if (pendingAnnotation.value) {
    if (isInteractive && !settings.blockInteractions) return
    e.preventDefault()
    popupRef.value?.shake()
    return
  }

  if (editingAnnotation.value) {
    if (isInteractive && !settings.blockInteractions) return
    e.preventDefault()
    editPopupRef.value?.shake()
    return
  }

  e.preventDefault()

  const elementUnder = deepElementFromPoint(e.clientX, e.clientY)
  if (!elementUnder) return

  const { name, path, reactComponents } = identifyElementWithVue(elementUnder, effectiveReactMode.value)
  const rect = elementUnder.getBoundingClientRect()
  const x = (e.clientX / window.innerWidth) * 100
  const isFixed = isElementFixed(elementUnder)
  const y = isFixed ? e.clientY : e.clientY + window.scrollY

  const selection = window.getSelection()
  let selectedText: string | undefined
  if (selection && selection.toString().trim().length > 0) {
    selectedText = selection.toString().trim().slice(0, 500)
  }

  pendingAnnotation.value = {
    x, y, clientY: e.clientY, element: name, elementPath: path, selectedText,
    boundingBox: { x: rect.left, y: isFixed ? rect.top : rect.top + window.scrollY, width: rect.width, height: rect.height },
    nearbyText: getNearbyText(elementUnder), cssClasses: getElementClasses(elementUnder),
    isFixed, fullPath: getFullElementPath(elementUnder), accessibility: getAccessibilityInfo(elementUnder),
    computedStyles: getForensicComputedStyles(elementUnder), computedStylesObj: getDetailedComputedStyles(elementUnder),
    nearbyElements: getNearbyElements(elementUnder), reactComponents: reactComponents ?? undefined,
    targetElement: elementUnder,
  }
  clearHover()
}

// Cmd+shift modifier tracking
function handleModifierKeyDown(e: KeyboardEvent) {
  if (e.key === 'Meta') multiSelect.modifiersHeld.cmd = true
  if (e.key === 'Shift') multiSelect.modifiersHeld.shift = true
}

function handleModifierKeyUp(e: KeyboardEvent) {
  const wasHoldingBoth = multiSelect.modifiersHeld.cmd && multiSelect.modifiersHeld.shift
  if (e.key === 'Meta') multiSelect.modifiersHeld.cmd = false
  if (e.key === 'Shift') multiSelect.modifiersHeld.shift = false
  const nowHoldingBoth = multiSelect.modifiersHeld.cmd && multiSelect.modifiersHeld.shift

  if (wasHoldingBoth && !nowHoldingBoth && multiSelect.pendingMultiSelectElements.value.length > 0) {
    createMultiSelectPendingAnnotation()
  }
}

function handleWindowBlur() {
  multiSelect.resetModifiers()
  multiSelect.clear()
}

// Drag select mousedown
function handleDragMouseDown(e: MouseEvent) {
  if (!isActive.value || pendingAnnotation.value || isDrawMode.value) return
  dragSelect.handleMouseDown(e)
}

// Drag select mousemove
function handleDragMouseMove(e: MouseEvent) {
  if (!isActive.value || pendingAnnotation.value) return
  dragSelect.handleMouseMove(e)
}

// Drag select mouseup
function handleDragMouseUp(e: MouseEvent) {
  if (!isActive.value) return
  const result = dragSelect.handleMouseUp(e)
  if (!result) return

  if (result.finalElements.length > 0) {
    const bounds = result.finalElements.reduce(
      (acc, { rect }) => ({
        left: Math.min(acc.left, rect.left), top: Math.min(acc.top, rect.top),
        right: Math.max(acc.right, rect.right), bottom: Math.max(acc.bottom, rect.bottom),
      }),
      { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity },
    )
    const elementNames = result.finalElements.slice(0, 5).map(({ element }) => identifyElement(element).name).join(', ')
    const suffix = result.finalElements.length > 5 ? ` +${result.finalElements.length - 5} more` : ''
    const firstElement = result.finalElements[0].element

    pendingAnnotation.value = {
      x: result.x, y: result.y, clientY: e.clientY,
      element: `${result.finalElements.length} elements: ${elementNames}${suffix}`,
      elementPath: 'multi-select',
      boundingBox: { x: bounds.left, y: bounds.top + window.scrollY, width: bounds.right - bounds.left, height: bounds.bottom - bounds.top },
      isMultiSelect: true,
      fullPath: getFullElementPath(firstElement), accessibility: getAccessibilityInfo(firstElement),
      computedStyles: getForensicComputedStyles(firstElement), computedStylesObj: getDetailedComputedStyles(firstElement),
      nearbyElements: getNearbyElements(firstElement), cssClasses: getElementClasses(firstElement),
      nearbyText: getNearbyText(firstElement),
    }
  } else {
    const width = Math.abs(result.right - result.left)
    const height = Math.abs(result.bottom - result.top)
    if (width > 20 && height > 20) {
      pendingAnnotation.value = {
        x: result.x, y: result.y, clientY: e.clientY,
        element: 'Area selection',
        elementPath: `region at (${Math.round(result.left)}, ${Math.round(result.top)})`,
        boundingBox: { x: result.left, y: result.top + window.scrollY, width, height },
        isMultiSelect: true,
      }
    }
  }
  clearHover()
}

// Toolbar dragging
function handleToolbarDragMove(e: MouseEvent) {
  if (!dragStartPos.value) return
  const DRAG_THRESHOLD = 10
  const deltaX = e.clientX - dragStartPos.value.x
  const deltaY = e.clientY - dragStartPos.value.y
  const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY)

  if (!isDraggingToolbar.value && distance > DRAG_THRESHOLD) {
    isDraggingToolbar.value = true
  }

  if (isDraggingToolbar.value || distance > DRAG_THRESHOLD) {
    let newX = dragStartPos.value.toolbarX + deltaX
    let newY = dragStartPos.value.toolbarY + deltaY
    const padding = 20
    const wrapperWidth = 337
    const toolbarHeight = 44
    const contentWidth = isActive.value ? (connectionStatus.value === 'connected' ? 337 : 297) : 44
    const contentOffset = wrapperWidth - contentWidth
    const minX = padding - contentOffset
    const maxX = window.innerWidth - padding - wrapperWidth
    newX = Math.max(minX, Math.min(maxX, newX))
    newY = Math.max(padding, Math.min(window.innerHeight - toolbarHeight - padding, newY))
    toolbarPosition.value = { x: newX, y: newY }
  }
}

function handleToolbarDragEnd() {
  if (isDraggingToolbar.value) {
    setJustFinishedToolbarDrag(true)
  }
  isDraggingToolbar.value = false
  dragStartPos.value = null
}

// Draw mode canvas events
let drawClickStart: { x: number; y: number; strokeIdx: number | null } | null = null

function setupDrawCanvasListeners() {
  const canvas = drawCanvasRef.value
  if (!canvas) return () => {}
  const ctx = canvas.getContext('2d')
  if (!ctx) return () => {}
  const dpr = window.devicePixelRatio || 1

  const onMouseDown = (e: MouseEvent) => {
    if (pendingAnnotation.value) { popupRef.value?.shake(); return }
    if (editingAnnotation.value) { editPopupRef.value?.shake(); return }
    const strokeIdx = findStrokeAtPoint(e.clientX, e.clientY, drawStrokes.value)
    drawClickStart = { x: e.clientX, y: e.clientY, strokeIdx }
    setIsDrawing(true)
    setCurrentStroke([{ x: e.clientX, y: e.clientY }])
    ctx.save()
    ctx.scale(dpr, dpr)
    ctx.beginPath()
    ctx.strokeStyle = settings.annotationColor
    ctx.lineWidth = 3
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.moveTo(e.clientX, e.clientY)
  }

  const onMouseMove = (e: MouseEvent) => {
    if (!getIsDrawing()) {
      const strokeIdx = findStrokeAtPoint(e.clientX, e.clientY, drawStrokes.value)
      hoveredDrawingIdx.value = strokeIdx
      if (strokeIdx !== null) canvas.setAttribute('data-stroke-hover', '')
      else canvas.removeAttribute('data-stroke-hover')
      return
    }
    const point = { x: e.clientX, y: e.clientY }
    const stroke = getCurrentStroke()
    const prev = stroke[stroke.length - 1]
    if (Math.hypot(point.x - prev.x, point.y - prev.y) < 2) return
    stroke.push(point)
    const midX = (prev.x + point.x) / 2
    const midY = (prev.y + point.y) / 2
    ctx.quadraticCurveTo(prev.x, prev.y, midX, midY)
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(midX, midY)
  }

  const onMouseUp = (e: MouseEvent) => {
    if (!getIsDrawing()) return
    setIsDrawing(false)
    ctx.restore()
    const pts = getCurrentStroke()

    // Detect click on existing stroke
    if (drawClickStart && drawClickStart.strokeIdx !== null && pts.length <= 3) {
      const movedDist = Math.hypot(e.clientX - drawClickStart.x, e.clientY - drawClickStart.y)
      if (movedDist < 5) {
        setCurrentStroke([])
        drawClickStart = null
        redrawCanvas(ctx, drawStrokes.value, drawClickStart?.strokeIdx ?? null, dimAmountRef.value)
        // Open annotation for the stroke -- same as in React source
        // (Omitting for brevity since main click handler covers this case too)
        return
      }
    }
    drawClickStart = null

    if (pts.length > 1) {
      canvas.style.visibility = 'hidden'
      const isElFixed = (el: HTMLElement): boolean => {
        let node: HTMLElement | null = el
        while (node && node !== document.documentElement) {
          const pos = getComputedStyle(node).position
          if (pos === 'fixed' || pos === 'sticky') return true
          node = node.parentElement
        }
        return false
      }

      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
      for (const p of pts) { minX = Math.min(minX, p.x); minY = Math.min(minY, p.y); maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y) }
      const centerX = (minX + maxX) / 2
      const centerY = (minY + maxY) / 2
      const centerEl = deepElementFromPoint(centerX, centerY)
      let isFixed = centerEl ? isElFixed(centerEl) : false

      if (!isFixed) {
        let fixedCount = 0, totalSampled = 0
        const sampleCount = Math.min(6, pts.length)
        const step = Math.max(1, Math.floor(pts.length / sampleCount))
        for (let i = 0; i < pts.length; i += step) {
          const el = deepElementFromPoint(pts[i].x, pts[i].y)
          if (!el) continue
          totalSampled++
          if (isElFixed(el)) fixedCount++
        }
        if (totalSampled > 0 && fixedCount > totalSampled * 0.6) isFixed = true
      }

      const finalPoints = isFixed ? [...pts] : pts.map((p) => ({ x: p.x, y: p.y + window.scrollY }))
      const newStrokeId = crypto.randomUUID()
      const newStroke: DrawStroke = { id: newStrokeId, points: finalPoints, color: settings.annotationColor, fixed: isFixed }

      const gestureShape = classifyStrokeGesture(finalPoints, isFixed)
      let name = `Drawing: ${gestureShape}`
      let elPath = ''
      let reactComponents: string | null = null
      let nearbyText: string | undefined
      let cssClasses: string | undefined
      let fullPath: string | undefined
      let accessibility: string | undefined
      let computedStylesStr: string | undefined
      let computedStylesObj: Record<string, string> | undefined
      let nearbyElements: string | undefined
      let boundingBox: { x: number; y: number; width: number; height: number } | undefined

      if (centerEl) {
        const info = identifyElementWithVue(centerEl, effectiveReactMode.value)
        name = `Drawing: ${gestureShape} \u2192 ${info.name}`
        elPath = info.path; reactComponents = info.reactComponents
        nearbyText = getNearbyText(centerEl); cssClasses = getElementClasses(centerEl)
        fullPath = getFullElementPath(centerEl); accessibility = getAccessibilityInfo(centerEl)
        computedStylesStr = getForensicComputedStyles(centerEl); computedStylesObj = getDetailedComputedStyles(centerEl)
        nearbyElements = getNearbyElements(centerEl)
        const rect = centerEl.getBoundingClientRect()
        boundingBox = { x: rect.left, y: isFixed ? rect.top : rect.top + window.scrollY, width: rect.width, height: rect.height }
      }

      canvas.style.visibility = ''
      const newStrokeIdx = drawStrokes.value.length
      drawStrokes.value = [...drawStrokes.value, newStroke]

      const lastPt = finalPoints[finalPoints.length - 1]
      const lastPtViewY = isFixed ? lastPt.y : lastPt.y - window.scrollY

      pendingAnnotation.value = {
        x: (lastPt.x / window.innerWidth) * 100, y: lastPt.y, clientY: lastPtViewY,
        element: name, elementPath: elPath, boundingBox, nearbyText, cssClasses,
        isFixed, fullPath, accessibility, computedStyles: computedStylesStr, computedStylesObj,
        nearbyElements, reactComponents: reactComponents ?? undefined,
        targetElement: centerEl ?? undefined, drawingIndex: newStrokeIdx, strokeId: newStrokeId,
      }
      clearHover()
    }
    setCurrentStroke([])
  }

  const onMouseLeave = () => {
    hoveredDrawingIdx.value = null
    canvas.removeAttribute('data-stroke-hover')
  }

  canvas.addEventListener('mousedown', onMouseDown)
  canvas.addEventListener('mousemove', onMouseMove)
  canvas.addEventListener('mouseup', onMouseUp)
  canvas.addEventListener('mouseleave', onMouseLeave)

  return () => {
    canvas.removeEventListener('mousedown', onMouseDown)
    canvas.removeEventListener('mousemove', onMouseMove)
    canvas.removeEventListener('mouseup', onMouseUp)
    canvas.removeEventListener('mouseleave', onMouseLeave)
  }
}

// Draw canvas: resize + scroll redraw
let cleanupDrawListeners: (() => void) | null = null

// === Server sync cleanup — hoisted so onUnmounted can reach them ===
let cleanupHealth: (() => void) | undefined
let cleanupEvents: (() => void) | undefined
let stopSessionWatch: (() => void) | undefined
let stopConnectionWatch: (() => void) | undefined

// Named handler refs for anonymous event listeners that must be removed on unmount
const _resizeCanvasHandler = () => resizeCanvas()
const _scrollCanvasHandler = () => {
  const canvas = drawCanvasRef.value
  if (!canvas || !isActive.value) return
  const ctx = canvas.getContext('2d')
  if (ctx) redrawCanvas(ctx, drawStrokes.value, visualHighlightRef.value, dimAmountRef.value)
}
const _toolbarDragMoveHandler = (e: MouseEvent) => handleToolbarDragMove(e)
const _toolbarDragEndHandler = () => handleToolbarDragEnd()

watch([isDrawMode, isActive], () => {
  if (cleanupDrawListeners) { cleanupDrawListeners(); cleanupDrawListeners = null }
  if (isDrawMode.value && isActive.value) {
    nextTick(() => {
      cleanupDrawListeners = setupDrawCanvasListeners()
    })
  }
})

// Canvas resize/scroll
watch([isActive, drawStrokes], () => {
  if (!isActive.value) return
  nextTick(() => resizeCanvas())
}, { deep: true })

// Dim animation for drawing hover
watch(
  [() => hoveredDrawingIdx.value, () => pendingAnnotation.value?.drawingIndex, () => editingAnnotation.value?.drawingIndex, drawStrokes],
  () => {
    const canvas = drawCanvasRef.value
    if (!canvas || !isActive.value || drawStrokes.value.length === 0) return

    const effectiveHighlight = hoveredDrawingIdx.value ?? pendingAnnotation.value?.drawingIndex ?? editingAnnotation.value?.drawingIndex ?? null
    const targetDim = effectiveHighlight != null ? 1 : 0

    if (effectiveHighlight != null) visualHighlightRef.value = effectiveHighlight

    if (Math.abs(dimAmountRef.value - targetDim) < 0.01) {
      dimAmountRef.value = targetDim
      if (targetDim === 0) visualHighlightRef.value = null
      const ctx = canvas.getContext('2d')
      if (ctx) redrawCanvas(ctx, drawStrokes.value, visualHighlightRef.value, targetDim)
      return
    }

    let raf: number
    const animate = () => {
      const diff = targetDim - dimAmountRef.value
      if (Math.abs(diff) < 0.01) {
        dimAmountRef.value = targetDim
        if (targetDim === 0) visualHighlightRef.value = null
      } else {
        dimAmountRef.value += diff * 0.25
      }
      const ctx = canvas.getContext('2d')
      if (ctx) redrawCanvas(ctx, drawStrokes.value, visualHighlightRef.value, dimAmountRef.value)
      if (Math.abs(dimAmountRef.value - targetDim) > 0.01) raf = requestAnimationFrame(animate)
    }
    raf = requestAnimationFrame(animate)
  },
  { deep: true },
)

// Constrain toolbar position on resize
function constrainPosition() {
  if (!toolbarPosition.value) return
  const padding = 20
  const wrapperWidth = 337
  const toolbarHeight = 44
  const contentWidth = isActive.value ? (connectionStatus.value === 'connected' ? 297 : 257) : 44
  const contentOffset = wrapperWidth - contentWidth
  const minX = padding - contentOffset
  const maxX = window.innerWidth - padding - wrapperWidth
  let newX = Math.max(minX, Math.min(maxX, toolbarPosition.value.x))
  let newY = Math.max(padding, Math.min(window.innerHeight - toolbarHeight - padding, toolbarPosition.value.y))
  if (newX !== toolbarPosition.value.x || newY !== toolbarPosition.value.y) {
    toolbarPosition.value = { x: newX, y: newY }
  }
}

watch([toolbarPosition, isActive, connectionStatus], constrainPosition)

// =============================================================================
// Lifecycle
// =============================================================================

onMounted(() => {
  loadFromStorage()
  scrollY.value = window.scrollY
  const stored = loadAnnotations<Annotation>(pathname)
  annotations.value = stored

  // Listeners
  window.addEventListener('scroll', handleScroll, { passive: true })
  document.addEventListener('mousemove', handleMouseMove)
  document.addEventListener('click', handleClick, true)
  document.addEventListener('keydown', handleKeyDown)
  document.addEventListener('keydown', handleModifierKeyDown)
  document.addEventListener('keyup', handleModifierKeyUp)
  window.addEventListener('blur', handleWindowBlur)
  document.addEventListener('mousedown', handleDragMouseDown)
  document.addEventListener('mousemove', handleDragMouseMove, { passive: true })
  document.addEventListener('mouseup', handleDragMouseUp)
  window.addEventListener('resize', constrainPosition)

  // Toolbar drag listeners (use hoisted refs so onUnmounted can remove them)
  document.addEventListener('mousemove', _toolbarDragMoveHandler)
  document.addEventListener('mouseup', _toolbarDragEndHandler)
  window.addEventListener('resize', _resizeCanvasHandler)
  window.addEventListener('scroll', _scrollCanvasHandler, { passive: true })

  // Server sync (assign to hoisted refs so onUnmounted can clean up)
  initSession()
  cleanupHealth = startHealthCheck()

  // startEventSource requires currentSessionId to be set (async from initSession).
  // Watch for it and start SSE once the session is established.
  stopSessionWatch = watch(currentSessionId, (id) => {
    if (id && !cleanupEvents) {
      cleanupEvents = startEventSource() ?? undefined
    }
  }, { immediate: true })

  // Watch connection status for reconnect sync (stop handle stored for cleanup)
  stopConnectionWatch = watch(connectionStatus, () => syncOnReconnect())

  // Demo annotations
  if (props.enableDemoMode && props.demoAnnotations && props.demoAnnotations.length > 0 && annotations.value.length === 0) {
    const timeoutIds: ReturnType<typeof setTimeout>[] = []
    timeoutIds.push(originalSetTimeout(() => { isActive.value = true }, props.demoDelay - 200))
    props.demoAnnotations.forEach((demo, index) => {
      const annotationDelay = props.demoDelay + index * 300
      timeoutIds.push(originalSetTimeout(() => {
        const element = document.querySelector(demo.selector) as HTMLElement
        if (!element) return
        const rect = element.getBoundingClientRect()
        const { name, path } = identifyElement(element)
        const newAnnotation: Annotation = {
          id: `demo-${Date.now()}-${index}`,
          x: ((rect.left + rect.width / 2) / window.innerWidth) * 100,
          y: rect.top + rect.height / 2 + window.scrollY,
          comment: demo.comment, element: name, elementPath: path,
          timestamp: Date.now(), selectedText: demo.selectedText,
          boundingBox: { x: rect.left, y: rect.top + window.scrollY, width: rect.width, height: rect.height },
          nearbyText: getNearbyText(element), cssClasses: getElementClasses(element),
        }
        annotations.value = [...annotations.value, newAnnotation]
      }, annotationDelay))
    })
  }
})

onUnmounted(() => {
  window.removeEventListener('scroll', handleScroll)
  document.removeEventListener('mousemove', handleMouseMove)
  document.removeEventListener('click', handleClick, true)
  document.removeEventListener('keydown', handleKeyDown)
  document.removeEventListener('keydown', handleModifierKeyDown)
  document.removeEventListener('keyup', handleModifierKeyUp)
  window.removeEventListener('blur', handleWindowBlur)
  document.removeEventListener('mousedown', handleDragMouseDown)
  document.removeEventListener('mouseup', handleDragMouseUp)
  window.removeEventListener('resize', constrainPosition)
  window.removeEventListener('resize', _resizeCanvasHandler)
  window.removeEventListener('scroll', _scrollCanvasHandler)
  document.removeEventListener('mousemove', _toolbarDragMoveHandler)
  document.removeEventListener('mouseup', _toolbarDragEndHandler)
  if (scrollTimeoutId) clearTimeout(scrollTimeoutId)
  if (cleanupDrawListeners) cleanupDrawListeners()
  cleanupHealth?.()
  stopSessionWatch?.()
  cleanupEvents?.()
  stopConnectionWatch?.()
  removeCursorStyles()
  unfreezeAll()
})

// =============================================================================
// Helpers for popup positioning
// =============================================================================

function getPopupStyle(markerX: number, markerY: number) {
  return {
    left: Math.max(160, Math.min(window.innerWidth - 160, (markerX / 100) * window.innerWidth)) + 'px',
    ...(markerY > window.innerHeight - 290
      ? { bottom: (window.innerHeight - markerY + 20) + 'px' }
      : { top: (markerY + 20) + 'px' }),
  }
}

function getActiveButtonStyle(active: boolean, color: string): Record<string, string> | undefined {
  if (!active) return undefined
  return { color, backgroundColor: hexToRgba(color, 0.25) }
}
</script>

<template>
  <Teleport to="body">
    <!-- Toolbar -->
    <div
      :class="styles.toolbar"
      data-feedback-toolbar
      data-agentation-root
      :style="toolbarPosition ? { left: toolbarPosition.x + 'px', top: toolbarPosition.y + 'px', right: 'auto', bottom: 'auto' } : undefined"
    >
      <div
        :class="[
          styles.toolbarContainer,
          !isDarkMode ? styles.light : '',
          isActive ? styles.expanded : styles.collapsed,
          showEntranceAnimation ? styles.entrance : '',
          isDraggingToolbar ? styles.dragging : '',
          !settings.webhooksEnabled && (isValidUrl(settings.webhookUrl) || isValidUrl(webhookUrl || '')) ? styles.serverConnected : '',
        ]"
        @click="!isActive ? (getJustFinishedToolbarDrag() ? (setJustFinishedToolbarDrag(false), $event.preventDefault()) : (isActive = true)) : undefined"
        @mousedown="(e: MouseEvent) => handleToolbarMouseDown(e, isActive, connectionStatus)"
        :role="!isActive ? 'button' : undefined"
        :tabindex="!isActive ? 0 : -1"
        :title="!isActive ? 'Start feedback mode' : undefined"
        :style="isDraggingToolbar ? { transform: `scale(1.05) rotate(${dragRotation}deg)`, cursor: 'grabbing' } : undefined"
      >
        <!-- Toggle content (collapsed) -->
        <div :class="[styles.toggleContent, !isActive ? styles.visible : styles.hidden]">
          <IconListSparkle :size="24" />
          <span
            v-if="hasAnnotations"
            :class="[styles.badge, isActive ? styles.fadeOut : '', showEntranceAnimation ? styles.entrance : '']"
            :style="{ backgroundColor: settings.annotationColor }"
          >
            {{ annotations.length }}
          </span>
        </div>

        <!-- Controls content (expanded) -->
        <div
          :class="[
            styles.controlsContent,
            isActive ? styles.visible : styles.hidden,
            toolbarPosition && toolbarPosition.y < 100 ? styles.tooltipBelow : '',
            tooltipsHidden || showSettings ? styles.tooltipsHidden : '',
          ]"
          @mouseleave="showTooltipsAgain"
        >
          <div :class="[styles.buttonWrapper, toolbarPosition && toolbarPosition.x < 120 ? styles.buttonWrapperAlignLeft : '']">
            <button
              :class="[styles.controlButton, !isDarkMode ? styles.light : '']"
              :data-active="isFrozen"
              @click.stop="hideTooltipsUntilMouseLeave(); toggleFreeze()"
            >
              <IconPausePlayAnimated :size="24" :is-paused="isFrozen" />
            </button>
            <span :class="styles.buttonTooltip">
              {{ isFrozen ? 'Resume animations' : 'Pause animations' }}
              <span :class="styles.shortcut">P</span>
            </span>
          </div>

          <div :class="styles.buttonWrapper">
            <button
              :class="[styles.controlButton, !isDarkMode ? styles.light : '']"
              :data-active="isDrawMode"
              @click.stop="hideTooltipsUntilMouseLeave(); isDrawMode = !isDrawMode"
            >
              <IconPencil :size="24" />
            </button>
            <span :class="styles.buttonTooltip">
              {{ isDrawMode ? 'Exit draw mode' : 'Draw mode' }}
              <span :class="styles.shortcut">D</span>
            </span>
          </div>

          <div :class="styles.buttonWrapper">
            <button
              :class="[styles.controlButton, !isDarkMode ? styles.light : '']"
              :disabled="!hasAnnotations"
              @click.stop="hideTooltipsUntilMouseLeave(); showMarkers = !showMarkers; if (isDrawMode) isDrawMode = false"
            >
              <IconEyeAnimated :size="24" :is-open="showMarkers" />
            </button>
            <span :class="styles.buttonTooltip">
              {{ showMarkers ? 'Hide markers' : 'Show markers' }}
              <span :class="styles.shortcut">H</span>
            </span>
          </div>

          <div :class="styles.buttonWrapper">
            <button
              :class="[styles.controlButton, !isDarkMode ? styles.light : '', copied ? styles.statusShowing : '']"
              :disabled="!hasAnnotations && drawStrokes.length === 0"
              :data-active="copied"
              @click.stop="hideTooltipsUntilMouseLeave(); copyOutput()"
            >
              <IconCopyAnimated :size="24" :copied="copied" />
            </button>
            <span :class="styles.buttonTooltip">
              Copy feedback
              <span :class="styles.shortcut">C</span>
            </span>
          </div>

          <!-- Send button -->
          <div :class="[styles.buttonWrapper, styles.sendButtonWrapper, (!settings.webhooksEnabled && (isValidUrl(settings.webhookUrl) || isValidUrl(webhookUrl || ''))) || (canSendViaEndpoint && hasAnnotations) ? styles.sendButtonVisible : '']">
            <button
              :class="[styles.controlButton, !isDarkMode ? styles.light : '', sendState === 'sent' || sendState === 'failed' ? styles.statusShowing : '']"
              :disabled="!hasAnnotations || ((!isValidUrl(settings.webhookUrl) && !isValidUrl(webhookUrl || '')) && !canSendViaEndpoint) || sendState === 'sending'"
              :data-no-hover="sendState === 'sent' || sendState === 'failed'"
              :tabindex="isValidUrl(settings.webhookUrl) || isValidUrl(webhookUrl || '') || canSendViaEndpoint ? 0 : -1"
              @click.stop="hideTooltipsUntilMouseLeave(); sendToWebhook()"
            >
              <IconSendArrow :size="24" :state="sendState" />
              <span
                v-if="hasAnnotations && sendState === 'idle'"
                :class="[styles.buttonBadge, !isDarkMode ? styles.light : '']"
                :style="{ backgroundColor: settings.annotationColor }"
              >
                {{ annotations.length }}
              </span>
            </button>
            <span :class="styles.buttonTooltip">
              Send Annotations
              <span :class="styles.shortcut">S</span>
            </span>
          </div>

          <div :class="styles.buttonWrapper">
            <button
              :class="[styles.controlButton, !isDarkMode ? styles.light : '']"
              :disabled="!hasAnnotations && drawStrokes.length === 0"
              data-danger
              @click.stop="hideTooltipsUntilMouseLeave(); clearAll()"
            >
              <IconTrashAlt :size="24" />
            </button>
            <span :class="styles.buttonTooltip">
              Clear all
              <span :class="styles.shortcut">X</span>
            </span>
          </div>

          <div :class="styles.buttonWrapper">
            <button
              :class="[styles.controlButton, !isDarkMode ? styles.light : '']"
              @click.stop="hideTooltipsUntilMouseLeave(); showSettings = !showSettings"
            >
              <IconGear :size="24" />
            </button>
            <span
              v-if="endpoint && connectionStatus !== 'disconnected'"
              :class="[styles.mcpIndicator, !isDarkMode ? styles.light : '', styles[connectionStatus], showSettings ? styles.hidden : '']"
              :title="connectionStatus === 'connected' ? 'MCP Connected' : 'MCP Connecting...'"
            />
            <span :class="styles.buttonTooltip">Settings</span>
          </div>

          <div :class="[styles.divider, !isDarkMode ? styles.light : '']" />

          <div :class="[styles.buttonWrapper, toolbarPosition && toolbarPosition.x > _window.innerWidth - 120 ? styles.buttonWrapperAlignRight : '']">
            <button
              :class="[styles.controlButton, !isDarkMode ? styles.light : '']"
              @click.stop="hideTooltipsUntilMouseLeave(); isActive = false"
            >
              <IconXmarkLarge :size="24" />
            </button>
            <span :class="styles.buttonTooltip">
              Exit
              <span :class="styles.shortcut">Esc</span>
            </span>
          </div>
        </div>

        <!-- Settings Panel -->
        <ToolbarSettingsPanel
          :settings="settings"
          :is-dark-mode="isDarkMode"
          :show-settings-visible="showSettingsVisible"
          :toolbar-position="toolbarPosition"
          :is-localhost="isLocalhost"
          :endpoint="endpoint"
          :connection-status="connectionStatus"
          :is-transitioning="isTransitioning"
          :settings-page="settingsPage"
          @update:is-dark-mode="isDarkMode = $event"
          @update:settings="Object.assign(settings, $event)"
          @update:settings-page="settingsPage = $event"
        />
      </div>
    </div>

    <!-- Draw canvas -->
    <canvas
      ref="drawCanvasRef"
      :class="[styles.drawCanvas, isDrawMode ? styles.active : '']"
      :style="{ opacity: shouldShowMarkers ? 1 : 0, transition: 'opacity 0.15s ease' }"
      data-feedback-toolbar
    />

    <!-- Markers layer (normal scrolling) -->
    <div :class="styles.markersLayer" data-feedback-toolbar>
      <template v-if="markersVisible">
        <AnnotationMarker
          v-for="(annotation, index) in visibleAnnotations.filter(a => !a.isFixed)"
          :key="annotation.id"
          :annotation="annotation"
          :global-index="annotations.findIndex(a => a.id === annotation.id)"
          :index="index"
          :total-visible="visibleAnnotations.filter(a => !a.isFixed).length"
          :is-hovered="!markersExiting && hoveredMarkerId === annotation.id"
          :is-deleting="deletingMarkerId === annotation.id"
          :is-editing="!!editingAnnotation"
          :marker-color="annotation.isMultiSelect ? '#34C759' : settings.annotationColor"
          :marker-click-behavior="settings.markerClickBehavior"
          :markers-exiting="markersExiting"
          :is-clearing="isClearing"
          :needs-enter-animation="!animatedMarkers.has(annotation.id)"
          :animated-markers-size="animatedMarkers.size"
          :is-fixed="false"
          :renumber-from="renumberFrom"
          :is-dark-mode="isDarkMode"
          :tooltip-exiting-id="tooltipExitingId"
          @mouseenter="!markersExiting && annotation.id !== recentlyAddedId && handleMarkerHover(annotation)"
          @mouseleave="handleMarkerHover(null)"
          @click="!markersExiting && (settings.markerClickBehavior === 'delete' ? deleteAnnotation(annotation.id) : startEditAnnotation(annotation))"
          @dismiss="dismissAnnotation(annotation.id)"
          @contextmenu="(e: MouseEvent) => { if (settings.markerClickBehavior === 'delete') { e.preventDefault(); e.stopPropagation(); if (!markersExiting) startEditAnnotation(annotation) } }"
        />

        <!-- Exiting markers (normal) -->
        <div
          v-for="annotation in exitingAnnotationsList.filter(a => !a.isFixed)"
          :key="'exit-' + annotation.id"
          v-if="!markersExiting"
          :class="[styles.marker, styles.hovered, annotation.isMultiSelect ? styles.multiSelect : '', styles.exit]"
          data-annotation-marker
          :style="{ left: `${annotation.x}%`, top: annotation.y + 'px' }"
        >
          <IconXmark :size="annotation.isMultiSelect ? 12 : 10" />
        </div>
      </template>
    </div>

    <!-- Fixed markers layer -->
    <div :class="styles.fixedMarkersLayer" data-feedback-toolbar>
      <template v-if="markersVisible">
        <AnnotationMarker
          v-for="(annotation, index) in visibleAnnotations.filter(a => a.isFixed)"
          :key="annotation.id"
          :annotation="annotation"
          :global-index="annotations.findIndex(a => a.id === annotation.id)"
          :index="index"
          :total-visible="visibleAnnotations.filter(a => a.isFixed).length"
          :is-hovered="!markersExiting && hoveredMarkerId === annotation.id"
          :is-deleting="deletingMarkerId === annotation.id"
          :is-editing="!!editingAnnotation"
          :marker-color="annotation.isMultiSelect ? '#34C759' : settings.annotationColor"
          :marker-click-behavior="settings.markerClickBehavior"
          :markers-exiting="markersExiting"
          :is-clearing="isClearing"
          :needs-enter-animation="!animatedMarkers.has(annotation.id)"
          :animated-markers-size="animatedMarkers.size"
          :is-fixed="true"
          :renumber-from="renumberFrom"
          :is-dark-mode="isDarkMode"
          :tooltip-exiting-id="tooltipExitingId"
          @mouseenter="!markersExiting && annotation.id !== recentlyAddedId && handleMarkerHover(annotation)"
          @mouseleave="handleMarkerHover(null)"
          @click="!markersExiting && (settings.markerClickBehavior === 'delete' ? deleteAnnotation(annotation.id) : startEditAnnotation(annotation))"
          @dismiss="dismissAnnotation(annotation.id)"
          @contextmenu="(e: MouseEvent) => { if (settings.markerClickBehavior === 'delete') { e.preventDefault(); e.stopPropagation(); if (!markersExiting) startEditAnnotation(annotation) } }"
        />

        <!-- Exiting markers (fixed) -->
        <div
          v-for="annotation in exitingAnnotationsList.filter(a => a.isFixed)"
          :key="'exit-fixed-' + annotation.id"
          v-if="!markersExiting"
          :class="[styles.marker, styles.fixed, styles.hovered, annotation.isMultiSelect ? styles.multiSelect : '', styles.exit]"
          data-annotation-marker
          :style="{ left: `${annotation.x}%`, top: annotation.y + 'px' }"
        >
          <IconClose :size="annotation.isMultiSelect ? 12 : 10" />
        </div>
      </template>
    </div>

    <!-- Interactive overlay -->
    <div
      v-if="isActive"
      :class="styles.overlay"
      data-feedback-toolbar
      :style="pendingAnnotation || editingAnnotation ? { zIndex: 99999 } : undefined"
    >
      <!-- Hover highlight -->
      <div
        v-if="hoverInfo?.rect && !pendingAnnotation && !isScrolling && !dragSelect.isDragging.value && !isDrawMode"
        :class="[styles.hoverHighlight, styles.enter]"
        :style="{
          left: hoverInfo.rect.left + 'px',
          top: hoverInfo.rect.top + 'px',
          width: hoverInfo.rect.width + 'px',
          height: hoverInfo.rect.height + 'px',
          borderColor: `${settings.annotationColor}80`,
          backgroundColor: `${settings.annotationColor}0A`,
        }"
      />

      <!-- Cmd+shift+click multi-select highlights -->
      <div
        v-for="(item, index) in multiSelect.pendingMultiSelectElements.value.filter(i => _document.contains(i.element))"
        :key="'ms-' + index"
        :class="multiSelect.pendingMultiSelectElements.value.length > 1 ? styles.multiSelectOutline : styles.singleSelectOutline"
        :style="{
          position: 'fixed',
          left: item.element.getBoundingClientRect().left + 'px',
          top: item.element.getBoundingClientRect().top + 'px',
          width: item.element.getBoundingClientRect().width + 'px',
          height: item.element.getBoundingClientRect().height + 'px',
          ...(multiSelect.pendingMultiSelectElements.value.length > 1
            ? {}
            : { borderColor: `${settings.annotationColor}99`, backgroundColor: `${settings.annotationColor}0D` }),
        }"
      />

      <!-- Hover tooltip -->
      <div
        v-if="hoverInfo && !pendingAnnotation && !isScrolling && !dragSelect.isDragging.value && !isDrawMode"
        :class="[styles.hoverTooltip, styles.enter]"
        :style="{
          left: Math.max(8, Math.min(hoverPosition.x, _window.innerWidth - 100)) + 'px',
          top: Math.max(hoverPosition.y - (hoverInfo.reactComponents ? 48 : 32), 8) + 'px',
        }"
      >
        <div v-if="hoverInfo.reactComponents" :class="styles.hoverReactPath">
          {{ hoverInfo.reactComponents }}
        </div>
        <div :class="styles.hoverElementName">{{ hoverInfo.elementName }}</div>
      </div>

      <!-- Pending annotation marker + popup -->
      <template v-if="pendingAnnotation">
        <!-- Pending outline -->
        <template v-if="pendingAnnotation.drawingIndex == null">
          <template v-if="pendingAnnotation.targetElement && _document.contains(pendingAnnotation.targetElement)">
            <div
              :class="[styles.singleSelectOutline, pendingExiting ? styles.exit : styles.enter]"
              :style="{
                left: pendingAnnotation.targetElement.getBoundingClientRect().left + 'px',
                top: pendingAnnotation.targetElement.getBoundingClientRect().top + 'px',
                width: pendingAnnotation.targetElement.getBoundingClientRect().width + 'px',
                height: pendingAnnotation.targetElement.getBoundingClientRect().height + 'px',
                borderColor: `${settings.annotationColor}99`,
                backgroundColor: `${settings.annotationColor}0D`,
              }"
            />
          </template>
          <template v-else-if="pendingAnnotation.boundingBox">
            <div
              :class="[pendingAnnotation.isMultiSelect ? styles.multiSelectOutline : styles.singleSelectOutline, pendingExiting ? styles.exit : styles.enter]"
              :style="{
                left: pendingAnnotation.boundingBox.x + 'px',
                top: (pendingAnnotation.boundingBox.y - scrollY) + 'px',
                width: pendingAnnotation.boundingBox.width + 'px',
                height: pendingAnnotation.boundingBox.height + 'px',
                ...(pendingAnnotation.isMultiSelect ? {} : { borderColor: `${settings.annotationColor}99`, backgroundColor: `${settings.annotationColor}0D` }),
              }"
            />
          </template>
        </template>

        <!-- Pending marker -->
        <div
          :class="[styles.marker, styles.pending, pendingAnnotation.isMultiSelect ? styles.multiSelect : '', pendingExiting ? styles.exit : styles.enter]"
          :style="{
            left: `${pendingAnnotation.x}%`,
            top: (pendingAnnotation.isFixed ? pendingAnnotation.y : pendingAnnotation.y - scrollY) + 'px',
            backgroundColor: pendingAnnotation.isMultiSelect ? '#34C759' : settings.annotationColor,
          }"
        >
          <IconPlus :size="12" />
        </div>

        <!-- Pending popup -->
        <AnnotationPopup
          ref="popupRef"
          :element="pendingAnnotation.element"
          :selected-text="pendingAnnotation.selectedText"
          :computed-styles="pendingAnnotation.computedStylesObj"
          :placeholder="
            pendingAnnotation.element === 'Area selection'
              ? 'What should change in this area?'
              : pendingAnnotation.isMultiSelect
                ? 'Feedback for this group of elements...'
                : 'What should change?'
          "
          :on-submit="addAnnotation"
          :on-cancel="cancelAnnotation"
          :is-exiting="pendingExiting"
          :light-mode="!isDarkMode"
          :accent-color="pendingAnnotation.isMultiSelect ? '#34C759' : settings.annotationColor"
          :popup-style="getPopupStyle(pendingAnnotation.x, pendingAnnotation.isFixed ? pendingAnnotation.y : pendingAnnotation.y - scrollY)"
        />
      </template>

      <!-- Edit annotation popup -->
      <template v-if="editingAnnotation">
        <!-- Edit outline -->
        <template v-if="editingAnnotation.drawingIndex == null">
          <template v-if="editingTargetElement && _document.contains(editingTargetElement)">
            <div
              :class="[editingAnnotation.isMultiSelect ? styles.multiSelectOutline : styles.singleSelectOutline, styles.enter]"
              :style="{
                left: editingTargetElement.getBoundingClientRect().left + 'px',
                top: editingTargetElement.getBoundingClientRect().top + 'px',
                width: editingTargetElement.getBoundingClientRect().width + 'px',
                height: editingTargetElement.getBoundingClientRect().height + 'px',
                ...(editingAnnotation.isMultiSelect ? {} : { borderColor: `${settings.annotationColor}99`, backgroundColor: `${settings.annotationColor}0D` }),
              }"
            />
          </template>
          <template v-else-if="editingAnnotation.boundingBox">
            <div
              :class="[editingAnnotation.isMultiSelect ? styles.multiSelectOutline : styles.singleSelectOutline, styles.enter]"
              :style="{
                left: editingAnnotation.boundingBox.x + 'px',
                top: (editingAnnotation.isFixed ? editingAnnotation.boundingBox.y : editingAnnotation.boundingBox.y - scrollY) + 'px',
                width: editingAnnotation.boundingBox.width + 'px',
                height: editingAnnotation.boundingBox.height + 'px',
                ...(editingAnnotation.isMultiSelect ? {} : { borderColor: `${settings.annotationColor}99`, backgroundColor: `${settings.annotationColor}0D` }),
              }"
            />
          </template>
        </template>

        <AnnotationPopup
          ref="editPopupRef"
          :element="editingAnnotation.element"
          :selected-text="editingAnnotation.selectedText"
          :computed-styles="parseComputedStylesString(editingAnnotation.computedStyles)"
          placeholder="Edit your feedback..."
          :initial-value="editingAnnotation.comment"
          submit-label="Save"
          :on-submit="updateAnnotation"
          :on-cancel="cancelEditAnnotation"
          :on-delete="editingAnnotation.status === 'resolved' ? undefined : () => deleteAnnotation(editingAnnotation!.id)"
          :is-resolved="editingAnnotation.status === 'resolved'"
          :on-dismiss="editingAnnotation.status === 'resolved' ? () => dismissAnnotation(editingAnnotation!.id) : undefined"
          :on-rework="editingAnnotation.status === 'resolved' ? (appended: string) => { reworkAnnotation(editingAnnotation!.id, appended); cancelEditAnnotation() } : undefined"
          :is-exiting="editExiting"
          :light-mode="!isDarkMode"
          :accent-color="editingAnnotation.status === 'resolved' ? '#22c55e' : (editingAnnotation.isMultiSelect ? '#34C759' : settings.annotationColor)"
          :popup-style="getPopupStyle(editingAnnotation.x, editingAnnotation.isFixed ? editingAnnotation.y : editingAnnotation.y - scrollY)"
        />
      </template>

      <!-- Drag selection -->
      <template v-if="dragSelect.isDragging.value">
        <div :ref="(el: any) => dragSelect.setDragRectEl(el)" :class="styles.dragSelection" />
        <div :ref="(el: any) => dragSelect.setHighlightsContainerEl(el)" :class="styles.highlightsContainer" />
      </template>
    </div>
  </Teleport>
</template>
