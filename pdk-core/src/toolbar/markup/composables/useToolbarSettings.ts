import { ref, reactive, watch, onMounted } from 'vue'
import {
  originalSetTimeout,
} from '../utils/freeze-animations'

// =============================================================================
// Types
// =============================================================================

export type OutputDetailLevel = 'compact' | 'standard' | 'detailed' | 'forensic'
export type ReactComponentMode = 'smart' | 'filtered' | 'all' | 'off'
export type MarkerClickBehavior = 'edit' | 'delete'

export type ToolbarSettings = {
  outputDetail: OutputDetailLevel
  autoClearAfterCopy: boolean
  annotationColor: string
  blockInteractions: boolean
  reactEnabled: boolean
  markerClickBehavior: MarkerClickBehavior
  webhookUrl: string
  webhooksEnabled: boolean
}

export const DEFAULT_SETTINGS: ToolbarSettings = {
  outputDetail: 'standard',
  autoClearAfterCopy: false,
  annotationColor: '#3c82f7',
  blockInteractions: true,
  reactEnabled: true,
  markerClickBehavior: 'edit',
  webhookUrl: '',
  webhooksEnabled: true,
}

// Maps output detail level to component detection mode
export const OUTPUT_TO_REACT_MODE: Record<OutputDetailLevel, ReactComponentMode> = {
  compact: 'off',
  standard: 'filtered',
  detailed: 'smart',
  forensic: 'all',
}

export const OUTPUT_DETAIL_OPTIONS: { value: OutputDetailLevel; label: string }[] = [
  { value: 'compact', label: 'Compact' },
  { value: 'standard', label: 'Standard' },
  { value: 'detailed', label: 'Detailed' },
  { value: 'forensic', label: 'Forensic' },
]

export const MARKER_CLICK_OPTIONS: { value: MarkerClickBehavior; label: string }[] = [
  { value: 'edit', label: 'Edit' },
  { value: 'delete', label: 'Delete' },
]

export const COLOR_OPTIONS = [
  { value: '#AF52DE', label: 'Purple' },
  { value: '#3c82f7', label: 'Blue' },
  { value: '#5AC8FA', label: 'Cyan' },
  { value: '#34C759', label: 'Green' },
  { value: '#FFD60A', label: 'Yellow' },
  { value: '#FF9500', label: 'Orange' },
  { value: '#FF3B30', label: 'Red' },
]

// Simple URL validation
export const isValidUrl = (url: string): boolean => {
  if (!url || !url.trim()) return false
  try {
    const parsed = new URL(url.trim())
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    return false
  }
}

// Module-level flag to prevent re-animating on SPA page navigation
let hasPlayedEntranceAnimation = false

// =============================================================================
// Composable
// =============================================================================

export function useToolbarSettings() {
  const settings = reactive<ToolbarSettings>({ ...DEFAULT_SETTINGS })
  const isDarkMode = ref(true)
  const showEntranceAnimation = ref(false)
  const mounted = ref(false)

  // Toolbar position / drag state
  const toolbarPosition = ref<{ x: number; y: number } | null>(null)
  const isDraggingToolbar = ref(false)
  const dragStartPos = ref<{
    x: number
    y: number
    toolbarX: number
    toolbarY: number
  } | null>(null)
  const dragRotation = ref(0)
  let justFinishedToolbarDrag = false

  const isLocalhost =
    typeof window !== 'undefined' &&
    (window.location.hostname === 'localhost' ||
      window.location.hostname === '127.0.0.1' ||
      window.location.hostname === '0.0.0.0' ||
      window.location.hostname.endsWith('.local'))

  const pathname =
    typeof window !== 'undefined' ? window.location.pathname : '/'

  // Effective detection mode (derived)
  function getEffectiveReactMode(): ReactComponentMode {
    return isLocalhost && settings.reactEnabled
      ? OUTPUT_TO_REACT_MODE[settings.outputDetail]
      : 'off'
  }

  // Load from localStorage on mount
  function loadFromStorage() {
    mounted.value = true

    // Trigger entrance animation only once
    if (!hasPlayedEntranceAnimation) {
      showEntranceAnimation.value = true
      hasPlayedEntranceAnimation = true
      originalSetTimeout(() => {
        showEntranceAnimation.value = false
      }, 750)
    }

    try {
      const storedSettings = localStorage.getItem('feedback-toolbar-settings')
      if (storedSettings) {
        Object.assign(settings, { ...DEFAULT_SETTINGS, ...JSON.parse(storedSettings) })
      }
    } catch {
      // Ignore
    }

    try {
      const savedTheme = localStorage.getItem('feedback-toolbar-theme')
      if (savedTheme !== null) {
        isDarkMode.value = savedTheme === 'dark'
      }
    } catch {
      // Ignore
    }

    try {
      const savedPosition = localStorage.getItem('feedback-toolbar-position')
      if (savedPosition) {
        const pos = JSON.parse(savedPosition)
        if (typeof pos.x === 'number' && typeof pos.y === 'number') {
          toolbarPosition.value = pos
        }
      }
    } catch {
      // Ignore
    }
  }

  // Persist settings
  function saveSettings() {
    if (!mounted.value) return
    localStorage.setItem('feedback-toolbar-settings', JSON.stringify(settings))
  }

  // Persist theme
  function saveTheme() {
    if (!mounted.value) return
    localStorage.setItem('feedback-toolbar-theme', isDarkMode.value ? 'dark' : 'light')
  }

  // Save toolbar position
  function saveToolbarPosition() {
    if (!mounted.value || !toolbarPosition.value) return
    localStorage.setItem('feedback-toolbar-position', JSON.stringify(toolbarPosition.value))
  }

  // Handle toolbar drag start
  function handleToolbarMouseDown(
    e: MouseEvent,
    isActive: boolean,
    connectionStatus: string,
  ) {
    const target = e.target as HTMLElement
    if (target.closest('button') || target.closest('[data-settings-panel]')) {
      return
    }

    const toolbarParent = (e.currentTarget as HTMLElement).parentElement
    if (!toolbarParent) return

    const rect = toolbarParent.getBoundingClientRect()
    const currentX = toolbarPosition.value?.x ?? rect.left
    const currentY = toolbarPosition.value?.y ?? rect.top

    const randomRotation = (Math.random() - 0.5) * 10
    dragRotation.value = randomRotation

    dragStartPos.value = {
      x: e.clientX,
      y: e.clientY,
      toolbarX: currentX,
      toolbarY: currentY,
    }
  }

  function getJustFinishedToolbarDrag() {
    return justFinishedToolbarDrag
  }

  function setJustFinishedToolbarDrag(v: boolean) {
    justFinishedToolbarDrag = v
  }

  return {
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
  }
}
