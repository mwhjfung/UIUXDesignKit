import { type Ref } from 'vue'
import {
  identifyElement,
  closestCrossingShadow,
} from '../utils/element-identification'
import { originalSetTimeout } from '../utils/freeze-animations'
import type { Annotation } from '../types'
import type { OutputDetailLevel, ReactComponentMode } from './useToolbarSettings'
import type { DrawStroke } from './useDrawing'

// =============================================================================
// Utility: deep element from point (also used elsewhere)
// =============================================================================

export function deepElementFromPoint(x: number, y: number): HTMLElement | null {
  let element = document.elementFromPoint(x, y) as HTMLElement | null
  if (!element) return null
  while (element?.shadowRoot) {
    const deeper = element.shadowRoot.elementFromPoint(x, y) as HTMLElement | null
    if (!deeper || deeper === element) break
    element = deeper
  }
  return element
}

export function isElementFixed(element: HTMLElement): boolean {
  let current: HTMLElement | null = element
  while (current && current !== document.body) {
    const style = window.getComputedStyle(current)
    if (style.position === 'fixed' || style.position === 'sticky') return true
    current = current.parentElement
  }
  return false
}

// =============================================================================
// Generate Markdown Output
// =============================================================================

export function generateOutput(
  annotations: Annotation[],
  pathname: string,
  detailLevel: OutputDetailLevel = 'standard',
  reactMode: ReactComponentMode = 'filtered',
): string {
  if (annotations.length === 0) return ''

  const viewport =
    typeof window !== 'undefined' ? `${window.innerWidth}\u00D7${window.innerHeight}` : 'unknown'

  let output = `## Page Feedback: ${pathname}\n`

  if (detailLevel === 'forensic') {
    output += `\n**Environment:**\n`
    output += `- Viewport: ${viewport}\n`
    if (typeof window !== 'undefined') {
      output += `- URL: ${window.location.href}\n`
      output += `- User Agent: ${navigator.userAgent}\n`
      output += `- Timestamp: ${new Date().toISOString()}\n`
      output += `- Device Pixel Ratio: ${window.devicePixelRatio}\n`
    }
    output += `\n---\n`
  } else if (detailLevel !== 'compact') {
    output += `**Viewport:** ${viewport}\n`
  }
  output += '\n'

  annotations.forEach((a, i) => {
    if (detailLevel === 'compact') {
      output += `${i + 1}. **${a.element}**: ${a.comment}`
      if (a.selectedText) {
        output += ` (re: "${a.selectedText.slice(0, 30)}${a.selectedText.length > 30 ? '...' : ''}")`
      }
      output += '\n'
    } else if (detailLevel === 'forensic') {
      output += `### ${i + 1}. ${a.element}\n`
      if (a.isMultiSelect && a.fullPath) {
        output += `*Forensic data shown for first element of selection*\n`
      }
      if (a.fullPath) output += `**Full DOM Path:** ${a.fullPath}\n`
      if (a.cssClasses) output += `**CSS Classes:** ${a.cssClasses}\n`
      if (a.boundingBox) {
        output += `**Position:** x:${Math.round(a.boundingBox.x)}, y:${Math.round(a.boundingBox.y)} (${Math.round(a.boundingBox.width)}\u00D7${Math.round(a.boundingBox.height)}px)\n`
      }
      output += `**Annotation at:** ${a.x.toFixed(1)}% from left, ${Math.round(a.y)}px from top\n`
      if (a.selectedText) output += `**Selected text:** "${a.selectedText}"\n`
      if (a.nearbyText && !a.selectedText) output += `**Context:** ${a.nearbyText.slice(0, 100)}\n`
      if (a.computedStyles) output += `**Computed Styles:** ${a.computedStyles}\n`
      if (a.accessibility) output += `**Accessibility:** ${a.accessibility}\n`
      if (a.nearbyElements) output += `**Nearby Elements:** ${a.nearbyElements}\n`
      if (a.reactComponents) output += `**React:** ${a.reactComponents}\n`
      output += `**Feedback:** ${a.comment}\n\n`
    } else {
      output += `### ${i + 1}. ${a.element}\n`
      output += `**Location:** ${a.elementPath}\n`
      if (a.reactComponents) output += `**React:** ${a.reactComponents}\n`
      if (detailLevel === 'detailed') {
        if (a.cssClasses) output += `**Classes:** ${a.cssClasses}\n`
        if (a.boundingBox) {
          output += `**Position:** ${Math.round(a.boundingBox.x)}px, ${Math.round(a.boundingBox.y)}px (${Math.round(a.boundingBox.width)}\u00D7${Math.round(a.boundingBox.height)}px)\n`
        }
      }
      if (a.selectedText) output += `**Selected text:** "${a.selectedText}"\n`
      if (detailLevel === 'detailed' && a.nearbyText && !a.selectedText) {
        output += `**Context:** ${a.nearbyText.slice(0, 100)}\n`
      }
      output += `**Feedback:** ${a.comment}\n\n`
    }
  })

  return output.trim()
}

// =============================================================================
// Composable
// =============================================================================

