// =============================================================================
// Vue 3 Source Location Detection Utilities
// =============================================================================
//
// This module provides utilities for detecting Vue 3 source file locations from
// DOM elements. It works by accessing Vue's internal component instance tree and
// extracting `type.__file` information that's available in development builds.
//
// Compatibility:
// - Vue 3.0+ (Composition API era)
// - Vue 3.2+ (with `<script setup>` __name support)
// - Vue 3.3+ (with improved dev tooling)
//
// Limitations:
// - Only works in development builds (production builds strip __file)
// - Vue does not expose line numbers like React's _debugSource, so lineNumber
//   is always set to 1
// - Requires `__vueParentComponent` on DOM elements (dev mode only)
// =============================================================================

/**
 * Source location information for a Vue component
 */
export interface SourceLocation {
  /** Absolute or relative file path */
  fileName: string;
  /** Line number (1-indexed). Always 1 for Vue as line info is not exposed. */
  lineNumber: number;
  /** Column number (0-indexed, always undefined for Vue) */
  columnNumber?: number;
  /** Component display name if available */
  componentName?: string;
  /** Vue version detected */
  vueVersion?: string;
}

/**
 * Result of source location detection
 */
export interface SourceLocationResult {
  /** Whether source location was found */
  found: boolean;
  /** Source location data (if found) */
  source?: SourceLocation;
  /** Reason if not found */
  reason?: SourceLocationNotFoundReason;
  /** Whether the app appears to be a Vue app */
  isVueApp: boolean;
  /** Whether running in production mode */
  isProduction: boolean;
}

/**
 * Reasons why source location might not be found
 */
export type SourceLocationNotFoundReason =
  | "not-vue-app"
  | "production-build"
  | "no-instance"
  | "no-file-info"
  | "element-not-in-vue-tree"
  | "unknown";

/**
 * Vue 3 component instance (minimal subset for source location)
 */
interface VueComponentInstance {
  type: {
    name?: string;
    __name?: string;
    displayName?: string;
    __file?: string;
  };
  parent: VueComponentInstance | null;
  appContext?: unknown;
}

// =============================================================================
// Vue App Detection
// =============================================================================

/**
 * Checks if the page appears to be running a Vue 3 application
 *
 * @returns Object with detection results
 */
export function detectVueApp(): {
  isVue: boolean;
  version?: string;
  isProduction: boolean;
} {
  if (typeof window === "undefined") {
    return { isVue: false, isProduction: true };
  }

  // Check for Vue DevTools hook (most reliable)
  const devToolsHook = (window as unknown as Record<string, unknown>)
    .__VUE_DEVTOOLS_GLOBAL_HOOK__;

  if (devToolsHook && typeof devToolsHook === "object") {
    const hook = devToolsHook as Record<string, unknown>;

    // Vue 3 DevTools hook stores Vue apps
    const apps = hook.apps as Set<unknown> | undefined;
    const hasApps = apps && apps.size > 0;

    // Check for Vue version from the hook
    const vueVersion = hook.Vue
      ? ((hook.Vue as Record<string, unknown>).version as string | undefined)
      : undefined;

    // In dev mode, __VUE_PROD_DEVTOOLS__ or __VUE__ globals may be set
    const isProd =
      typeof (window as unknown as Record<string, unknown>).__VUE_PROD_DEVTOOLS__ ===
      "undefined";

    if (hasApps || vueVersion) {
      return {
        isVue: true,
        version: vueVersion || "3.x",
        isProduction: false, // DevTools hook with apps means dev mode
      };
    }
  }

  // Fallback: Check for __vue_app__ on root elements
  const commonRoots = ["#app", "#root", "[data-v-app]"];
  for (const selector of commonRoots) {
    const el = document.querySelector(selector);
    if (el && "__vue_app__" in el) {
      const vueApp = (el as unknown as Record<string, unknown>).__vue_app__ as
        | Record<string, unknown>
        | undefined;
      const version = vueApp?.version as string | undefined;
      return {
        isVue: true,
        version: version || "3.x",
        // If __vue_app__ exists but no devtools hook, likely production
        isProduction: !devToolsHook,
      };
    }
  }

  // Check for __vueParentComponent on body children
  if (document.body) {
    for (const child of document.body.children) {
      if ("__vueParentComponent" in child) {
        return {
          isVue: true,
          version: "3.x",
          isProduction: !devToolsHook,
        };
      }
    }
  }

  return { isVue: false, isProduction: true };
}

