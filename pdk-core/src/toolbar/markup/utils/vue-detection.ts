// =============================================================================
// Vue 3 Component Name Detection
// Uses Vue 3 internal component instance properties to extract component names
// from DOM elements, mirroring the React detection API.
// =============================================================================

/**
 * Vue 3 component instance (minimal subset we care about).
 * In dev mode, Vue 3 attaches `__vueParentComponent` to the root DOM element
 * of each component instance.
 */
interface VueComponentInstance {
  type: VueComponentType;
  parent: VueComponentInstance | null;
  /** The root DOM element of this component */
  vnode?: {
    el?: HTMLElement | null;
  };
  /** App context (present on root instance) */
  appContext?: unknown;
  /** Unique ID for the component instance */
  uid?: number;
}

interface VueComponentType {
  /** Component name set via `defineComponent({ name: '...' })` */
  name?: string;
  /** Component name set by `<script setup>` compiler (Vue 3.2.34+) */
  __name?: string;
  /** Explicit display name (used by some libraries) */
  displayName?: string;
  /** File path in dev mode (set by vue-loader / vite plugin) */
  __file?: string;
  /** For async/lazy components */
  __asyncLoader?: unknown;
}

// =============================================================================
// Default Filter Configuration
// =============================================================================

/**
 * Default exact names to always skip (Vue internals and router components)
 */
export const DEFAULT_SKIP_EXACT = new Set([
  // Vue built-in components
  "RouterView",
  "RouterLink",
  "Transition",
  "TransitionGroup",
  "KeepAlive",
  "Suspense",
  "Teleport",
  "Fragment",
  "BaseTransition",
  // Internal components
  "Component",
  "Root",
  "App",
  // Nuxt internals
  "NuxtRoot",
  "NuxtPage",
  "NuxtLayout",
  "NuxtLoadingIndicator",
  "NuxtErrorBoundary",
  "ClientOnly",
  "ServerPlaceholder",
  // DevTools
  "HotReload",
  "Hot",
]);

/**
 * Default patterns for framework internals.
 * Patterns are designed to be specific to avoid false positives.
 */
export const DEFAULT_SKIP_PATTERNS: RegExp[] = [
  /Provider$/, // ThemeProvider, etc.
  /Router$/, // AppRouter, VueRouter internal
  /^(Inner|Outer)/, // InnerLayoutRouter, etc.
  /^Anonymous/, // Anonymous components
  /Context$/, // Context-like wrappers
  /^Hot(Reload)?$/, // HotReload
  /^(Dev|Vue)(Overlay|Tools|Root)/, // DevTools, VueDevOverlay
  /Overlay$/, // DevOverlay, ErrorOverlay
  /Handler$/, // ErrorHandler
  /^With[A-Z]/, // withAuth, withRouter (HOCs)
  /Wrapper$/, // Generic wrappers
  /^Root$/, // Generic Root component
  /Boundary$/, // ErrorBoundary
  /^__/, // Double-underscore internal components
];

/**
 * Patterns that indicate likely user-defined components.
 * Used as fallback in 'smart' mode.
 */
const DEFAULT_USER_PATTERNS: RegExp[] = [
  /Page$/, // HomePage, InstallPage
  /View$/, // ListView, DetailView
  /Screen$/, // HomeScreen
  /Section$/, // HeroSection
  /Card$/, // ProductCard
  /List$/, // UserList
  /Item$/, // ListItem, MenuItem
  /Form$/, // LoginForm
  /Modal$/, // ConfirmModal
  /Dialog$/, // AlertDialog
  /Button$/, // SubmitButton
  /Nav$/, // SideNav, TopNav
  /Header$/, // PageHeader
  /Footer$/, // PageFooter
  /Layout$/, // MainLayout
  /Panel$/, // SidePanel
  /Tab$/, // SettingsTab
  /Menu$/, // DropdownMenu
];

// =============================================================================
// Configuration Types
// =============================================================================

export type VueDetectionMode = "all" | "filtered" | "smart";

export interface VueDetectionConfig {
  /**
   * How many component names to collect
   * @default 6
   */
  maxComponents?: number;

  /**
   * Maximum instance depth to traverse
   * @default 30
   */
  maxDepth?: number;

  /**
   * Detection mode:
   * - 'smart': Only show components that correlate with DOM classes (strictest, most relevant)
   * - 'filtered': Skip known framework internals (default)
   * - 'all': Show all components (no filtering)
   * @default 'filtered'
   */
  mode?: VueDetectionMode;

