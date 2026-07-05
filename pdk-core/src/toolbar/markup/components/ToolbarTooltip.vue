<script setup lang="ts">
import { ref, onUnmounted, Teleport } from 'vue'
import { originalSetTimeout } from '../utils/freeze-animations'

const props = defineProps<{
  content: string
  isTransitioning?: boolean
}>()

const isHovering = ref(false)
const visible = ref(false)
const shouldRender = ref(false)
const position = ref({ top: 0, right: 0 })
const triggerRef = ref<HTMLSpanElement | null>(null)

let timeoutId: ReturnType<typeof setTimeout> | null = null
let exitTimeoutId: ReturnType<typeof setTimeout> | null = null

function updatePosition() {
  if (triggerRef.value) {
    const rect = triggerRef.value.getBoundingClientRect()
    position.value = {
      top: rect.top + rect.height / 2,
      right: window.innerWidth - rect.left + 8,
    }
  }
}

function handleMouseEnter() {
  isHovering.value = true
  shouldRender.value = true
  if (exitTimeoutId) {
    clearTimeout(exitTimeoutId)
    exitTimeoutId = null
  }
  updatePosition()
  timeoutId = originalSetTimeout(() => {
    visible.value = true
  }, 500)
}

function handleMouseLeave() {
  isHovering.value = false
  if (timeoutId) {
    clearTimeout(timeoutId)
    timeoutId = null
  }
  visible.value = false
  exitTimeoutId = originalSetTimeout(() => {
    shouldRender.value = false
  }, 150)
}

onUnmounted(() => {
  if (timeoutId) clearTimeout(timeoutId)
  if (exitTimeoutId) clearTimeout(exitTimeoutId)
})
</script>

<template>
  <span
    ref="triggerRef"
    @mouseenter="handleMouseEnter"
    @mouseleave="handleMouseLeave"
  >
    <slot />
  </span>
  <Teleport to="body">
    <div
      v-if="shouldRender"
      data-feedback-toolbar
      :style="{
        position: 'fixed',
        top: position.top + 'px',
        right: position.right + 'px',
        transform: 'translateY(-50%)',
        padding: '6px 10px',
        background: '#383838',
        color: 'rgba(255, 255, 255, 0.7)',
        fontSize: '11px',
        fontWeight: 400,
        lineHeight: '14px',
        borderRadius: '10px',
        width: '180px',
        textAlign: 'left',
        zIndex: 100020,
        pointerEvents: 'none',
        boxShadow: '0px 1px 8px rgba(0, 0, 0, 0.28)',
        opacity: visible && !isTransitioning ? 1 : 0,
        transition: 'opacity 0.15s ease',
      }"
    >
      {{ content }}
    </div>
  </Teleport>
</template>