export function useCopyOutput(options: {
  annotations: Ref<Annotation[]>
  drawStrokes: Ref<DrawStroke[]>
  drawCanvasRef: Ref<HTMLCanvasElement | null>
  pathname: string
  getOutputDetail: () => OutputDetailLevel
  getEffectiveReactMode: () => ReactComponentMode
  getAutoClearAfterCopy: () => boolean
  clearAll: () => void
  copyToClipboard: boolean
  onCopy?: (markdown: string) => void
}) {
  const {
    annotations,
    drawStrokes,
    drawCanvasRef,
    pathname,
    getOutputDetail,
    getEffectiveReactMode,
    getAutoClearAfterCopy,
    clearAll,
    copyToClipboard: shouldCopyToClipboard,
    onCopy,
  } = options

  async function copyOutput() {
    const displayUrl =
      typeof window !== 'undefined'
        ? window.location.pathname + window.location.search + window.location.hash
        : pathname

    let output = generateOutput(
      annotations.value,
      displayUrl,
      getOutputDetail(),
      getEffectiveReactMode(),
    )
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
      const scrollY = window.scrollY

      for (let strokeIdx = 0; strokeIdx < drawStrokes.value.length; strokeIdx++) {
        if (linkedDrawingIndices.has(strokeIdx)) continue
        const stroke = drawStrokes.value[strokeIdx]
        if (stroke.points.length < 2) continue

        const viewportPoints = stroke.fixed
          ? stroke.points
          : stroke.points.map((p) => ({ x: p.x, y: p.y - scrollY }))

        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
        for (const p of viewportPoints) {
          minX = Math.min(minX, p.x)
          minY = Math.min(minY, p.y)
          maxX = Math.max(maxX, p.x)
          maxY = Math.max(maxY, p.y)
        }
        const bboxW = maxX - minX
        const bboxH = maxY - minY
        const bboxDiag = Math.hypot(bboxW, bboxH)

        const start = viewportPoints[0]
        const end = viewportPoints[viewportPoints.length - 1]
        const startEndDist = Math.hypot(end.x - start.x, end.y - start.y)

        let gesture: 'circle' | 'box' | 'underline' | 'arrow' | 'drawing'
        const closedLoop = startEndDist < bboxDiag * 0.35
        const aspectRatio = bboxW / Math.max(bboxH, 1)

        if (closedLoop && bboxDiag > 20) {
          const edgeThreshold = Math.max(bboxW, bboxH) * 0.15
          let edgePoints = 0
          for (const p of viewportPoints) {
            const nearLeft = p.x - minX < edgeThreshold
            const nearRight = maxX - p.x < edgeThreshold
            const nearTop = p.y - minY < edgeThreshold
            const nearBottom = maxY - p.y < edgeThreshold
            if ((nearLeft || nearRight) && (nearTop || nearBottom)) edgePoints++
          }
          gesture = edgePoints > viewportPoints.length * 0.15 ? 'box' : 'circle'
        } else if (aspectRatio > 3 && bboxH < 40) {
          gesture = 'underline'
        } else if (startEndDist > bboxDiag * 0.5) {
          gesture = 'arrow'
        } else {
          gesture = 'drawing'
        }

        const sampleCount = Math.min(10, viewportPoints.length)
        const step = Math.max(1, Math.floor(viewportPoints.length / sampleCount))
        const seenElements = new Set<HTMLElement>()
        const elementNames: string[] = []

        const samplePoints = [start]
        for (let i = step; i < viewportPoints.length - 1; i += step) {
          samplePoints.push(viewportPoints[i])
        }
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

        if ((gesture === 'circle' || gesture === 'box') && elementNames.length > 0) {
          const verb = gesture === 'box' ? 'Boxed' : 'Circled'
          desc = `${verb} **${elementNames[0]}**${elementNames.length > 1 ? ` (and ${elementNames.slice(1).join(', ')})` : ''} (region: ${region})`
        } else if (gesture === 'underline' && elementNames.length > 0) {
          desc = `Underlined **${elementNames[0]}** (${region})`
        } else if (gesture === 'arrow' && elementNames.length >= 2) {
          desc = `Arrow from **${elementNames[0]}** to **${elementNames[elementNames.length - 1]}** (${Math.round(start.x)},${Math.round(start.y)} \u2192 ${Math.round(end.x)},${Math.round(end.y)})`
        } else if (elementNames.length > 0) {
          desc = `${gesture === 'arrow' ? 'Arrow' : 'Drawing'} near **${elementNames.join('**, **')}** (region: ${region})`
        } else {
          desc = `Drawing at ${region}`
        }
        strokeDescriptions.push(desc)
      }

      if (canvas) canvas.style.visibility = ''

      if (strokeDescriptions.length > 0) {
        output += `\n**Drawings:**\n`
        strokeDescriptions.forEach((d, i) => {
          output += `${i + 1}. ${d}\n`
        })
      }
    }

    if (shouldCopyToClipboard) {
      try {
        await navigator.clipboard.writeText(output)
      } catch {
        // Clipboard may fail
      }
    }

    onCopy?.(output)
    return output
  }

  return { copyOutput, generateOutput }
}
