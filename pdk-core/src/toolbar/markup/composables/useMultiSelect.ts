import { ref } from 'vue'

export type MultiSelectItem = {
  element: HTMLElement
  rect: DOMRect
  name: string
  path: string
  reactComponents?: string
}

export function useMultiSelect() {
  const pendingMultiSelectElements = ref<MultiSelectItem[]>([])

  // Modifier key tracking (non-reactive — read via ref-like object)
  const modifiersHeld = { cmd: false, shift: false }

  function getModifiersHeld() {
    return modifiersHeld
  }

  function addElement(item: MultiSelectItem) {
    pendingMultiSelectElements.value = [...pendingMultiSelectElements.value, item]
  }

  function removeElementAt(index: number) {
    pendingMultiSelectElements.value = pendingMultiSelectElements.value.filter((_, i) => i !== index)
  }

  function toggleElement(element: HTMLElement, item: MultiSelectItem) {
    const existingIndex = pendingMultiSelectElements.value.findIndex(
      (el) => el.element === element,
    )
    if (existingIndex >= 0) {
      removeElementAt(existingIndex)
    } else {
      addElement(item)
    }
  }

  function clear() {
    pendingMultiSelectElements.value = []
  }

  function resetModifiers() {
    modifiersHeld.cmd = false
    modifiersHeld.shift = false
  }

  return {
    pendingMultiSelectElements,
    getModifiersHeld,
    modifiersHeld,
    addElement,
    removeElementAt,
    toggleElement,
    clear,
    resetModifiers,
  }
}
