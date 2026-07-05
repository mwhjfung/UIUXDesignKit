// =============================================================================
// React Component Name Detection
// Mirrors vue-detection's API using React fiber internals. Works with React
// 17–19 dev builds: each rendered host element carries a `__reactFiber$<id>`
// property pointing into the fiber tree. Component *names* are reliable in
// dev; file paths are not (React 19 removed _debugSource), so this util only
// ever reports names.
// =============================================================================

export interface ReactComponentInfo {
  /** e.g. "App > TaskTable > Button" (nearest last) */
  path: string | null
  /** Component names from outermost to nearest */
  components: string[]
}

interface FiberNode {
  type: unknown
  return: FiberNode | null
}

const SKIP_NAMES = new Set([
  'Fragment',
  'StrictMode',
  'Suspense',
  'Provider',
  'Consumer',
  'Context',
  'Profiler',
])

function fiberOf(element: Element): FiberNode | null {
  for (const key of Object.keys(element)) {
    if (key.startsWith('__reactFiber$')) {
      return (element as unknown as Record<string, FiberNode>)[key] ?? null
    }
  }
  return null
}

function nameOf(type: unknown): string | null {
  if (typeof type === 'function') {
    const fn = type as { displayName?: string; name?: string }
    return fn.displayName ?? (fn.name || null)
  }
  if (typeof type === 'object' && type !== null) {
    // forwardRef / memo wrappers
    const wrapped = type as { displayName?: string; render?: { name?: string }; type?: unknown }
    if (wrapped.displayName) return wrapped.displayName
    if (wrapped.render?.name) return wrapped.render.name
    if (wrapped.type) return nameOf(wrapped.type)
  }
  return null
}

export function isReactPage(): boolean {
  const root = document.getElementById('root') ?? document.body
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT)
  let node: Node | null = walker.currentNode
  let inspected = 0
  while (node && inspected < 50) {
    if (node instanceof Element && fiberOf(node)) return true
    node = walker.nextNode()
    inspected++
  }
  return false
}

/**
 * Walks up the fiber tree from a DOM element collecting user component names.
 */
export function getReactComponentName(element: HTMLElement): ReactComponentInfo {
  let fiber: FiberNode | null = null
  let current: Element | null = element
  while (current && !fiber) {
    fiber = fiberOf(current)
    current = current.parentElement
  }
  if (!fiber) return { path: null, components: [] }

  const names: string[] = []
  let node: FiberNode | null = fiber
  let depth = 0
  while (node && depth < 200) {
    const name = nameOf(node.type)
    if (
      name &&
      /^[A-Z]/.test(name) &&
      !SKIP_NAMES.has(name) &&
      names[names.length - 1] !== name
    ) {
      names.push(name)
    }
    node = node.return
    depth++
  }

  const components = names.reverse() // outermost first
  return {
    path: components.length > 0 ? components.join(' > ') : null,
    components,
  }
}
