import { ref } from 'vue'

export type HoverInfo = {
  element: string
  elementName: string
  elementPath: string
  rect: DOMRect | null
  reactComponents?: string | null
}

export function useHover() {
  const hoverInfo = ref<HoverInfo | null>(null)
  const hoverPosition = ref({ x: 0, y: 0 })

  function setHover(info: HoverInfo | null, position?: { x: number; y: number }) {
    hoverInfo.value = info
    if (position) {
      hoverPosition.value = position
    }
  }

  function clearHover() {
    hoverInfo.value = null
  }

  return {
    hoverInfo,
    hoverPosition,
    setHover,
    clearHover,
  }
}
