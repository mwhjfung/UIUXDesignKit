import { watchEffect, type Ref } from 'vue'
import { isValidUrl } from './useToolbarSettings'

export function useKeyboardShortcuts(options: {
  isActive: Ref<boolean>
  isDrawMode: Ref<boolean>
  pendingAnnotation: Ref<unknown | null>
  annotationsLength: () => number
  drawStrokesLength: () => number
  settingsWebhookUrl: () => string
  webhookUrl: string | undefined
  sendState: Ref<string>
  onToggleActive: () => void
  onToggleFreeze: () => void
  onToggleDrawMode: () => void
  onToggleMarkers: () => void
  onCopy: () => void
  onClear: () => void
  onSend: () => void
  onUndoStroke: () => void
  onEscapeDrawMode: () => void
  onClearMultiSelect: () => void
  pendingMultiSelectLength: () => number
  hideTooltips: () => void
}) {
  const {
    isActive,
    isDrawMode,
    pendingAnnotation,
    annotationsLength,
    drawStrokesLength,
    settingsWebhookUrl,
    webhookUrl,
    sendState,
    onToggleActive,
    onToggleFreeze,
    onToggleDrawMode,
    onToggleMarkers,
    onCopy,
    onClear,
    onSend,
    onUndoStroke,
    onEscapeDrawMode,
    onClearMultiSelect,
    pendingMultiSelectLength,
    hideTooltips,
  } = options

  function handleKeyDown(e: KeyboardEvent) {
    const target = e.target as HTMLElement
    const isTyping =
      target.tagName === 'INPUT' ||
      target.tagName === 'TEXTAREA' ||
      target.isContentEditable

    if (e.key === 'Escape') {
      if (isDrawMode.value) {
        onEscapeDrawMode()
        return
      }
      if (pendingMultiSelectLength() > 0) {
        onClearMultiSelect()
        return
      }
      if (pendingAnnotation.value) {
        // Let popup handle
      } else if (isActive.value) {
        hideTooltips()
        onToggleActive()
      }
    }

    // Cmd+Shift+F to toggle feedback mode
    if ((e.metaKey || e.ctrlKey) && e.shiftKey && (e.key === 'f' || e.key === 'F')) {
      e.preventDefault()
      hideTooltips()
      onToggleActive()
      return
    }

    // Cmd+Z in draw mode: undo last stroke
    if ((e.metaKey || e.ctrlKey) && (e.key === 'z' || e.key === 'Z') && isDrawMode.value && !e.shiftKey) {
      e.preventDefault()
      onUndoStroke()
      return
    }

    if (isTyping || e.metaKey || e.ctrlKey) return

    if (e.key === 'p' || e.key === 'P') {
      e.preventDefault()
      hideTooltips()
      onToggleFreeze()
    }

    if (e.key === 'd' || e.key === 'D') {
      e.preventDefault()
      hideTooltips()
      onToggleDrawMode()
    }

    if (e.key === 'h' || e.key === 'H') {
      if (annotationsLength() > 0) {
        e.preventDefault()
        hideTooltips()
        onToggleMarkers()
      }
    }

    if (e.key === 'c' || e.key === 'C') {
      if (annotationsLength() > 0) {
        e.preventDefault()
        hideTooltips()
        onCopy()
      }
    }

    if (e.key === 'x' || e.key === 'X') {
      if (annotationsLength() > 0) {
        e.preventDefault()
        hideTooltips()
        onClear()
      }
    }

    if (e.key === 's' || e.key === 'S') {
      const hasValidWebhook = isValidUrl(settingsWebhookUrl()) || isValidUrl(webhookUrl || '')
      if (annotationsLength() > 0 && hasValidWebhook && sendState.value === 'idle') {
        e.preventDefault()
        hideTooltips()
        onSend()
      }
    }
  }

  return { handleKeyDown }
}