  /**
   * Additional exact names to skip (merged with defaults in 'filtered' mode)
   */
  skipExact?: Set<string> | string[];

  /**
   * Additional patterns to skip (merged with defaults in 'filtered' mode)
   */
  skipPatterns?: RegExp[];

  /**
   * Patterns for user components (used as fallback in 'smart' mode)
   */
  userPatterns?: RegExp[];

  /**
   * Custom filter function for full control.
   * Return true to INCLUDE the component, false to skip.
   */
  filter?: (name: string, depth: number) => boolean;
}

/**
 * Resolved configuration with all defaults applied
 */
interface ResolvedConfig {
  maxComponents: number;
  maxDepth: number;
  mode: VueDetectionMode;
  skipExact: Set<string>;
  skipPatterns: RegExp[];
  userPatterns: RegExp[];
  filter?: (name: string, depth: number) => boolean;
}

function resolveConfig(config?: VueDetectionConfig): ResolvedConfig {
  const mode = config?.mode ?? "filtered";

  // Convert skipExact to Set if array
  let skipExact = DEFAULT_SKIP_EXACT;
  if (config?.skipExact) {
    const additional =
      config.skipExact instanceof Set
        ? config.skipExact
        : new Set(config.skipExact);
    skipExact = new Set([...DEFAULT_SKIP_EXACT, ...additional]);
  }

  return {
    maxComponents: config?.maxComponents ?? 6,
    maxDepth: config?.maxDepth ?? 30,
    mode,
    skipExact,
    skipPatterns: config?.skipPatterns
      ? [...DEFAULT_SKIP_PATTERNS, ...config.skipPatterns]
      : DEFAULT_SKIP_PATTERNS,
    userPatterns: config?.userPatterns ?? DEFAULT_USER_PATTERNS,
    filter: config?.filter,
  };
}

// =============================================================================
// Filter Logic
// =============================================================================

/**
 * Normalize a component name to match CSS class conventions.
 * SideNav -> side-nav, LinkComponent -> link-component
 */
function normalizeComponentName(name: string): string {
  return name
    .replace(/([a-z])([A-Z])/g, "$1-$2")
    .replace(/([A-Z])([A-Z][a-z])/g, "$1-$2")
    .toLowerCase();
}

/**
 * Collect CSS classes from an element and its ancestors
 */
function getAncestorClasses(element: HTMLElement, maxDepth = 10): Set<string> {
  const classes = new Set<string>();
  let current: HTMLElement | null = element;
  let depth = 0;

  while (current && depth < maxDepth) {
    if (current.className && typeof current.className === "string") {
      current.className.split(/\s+/).forEach((cls) => {
        if (cls.length > 1) {
          // Normalize: remove CSS module hashes, convert to lowercase
          const normalized = cls
            .replace(/[_][a-zA-Z0-9]{5,}.*$/, "")
            .toLowerCase();
          if (normalized.length > 1) {
            classes.add(normalized);
          }
        }
      });
    }
    current = current.parentElement;
    depth++;
  }

  return classes;
}

/**
 * Check if a component name correlates with any DOM class
 */
function componentCorrelatesWithDOM(
  componentName: string,
  domClasses: Set<string>,
): boolean {
  const normalized = normalizeComponentName(componentName);

  for (const cls of domClasses) {
    // Exact match: SideNav -> side-nav
    if (cls === normalized) return true;

    // Contains match: LinkComponent -> nav-link contains "link"
    // Split both by hyphens and check for word overlaps
    const componentWords = normalized.split("-").filter((w) => w.length > 2);
    const classWords = cls.split("-").filter((w) => w.length > 2);

    for (const cWord of componentWords) {
      for (const dWord of classWords) {
        if (cWord === dWord || cWord.includes(dWord) || dWord.includes(cWord)) {
          return true;
        }
      }
    }
  }

  return false;
}

function shouldIncludeComponent(
  name: string,
  depth: number,
  config: ResolvedConfig,
  domClasses?: Set<string>,
): boolean {
  // Custom filter takes precedence
  if (config.filter) {
    return config.filter(name, depth);
  }

  switch (config.mode) {
    case "all":
      // "all" mode shows everything - no filtering at all
      return true;

    case "filtered":
      // "filtered" mode skips framework internals
      if (config.skipExact.has(name)) {
        return false;
      }
      if (config.skipPatterns.some((p) => p.test(name))) {
        return false;
      }
      return true;

    case "smart":
      // "smart" mode: first apply framework filters, then require DOM correlation
      if (config.skipExact.has(name)) {
        return false;
      }
      if (config.skipPatterns.some((p) => p.test(name))) {
        return false;
      }
      // Must correlate with DOM classes OR match user patterns
      if (domClasses && componentCorrelatesWithDOM(name, domClasses)) {
        return true;
      }
      if (config.userPatterns.some((p) => p.test(name))) {
        return true;
      }
      // Skip components that don't correlate - this mode is intentionally strict
      return false;

    default:
      return true;
  }
}

