import { ref, watch, type Ref } from 'vue'
import { originalSetTimeout } from '../utils/freeze-animations'
import type { Annotation } from '../types'

export function useMarkerVisibility(options: {
  isActive: Ref<boolean>
  showMarkers: Ref<boolean>
  annotations: Ref<Annotation[]>
}) {
  const { isActive, showMarkers, annotations } = options

  const markersVisible = ref(false)
  const markersExiting = ref(false)
  const animatedMarkers = ref<Set<string>>(new Set())
  const exitingMarkers = ref<Set<string>>(new Set())

  // Derived: should markers be shown?
  function getShouldShowMarkers() {
    return isActive.value && showMarkers.value
  }

  // Watch the combined condition
  let enterTimer: ReturnType<typeof setTimeout> | null = null
  let exitTimer: ReturnType<typeof setTimeout> | null = null

  function updateVisibility() {
    const shouldShow = getShouldShowMarkers()

    if (enterTimer) { clearTimeout(enterTimer); enterTimer = null }
    if (exitTimer) { clearTimeout(exitTimer); exitTimer = null }

    if (shouldShow) {
      markersExiting.value = false
      markersVisible.value = true
      animatedMarkers.value = new Set()

      const enterMaxDelay = Math.max(0, annotations.value.length - 1) * 20
      enterTimer = originalSetTimeout(() => {
        const newSet = new Set(animatedMarkers.value)
        annotations.value.forEach((a) => newSet.add(a.id))
        animatedMarkers.value = newSet
      }, enterMaxDelay + 250 + 50)
    } else if (markersVisible.value) {
      markersExiting.value = true
      const maxDelay = Math.max(0, annotations.value.length - 1) * 20
      exitTimer = originalSetTimeout(() => {
        markersVisible.value = false
        markersExiting.value = false
      }, maxDelay + 200 + 50)
    }
  }

  return {
    markersVisible,
    markersExiting,
    animatedMarkers,
    exitingMarkers,
    getShouldShowMarkers,
    updateVisibility,
  }
}
