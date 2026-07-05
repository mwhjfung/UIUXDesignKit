import { ref, type Ref } from 'vue'

export type DrawStroke = {
  id: string
  points: Array<{ x: number; y: number }>
  color: string
  fixed: boolean
}

// =============================================================================
// Utility functions (shared between composable and toolbar)
// =============================================================================

export function findStrokeAtPoint(
  x: number,
  y: number,
  strokes: DrawStroke[],
  threshold = 12,
): number | null {
  const scrollY = window.scrollY
  for (let i = strokes.length - 1; i >= 0; i--) {
    const stroke = strokes[i]
    if (stroke.points.length < 2) continue
    for (let j = 0; j < stroke.points.length - 1; j++) {
      const a = stroke.points[j]
      const b = stroke.points[j + 1]
      const ay = stroke.fixed ? a.y : a.y - scrollY
      const by = stroke.fixed ? b.y : b.y - scrollY
      const ax = a.x
      const bx = b.x
      const dx = bx - ax
      const dy = by - ay
      const lenSq = dx * dx + dy * dy
      let t = lenSq === 0 ? 0 : ((x - ax) * dx + (y - ay) * dy) / lenSq
      t = Math.max(0, Math.min(1, t))
      const projX = ax + t * dx
      const projY = ay + t * dy
      const dist = Math.hypot(x - projX, y - projY)
      if (dist < threshold) return i
    }
  }
  return null
}

export function classifyStrokeGesture(
  points: Array<{ x: number; y: number }>,
  fixed: boolean,
): string {
  if (points.length < 2) return 'Mark'
  const scrollY = window.scrollY
  const viewportPoints = fixed
    ? points
    : points.map((p) => ({ x: p.x, y: p.y - scrollY }))

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
    return edgePoints > viewportPoints.length * 0.15 ? 'Box' : 'Circle'
  } else if (aspectRatio > 3 && bboxH < 40) {
    return 'Underline'
  } else if (startEndDist > bboxDiag * 0.5) {
    return 'Arrow'
  }
  return 'Drawing'
}

export function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

// =============================================================================
// Composable
// =============================================================================

export function useDrawing() {
  const isDrawMode = ref(false)
  const drawStrokes = ref<DrawStroke[]>([])
  const hoveredDrawingIdx = ref<number | null>(null)
  const drawCanvasRef = ref<HTMLCanvasElement | null>(null)

  // Non-reactive mutable state (like useRef)
  let isDrawing = false
  let currentStroke: Array<{ x: number; y: number }> = []
  const dimAmountRef = { value: 0 }
  const visualHighlightRef = { value: null as number | null }
  const exitingStrokeIdRef = { value: null as string | null }
  const exitingAlphaRef = { value: 1 }
  // Snapshot for synchronous reads inside animation frames
  const drawStrokesRef = { value: drawStrokes.value }

  function updateDrawStrokesRef() {
    drawStrokesRef.value = drawStrokes.value
  }

  // Redraw canvas
  function redrawCanvas(
    ctx: CanvasRenderingContext2D,
    strokes: DrawStroke[],
    hoveredIdx?: number | null,
    dimAmount = 0,
  ) {
    const scrollY = window.scrollY
    const dpr = window.devicePixelRatio || 1
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height)
    ctx.save()
    ctx.scale(dpr, dpr)

    const tracePath = (stroke: DrawStroke, offsetY: number) => {
      const p0 = stroke.points[0]
      ctx.moveTo(p0.x, p0.y - offsetY)
      for (let i = 1; i < stroke.points.length - 1; i++) {
        const curr = stroke.points[i]
        const next = stroke.points[i + 1]
        const midX = (curr.x + next.x) / 2
        const midY = (curr.y + next.y - 2 * offsetY) / 2
        ctx.quadraticCurveTo(curr.x, curr.y - offsetY, midX, midY)
      }
      const last = stroke.points[stroke.points.length - 1]
      ctx.lineTo(last.x, last.y - offsetY)
    }

    for (let si = 0; si < strokes.length; si++) {
      const stroke = strokes[si]
      if (stroke.points.length < 2) continue
      const offsetY = stroke.fixed ? 0 : scrollY
      let alpha = (hoveredIdx != null && si !== hoveredIdx) ? 1 - 0.7 * dimAmount : 1
      if (exitingStrokeIdRef.value && stroke.id === exitingStrokeIdRef.value) {
        alpha *= exitingAlphaRef.value
      }
      ctx.globalAlpha = alpha
      ctx.beginPath()
      ctx.strokeStyle = stroke.color
      ctx.lineWidth = 3
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      tracePath(stroke, offsetY)
      ctx.stroke()
    }
    ctx.globalAlpha = 1
    ctx.restore()
  }

  // Resize canvas to viewport
  function resizeCanvas() {
    const canvas = drawCanvasRef.value
    if (!canvas) return
    const dpr = window.devicePixelRatio || 1
    canvas.style.width = window.innerWidth + 'px'
    canvas.style.height = window.innerHeight + 'px'
    canvas.width = window.innerWidth * dpr
    canvas.height = window.innerHeight * dpr
    const ctx = canvas.getContext('2d')
    if (ctx) redrawCanvas(ctx, drawStrokes.value, visualHighlightRef.value, dimAmountRef.value)
  }

  function getIsDrawing() { return isDrawing }
  function setIsDrawing(v: boolean) { isDrawing = v }
  function getCurrentStroke() { return currentStroke }
  function setCurrentStroke(v: Array<{ x: number; y: number }>) { currentStroke = v }

  return {
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
  }
}