// =============================================================================
// Vue Detection
// =============================================================================

let vueDetectionCache: boolean | null = null;

// Only cache for 'all' mode - filtered modes should NOT cache because:
// 1. Filter results depend on config that may change between calls
// 2. Cached results from before filter changes would return stale/unfiltered data
// 3. The cache lookup happens BEFORE filtering, so old cached data bypasses filters
// Using WeakMap allows garbage collection when elements are removed from DOM.
let componentCacheAll = new WeakMap<HTMLElement, VueComponentInfo>();

// Wrapper object to allow cache clearing (WeakMap has no clear() method)
let componentCacheAllRef = { map: componentCacheAll };

/**
 * Checks if a DOM element has a Vue 3 component instance attached.
 */
function hasVueInstance(element: Element): boolean {
  return "__vueParentComponent" in element || "__vue_app__" in element;
}

/**
 * Checks if Vue 3 is present on the page.
 * Looks for `__VUE_DEVTOOLS_GLOBAL_HOOK__`, `__vue_app__` on root elements,
 * and `__vueParentComponent` on DOM elements.
 */
export function isVuePage(): boolean {
  if (vueDetectionCache !== null) {
    return vueDetectionCache;
  }

  if (typeof document === "undefined") {
    return false;
  }

  // Check for Vue DevTools global hook
  if (
    typeof window !== "undefined" &&
    (window as unknown as Record<string, unknown>).__VUE_DEVTOOLS_GLOBAL_HOOK__
  ) {
    vueDetectionCache = true;
    return true;
  }

  // Check body first
  if (document.body && hasVueInstance(document.body)) {
    vueDetectionCache = true;
    return true;
  }

  // Check common Vue root containers
  const commonRoots = ["#app", "#root", "[data-v-app]", "[data-server-rendered]"];
  for (const selector of commonRoots) {
    const el = document.querySelector(selector);
    if (el && (hasVueInstance(el) || "__vue_app__" in el)) {
      vueDetectionCache = true;
      return true;
    }
  }

  // Scan immediate children of body as fallback
  if (document.body) {
    for (const child of document.body.children) {
      if (hasVueInstance(child)) {
        vueDetectionCache = true;
        return true;
      }
    }
  }

  vueDetectionCache = false;
  return false;
}

/**
 * Clears the Vue detection cache.
 * Note: Only 'all' mode uses caching; filtered modes don't cache to avoid stale filter results.
 */
export function clearVueDetectionCache(): void {
  vueDetectionCache = null;
  componentCacheAllRef.map = new WeakMap<HTMLElement, VueComponentInfo>();
}

/**
 * Gets the Vue 3 component instance from a DOM element.
 * Vue 3 sets `__vueParentComponent` on the root DOM element of each component.
 */
function getVueInstance(element: HTMLElement): VueComponentInstance | null {
  const instance = (element as unknown as Record<string, unknown>)
    .__vueParentComponent as VueComponentInstance | undefined;
  return instance ?? null;
}

/**
 * Walks up the DOM tree to find the nearest element with a Vue component instance.
 * This is necessary because not every DOM element has `__vueParentComponent` --
 * only the root element of each component does.
 */
function findNearestVueInstance(
  element: HTMLElement,
  maxDomDepth = 15,
): VueComponentInstance | null {
  let current: HTMLElement | null = element;
  let depth = 0;

  while (current && depth < maxDomDepth) {
    const instance = getVueInstance(current);
    if (instance) {
      return instance;
    }
    current = current.parentElement;
    depth++;
  }

  return null;
}

/**
 * Extracts the component name from a Vue component instance's type object.
 * Checks multiple properties in priority order:
 *   1. `type.__name` (set by `<script setup>` compiler, most common in Vue 3)
 *   2. `type.name` (set by `defineComponent({ name: '...' })`)
 *   3. `type.displayName` (set by some libraries)
 *   4. Derived from `type.__file` (last resort, extracts filename)
 */
