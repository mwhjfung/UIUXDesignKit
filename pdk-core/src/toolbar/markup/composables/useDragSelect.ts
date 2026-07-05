import { ref, type Ref } from 'vue'
import {
  identifyElement,
  closestCrossingShadow,
} from '../utils/element-identification'
import styles from '../styles/page-toolbar.module.scss'

export function useDragSelect() {
  const isDragging = ref(false)

  // All non-reactive (DOM refs / mutable state)
  let mouseDownPos: { x: number; y: number } | null = null
  let dragStart: { x: number; y: number } | null = null
  let dragRectEl: HTMLDivElement | null = null
  let highlightsContainerEl: HTMLDivElement | null = null
  let justFinishedDrag = false
  let lastElementUpdate = 0

  const DRAG_THRESHOLD = 8
  const ELEMENT_UPDATE_THROTTLE = 50

  const TEXT_TAGS = new Set([
    'P', 'SPAN', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6',
    'LI', 'TD', 'TH', 'LABEL', 'BLOCKQUOTE', 'FIGCAPTION',
    'CAPTION', 'LEGEND', 'DT', 'DD', 'PRE', 'CODE',
    'EM', 'STRONG', 'B', 'I', 'U', 'S', 'A',
    'TIME', 'ADDRESS', 'CITE', 'Q', 'ABBR', 'DFN',
    'MARK', 'SMALL', 'SUB', 'SUP',
  ])

  function setDragRectEl(el: HTMLDivElement | null) { dragRectEl = el }
  function setHighlightsContainerEl(el: HTMLDivElement | null) { highlightsContainerEl = el }
  function getJustFinishedDrag() { return justFinishedDrag }
  function setJustFinishedDrag(v: boolean) { justFinishedDrag = v }

  function handleMouseDown(e: MouseEvent) {
    const target = (e.composedPath()[0] || e.target) as HTMLElement
    if (closestCrossingShadow(target, '[data-feedback-toolbar]')) return
    if (closestCrossingShadow(target, '[data-annotation-marker]')) return
    if (closestCrossingShadow(target, '[data-annotation-popup]')) return
    if (TEXT_TAGS.has(target.tagName) || target.isContentEditable) return

    mouseDownPos = { x: e.clientX, y: e.clientY }
  }

  function handleMouseMove(e: MouseEvent) {
    if (!mouseDownPos) return

    const dx = e.clientX - mouseDownPos.x
    const dy = e.clientY - mouseDownPos.y
    const distance = dx * dx + dy * dy
    const thresholdSq = DRAG_THRESHOLD * DRAG_THRESHOLD

    if (!isDragging.value && distance >= thresholdSq) {
      dragStart = mouseDownPos
      isDragging.value = true
    }

    if ((isDragging.value || distance >= thresholdSq) && dragStart) {
      // Direct DOM update for drag rectangle
      if (dragRectEl) {
        const left = Math.min(dragStart.x, e.clientX)
        const top = Math.min(dragStart.y, e.clientY)
        const width = Math.abs(e.clientX - dragStart.x)
        const height = Math.abs(e.clientY - dragStart.y)
        dragRectEl.style.transform = `translate(${left}px, ${top}px)`
        dragRectEl.style.width = `${width}px`
        dragRectEl.style.height = `${height}px`
      }

      // Throttle element detection
      const now = Date.now()
      if (now - lastElementUpdate < ELEMENT_UPDATE_THROTTLE) return
      lastElementUpdate = now

      const startX = dragStart.x
      const startY = dragStart.y
      const left = Math.min(startX, e.clientX)
      const top = Math.min(startY, e.clientY)
      const right = Math.max(startX, e.clientX)
      const bottom = Math.max(startY, e.clientY)
      const midX = (left + right) / 2
      const midY = (top + bottom) / 2

      const candidateElements = new Set<HTMLElement>()
      const points = [
        [left, top], [right, top], [left, bottom], [right, bottom],
        [midX, midY], [midX, top], [midX, bottom], [left, midY], [right, midY],
      ]

      for (const [x, y] of points) {
        const elements = document.elementsFromPoint(x, y)
        for (const el of elements) {
          if (el instanceof HTMLElement) candidateElements.add(el)
        }
      }

      const nearbyElements = document.querySelectorAll(
        'button, a, input, img, p, h1, h2, h3, h4, h5, h6, li, label, td, th, div, span, section, article, aside, nav',
      )
      for (const el of nearbyElements) {
        if (el instanceof HTMLElement) {
          const rect = el.getBoundingClientRect()
          const centerX = rect.left + rect.width / 2
          const centerY = rect.top + rect.height / 2
          const centerInside = centerX >= left && centerX <= right && centerY >= top && centerY <= bottom
          const overlapX = Math.min(rect.right, right) - Math.max(rect.left, left)
          const overlapY = Math.min(rect.bottom, bottom) - Math.max(rect.top, top)
          const overlapArea = overlapX > 0 && overlapY > 0 ? overlapX * overlapY : 0
          const elementArea = rect.width * rect.height
          const overlapRatio = elementArea > 0 ? overlapArea / elementArea : 0
          if (centerInside || overlapRatio > 0.5) candidateElements.add(el)
        }
      }

      const allMatching: DOMRect[] = []
      const meaningfulTags = new Set([
        'BUTTON', 'A', 'INPUT', 'IMG', 'P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6',
        'LI', 'LABEL', 'TD', 'TH', 'SECTION', 'ARTICLE', 'ASIDE', 'NAV',
      ])

      for (const el of candidateElements) {
        if (closestCrossingShadow(el, '[data-feedback-toolbar]') || closestCrossingShadow(el, '[data-annotation-marker]')) continue
        const rect = el.getBoundingClientRect()
        if (rect.width > window.innerWidth * 0.8 && rect.height > window.innerHeight * 0.5) continue
        if (rect.width < 10 || rect.height < 10) continue

        if (rect.left < right && rect.right > left && rect.top < bottom && rect.bottom > top) {
          const tagName = el.tagName
          let shouldInclude = meaningfulTags.has(tagName)
          if (!shouldInclude && (tagName === 'DIV' || tagName === 'SPAN')) {
            const hasText = el.textContent && el.textContent.trim().length > 0
            const isInteractive = el.onclick !== null ||
              el.getAttribute('role') === 'button' ||
              el.getAttribute('role') === 'link' ||
              el.classList.contains('clickable') ||
              el.hasAttribute('data-clickable')
            if ((hasText || isInteractive) && !el.querySelector('p, h1, h2, h3, h4, h5, h6, button, a')) {
              shouldInclude = true
            }
          }
          if (shouldInclude) {
            let dominated = false
            for (const existingRect of allMatching) {
              if (existingRect.left <= rect.left && existingRect.right >= rect.right &&
                  existingRect.top <= rect.top && existingRect.bottom >= rect.bottom) {
                dominated = true
                break
              }
            }
            if (!dominated) allMatching.push(rect)
          }
        }
      }

      // Direct DOM update for highlights
      if (highlightsContainerEl) {
        const container = highlightsContainerEl
        while (container.children.length > allMatching.length) {
          container.removeChild(container.lastChild!)
        }
        allMatching.forEach((rect, i) => {
          let div = container.children[i] as HTMLDivElement
          if (!div) {
            div = document.createElement('div')
            div.className = styles.selectedElementHighlight
            container.appendChild(div)
          }
          div.style.transform = `translate(${rect.left}px, ${rect.top}px)`
          div.style.width = `${rect.width}px`
          div.style.height = `${rect.height}px`
        })
      }
    }
  }

  function handleMouseUp(e: MouseEvent): {
    finalElements: { element: HTMLElement; rect: DOMRect }[]
    empty: boolean
    bounds?: { left: number; top: number; right: number; bottom: number }
    x: number
    y: number
    left: number
    top: number
    right: number
    bottom: number
  } | null {
    const wasDragging = isDragging.value
    const ds = dragStart

    if (isDragging.value && ds) {
      justFinishedDrag = true

      const left = Math.min(ds.x, e.clientX)
      const top = Math.min(ds.y, e.clientY)
      const right = Math.max(ds.x, e.clientX)
      const bottom = Math.max(ds.y, e.clientY)

      const allMatching: { element: HTMLElement; rect: DOMRect }[] = []
      const selector = 'button, a, input, img, p, h1, h2, h3, h4, h5, h6, li, label, td, th'

      document.querySelectorAll(selector).forEach((el) => {
        if (!(el instanceof HTMLElement)) return
        if (closestCrossingShadow(el, '[data-feedback-toolbar]') || closestCrossingShadow(el, '[data-annotation-marker]')) return
        const rect = el.getBoundingClientRect()
        if (rect.width > window.innerWidth * 0.8 && rect.height > window.innerHeight * 0.5) return
        if (rect.width < 10 || rect.height < 10) return
        if (rect.left < right && rect.right > left && rect.top < bottom && rect.bottom > top) {
          allMatching.push({ element: el, rect })
        }
      })

      const finalElements = allMatching.filter(
        ({ element: el }) => !allMatching.some(({ element: other }) => other !== el && el.contains(other)),
      )

      mouseDownPos = null
      dragStart = null
      isDragging.value = false
      clearHighlights()

      return {
        finalElements,
        empty: finalElements.length === 0,
        x: (e.clientX / window.innerWidth) * 100,
        y: e.clientY + window.scrollY,
        left, top, right, bottom,
      }
    } else if (wasDragging) {
      justFinishedDrag = true
    }

    mouseDownPos = null
    dragStart = null
    isDragging.value = false
    clearHighlights()
    return null
  }

  function clearHighlights() {
    if (highlightsContainerEl) {
      while (highlightsContainerEl.firstChild) {
        highlightsContainerEl.removeChild(highlightsContainerEl.firstChild)
      }
    }
  }

  function reset() {
    mouseDownPos = null
    dragStart = null
    isDragging.value = false
    justFinishedDrag = false
  }

  return {
    isDragging,
    setDragRectEl,
    setHighlightsContainerEl,
    getJustFinishedDrag,
    setJustFinishedDrag,
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
    reset,
  }
}
