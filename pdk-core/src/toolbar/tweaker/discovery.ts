/**
 * Tweaker instance discovery.
 *
 * An injected toolbar can't rely on app-level instrumentation to tag
 * component instances, so PDK discovers them from the DOM using the stack
 * manifest's detect hints (shadcn components emit data-slot="button" etc.
 * natively).
 *
 * Occurrence indexes are per component name in document order — the same
 * ordering the server uses when patching the Nth <Component> in source.
 */

export interface ManifestPropField {
  name: string
  label: string
  type: 'string' | 'boolean' | 'number' | 'select'
  options?: string[]
  default?: string | number | boolean
}

export interface ManifestComponent {
  name: string
  importPath: string
  detect?: { dataSlot?: string; tag?: string; classHint?: string }
  props: ManifestPropField[]
  hasChildren?: boolean
}

export interface BrowserManifest {
  stack: string
  components: { components: ManifestComponent[] }
  tokens: { tokens: unknown[] }
  icons: { pack?: string; icons: string[] }
}

export interface TweakInstance {
  el: HTMLElement
  component: ManifestComponent
  /** 1-based, per component name, document order. */
  occurrence: number
}

export async function fetchBrowserManifest(): Promise<BrowserManifest | null> {
  try {
    const res = await fetch('/__pdk/manifest')
    if (!res.ok) return null
    return (await res.json()) as BrowserManifest
  } catch {
    return null
  }
}

/** Components worth offering in the Tweaker: they have editable props and a detect hint. */
export function tweakableComponents(manifest: BrowserManifest): ManifestComponent[] {
  return manifest.components.components.filter(
    (c) => c.props.length > 0 && (c.detect?.dataSlot || c.detect?.classHint),
  )
}

export function discoverInstances(manifest: BrowserManifest): TweakInstance[] {
  const instances: TweakInstance[] = []
  for (const component of tweakableComponents(manifest)) {
    let els: Element[] = []
    if (component.detect?.dataSlot) {
      els = [...document.querySelectorAll(`[data-slot="${component.detect.dataSlot}"]`)]
    } else if (component.detect?.classHint) {
      els = [...document.querySelectorAll(`.${component.detect.classHint}`)]
    }
    els
      .filter((el): el is HTMLElement => el instanceof HTMLElement && el.id !== '__pdk-tools')
      .forEach((el, i) => {
        instances.push({ el, component, occurrence: i + 1 })
      })
  }
  return instances
}

/** The registered instance under a viewport point, innermost first. */
export function instanceAtPoint(instances: TweakInstance[], x: number, y: number): TweakInstance | null {
  const stack = document.elementsFromPoint(x, y)
  for (const el of stack) {
    const hit = instances.find((i) => i.el === el || i.el.contains(el))
    if (hit) return hit
  }
  return null
}