function getComponentNameFromInstance(
  instance: VueComponentInstance,
): string | null {
  const type = instance.type;
  if (!type) return null;

  // Script setup name (Vue 3.2.34+)
  if (type.__name) return type.__name;

  // Explicit name from defineComponent
  if (type.name) return type.name;

  // Display name (used by some UI libraries)
  if (type.displayName) return type.displayName;

  // Last resort: derive from __file path
  if (type.__file) {
    return deriveNameFromFile(type.__file);
  }

  return null;
}

/**
 * Derives a component name from a file path.
 * e.g., "/src/components/MyButton.vue" -> "MyButton"
 */
function deriveNameFromFile(filePath: string): string | null {
  // Extract filename without extension
  const parts = filePath.replace(/\\/g, "/").split("/");
  const fileName = parts[parts.length - 1];
  if (!fileName) return null;

  // Remove .vue extension (or other extensions)
  const name = fileName.replace(/\.\w+$/, "");

  // Skip generic index files
  if (name === "index" || name === "Index") {
    // Try to use parent directory name instead
    if (parts.length >= 2) {
      const dirName = parts[parts.length - 2];
      if (dirName && dirName !== "src" && dirName !== "components") {
        return dirName;
      }
    }
    return null;
  }

  return name || null;
}

// =============================================================================
// Public API
// =============================================================================

/**
 * Result from Vue component detection
 */
export interface VueComponentInfo {
  /** Full component path like "<App> <Layout> <Button>" */
  path: string | null;
  /** Array of component names from innermost to outermost */
  components: string[];
}

/**
 * Check if a name looks like minified/production code (single letter or very short).
 * Also detects Vue SFC compiler artifacts like `_sfc_main`.
 */
function isMinifiedName(name: string): boolean {
  // Single letter or two letters that look like minified (e.g., "e", "t", "Zt")
  if (name.length <= 2) return true;
  // All lowercase short names are likely minified
  if (name.length <= 3 && name === name.toLowerCase()) return true;
  // Vue SFC compiler artifacts
  if (name === "_sfc_main" || name === "_sfc_render") return true;
  if (name.startsWith("_sfc_")) return true;
  // Vite HMR artifacts
  if (name.startsWith("__default")) return true;
  return false;
}

/**
 * Walks up the Vue component instance tree to collect component names.
 *
 * @param element - The DOM element to start from
 * @param config - Optional configuration
 * @returns VueComponentInfo with component path and array
 */
export function getVueComponentName(
  element: HTMLElement,
  config?: VueDetectionConfig,
): VueComponentInfo {
  const resolved = resolveConfig(config);

  // Only use cache for 'all' mode - filtered modes must NOT cache because:
  // - Cache lookup happens BEFORE filtering logic runs
  // - Cached results from before filter updates would bypass new filters
  const useCache = resolved.mode === "all";

  if (useCache) {
    const cached = componentCacheAllRef.map.get(element);
    if (cached !== undefined) {
      return cached;
    }
  }

  if (!isVuePage()) {
    const result: VueComponentInfo = { path: null, components: [] };
    if (useCache) {
      componentCacheAllRef.map.set(element, result);
    }
    return result;
  }

  // Collect DOM classes for smart mode
  const domClasses =
    resolved.mode === "smart" ? getAncestorClasses(element) : undefined;

  const components: string[] = [];

  try {
    // First, find the nearest Vue component instance by walking up the DOM
    let instance = findNearestVueInstance(element);
    let depth = 0;

    // Walk up the component instance tree via instance.parent
    while (
      instance &&
      depth < resolved.maxDepth &&
      components.length < resolved.maxComponents
    ) {
      const name = getComponentNameFromInstance(instance);

      // Skip minified names and apply filter
      if (
        name &&
        !isMinifiedName(name) &&
        shouldIncludeComponent(name, depth, resolved, domClasses)
      ) {
        components.push(name);
      }

      instance = instance.parent;
      depth++;
    }
  } catch {
    // Component instance structure may be corrupted or inaccessible
    const result: VueComponentInfo = { path: null, components: [] };
    if (useCache) {
      componentCacheAllRef.map.set(element, result);
    }
    return result;
  }

  if (components.length === 0) {
    const result: VueComponentInfo = { path: null, components: [] };
    if (useCache) {
      componentCacheAllRef.map.set(element, result);
    }
    return result;
  }

  // Build path from outermost to innermost: <App> <Layout> <Button>
  const path = components
    .slice()
    .reverse()
    .map((c) => `<${c}>`)
    .join(" ");

  const result: VueComponentInfo = { path, components };
  if (useCache) {
    componentCacheAllRef.map.set(element, result);
  }
  return result;
}