// =============================================================================
// Component Instance Access
// =============================================================================

/**
 * Gets the Vue 3 component instance from a DOM element
 */
function getInstanceFromElement(
  element: HTMLElement,
): VueComponentInstance | null {
  const instance = (element as unknown as Record<string, unknown>)
    .__vueParentComponent as VueComponentInstance | undefined;
  return instance ?? null;
}

/**
 * Walks up the DOM tree to find the nearest element with a Vue component instance
 */
function findNearestInstance(
  element: HTMLElement,
  maxDomDepth = 15,
): VueComponentInstance | null {
  let current: HTMLElement | null = element;
  let depth = 0;

  while (current && depth < maxDomDepth) {
    const instance = getInstanceFromElement(current);
    if (instance) {
      return instance;
    }
    current = current.parentElement;
    depth++;
  }

  return null;
}

/**
 * Gets the display name of a Vue component from its instance
 */
function getComponentName(instance: VueComponentInstance): string | null {
  if (!instance.type) return null;
  return instance.type.__name || instance.type.name || instance.type.displayName || null;
}

// =============================================================================
// Source Location Finding
// =============================================================================

/**
 * Walks up the component instance tree to find the nearest component with
 * `__file` info.
 *
 * @param instance - Starting component instance
 * @param maxDepth - Maximum tree depth to traverse (default: 50)
 * @returns Object with file info and component name, or null
 */
function findFileSource(
  instance: VueComponentInstance,
  maxDepth = 50,
): { fileName: string; componentName: string | null } | null {
  let current: VueComponentInstance | null = instance;
  let depth = 0;

  while (current && depth < maxDepth) {
    if (current.type?.__file) {
      return {
        fileName: current.type.__file,
        componentName: getComponentName(current),
      };
    }

    current = current.parent;
    depth++;
  }

  return null;
}

// =============================================================================
// Public API
// =============================================================================

/**
 * Gets the source file location for a DOM element in a Vue 3 application.
 *
 * This function attempts to extract the source file path where a Vue component
 * is defined. This only works in development mode as production builds strip
 * the `__file` property.
 *
 * Note: Vue does not expose line numbers like React's `_debugSource`, so
 * `lineNumber` will always be 1.
 *
 * @param element - DOM element to get source location for
 * @returns SourceLocationResult with location info or reason for failure
 *
 * @example
 * ```ts
 * const result = getSourceLocation(element);
 * if (result.found && result.source) {
 *   console.log(`${result.source.fileName}:${result.source.lineNumber}`);
 *   // Output: "/src/components/MyButton.vue:1"
 * }
 * ```
 */
export function getSourceLocation(element: HTMLElement): SourceLocationResult {
  // Detect Vue environment
  const vueInfo = detectVueApp();

  if (!vueInfo.isVue) {
    return {
      found: false,
      reason: "not-vue-app",
      isVueApp: false,
      isProduction: true,
    };
  }

  if (vueInfo.isProduction) {
    return {
      found: false,
      reason: "production-build",
      isVueApp: true,
      isProduction: true,
    };
  }

  // Find the nearest Vue component instance by walking up the DOM
  const instance = findNearestInstance(element);

  if (!instance) {
    return {
      found: false,
      reason: "no-instance",
      isVueApp: true,
      isProduction: false,
    };
  }

  // Walk up the instance tree to find __file info
  const fileInfo = findFileSource(instance);

  if (!fileInfo) {
    return {
      found: false,
      reason: "no-file-info",
      isVueApp: true,
      isProduction: false,
    };
  }

  return {
    found: true,
    source: {
      fileName: fileInfo.fileName,
      // Vue does not expose line numbers at the DOM level
      lineNumber: 1,
      columnNumber: undefined,
      componentName: fileInfo.componentName || undefined,
      vueVersion: vueInfo.version,
    },
    isVueApp: true,
    isProduction: false,
  };
}

/**
 * Formats a source location as a clickable file path string
 *
 * @param source - Source location object
 * @param format - Output format: "vscode" for VSCode URL, "path" for file:line format
 * @returns Formatted string
 *
 * @example
 * ```ts
 * formatSourceLocation(source, "path")
 * // Returns: "src/components/MyButton.vue:1"
 *
 * formatSourceLocation(source, "vscode")
 * // Returns: "vscode://file/absolute/path/src/components/MyButton.vue:1"
 * ```
 */
