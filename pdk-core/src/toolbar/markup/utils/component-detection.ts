// =============================================================================
// Framework-neutral component detection.
// Tries Vue first (the richer detector, with filtering modes), then React.
// The annotation field is still called `vueComponent` for wire compatibility
// with the markup server and skill — it simply means "component name".
// =============================================================================

import { getReactComponentName, isReactPage } from './react-detection'
import { getVueComponentName, isVuePage, type VueDetectionConfig } from './vue-detection'

export interface ComponentInfo {
  path: string | null
  components: string[]
}

export function getComponentName(
  element: HTMLElement,
  config?: VueDetectionConfig,
): ComponentInfo {
  if (isVuePage()) {
    return getVueComponentName(element, config)
  }
  if (isReactPage()) {
    return getReactComponentName(element)
  }
  return { path: null, components: [] }
}