export function formatSourceLocation(
  source: SourceLocation,
  format: "path" | "vscode" = "path",
): string {
  const { fileName, lineNumber, columnNumber } = source;

  // Build line:column suffix
  let location = `${fileName}:${lineNumber}`;
  if (columnNumber !== undefined) {
    location += `:${columnNumber}`;
  }

  if (format === "vscode") {
    // VSCode can open files via URL protocol
    return `vscode://file${fileName.startsWith("/") ? "" : "/"}${location}`;
  }

  return location;
}

/**
 * Gets source locations for multiple elements at once
 *
 * @param elements - Array of DOM elements
 * @returns Array of source location results
 */
export function getSourceLocations(
  elements: HTMLElement[],
): SourceLocationResult[] {
  return elements.map((element) => getSourceLocation(element));
}

/**
 * Finds the nearest Vue component ancestor that has source info.
 *
 * Useful when clicking on a deeply nested element (like text or an icon)
 * and wanting to find the component that contains it.
 *
 * @param element - Starting DOM element
 * @param maxAncestors - Maximum DOM ancestors to check (default: 10)
 * @returns Source location result
 */
export function findNearestComponentSource(
  element: HTMLElement,
  maxAncestors = 10,
): SourceLocationResult {
  let current: HTMLElement | null = element;
  let depth = 0;

  while (current && depth < maxAncestors) {
    const result = getSourceLocation(current);

    // Return first successful result
    if (result.found) {
      return result;
    }

    // If we found an instance but no source, keep looking up DOM
    current = current.parentElement;
    depth++;
  }

  // Return result for original element (will explain why not found)
  return getSourceLocation(element);
}

/**
 * Gets all component sources in the ancestor chain.
 *
 * Useful for understanding the component hierarchy.
 *
 * @param element - Starting DOM element
 * @returns Array of unique source locations from element up to root
 */
export function getComponentHierarchy(element: HTMLElement): SourceLocation[] {
  const instance = findNearestInstance(element);
  if (!instance) {
    return [];
  }

  const sources: SourceLocation[] = [];
  const seenFiles = new Set<string>();

  let current: VueComponentInstance | null = instance;
  let depth = 0;
  const maxDepth = 100;

  while (current && depth < maxDepth) {
    if (current.type?.__file) {
      const key = current.type.__file;

      // Avoid duplicates
      if (!seenFiles.has(key)) {
        seenFiles.add(key);
        sources.push({
          fileName: current.type.__file,
          // Vue does not expose line numbers at the DOM level
          lineNumber: 1,
          columnNumber: undefined,
          componentName: getComponentName(current) || undefined,
        });
      }
    }

    current = current.parent;
    depth++;
  }

  return sources;
}

/**
 * Checks if source location detection is likely to work in the current environment
 *
 * @returns Object describing support status
 */
export function checkSourceLocationSupport(): {
  supported: boolean;
  reason: string;
  suggestions: string[];
} {
  const vueInfo = detectVueApp();

  if (!vueInfo.isVue) {
    return {
      supported: false,
      reason: "No Vue 3 application detected on this page",
      suggestions: [
        "Ensure you're on a page built with Vue 3",
        "The page may use a different framework (React, Angular, etc.)",
      ],
    };
  }

  if (vueInfo.isProduction) {
    return {
      supported: false,
      reason: "Production build detected - __file info is stripped",
      suggestions: [
        "Run the application in development mode",
        "Ensure your bundler (Vite/webpack) includes __file in development",
        "Check that vue-loader or @vitejs/plugin-vue is configured for dev mode",
      ],
    };
  }

  // Check for Vue DevTools
  const hasDevTools =
    typeof window !== "undefined" &&
    !!(window as unknown as Record<string, unknown>)
      .__VUE_DEVTOOLS_GLOBAL_HOOK__;

  if (!hasDevTools) {
    return {
      supported: true,
      reason:
        "Development mode detected, but Vue DevTools not installed",
      suggestions: [
        "Install Vue DevTools browser extension for best results",
        "Source detection may still work without it",
      ],
    };
  }

  return {
    supported: true,
    reason: `Vue ${vueInfo.version || "3.x"} development mode detected`,
    suggestions: [],
  };
}
