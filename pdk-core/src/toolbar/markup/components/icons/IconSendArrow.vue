<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(
  defineProps<{ size?: number; state?: 'idle' | 'sending' | 'sent' | 'failed' }>(),
  { size: 24, state: 'idle' }
)

const showArrow = computed(() => props.state === 'idle')
const showCheck = computed(() => props.state === 'sent')
const showError = computed(() => props.state === 'failed')
const isSending = computed(() => props.state === 'sending')

const arrowStyle = computed(() => ({
  opacity: showArrow.value ? 1 : isSending.value ? 0.5 : 0,
  transform: showArrow.value ? 'scale(1)' : 'scale(0.8)',
  transformOrigin: 'center',
}))

const checkStyle = computed(() => ({
  opacity: showCheck.value ? 1 : 0,
  transform: showCheck.value ? 'scale(1)' : 'scale(0.8)',
  transformOrigin: 'center',
}))

const errorStyle = computed(() => ({
  opacity: showError.value ? 1 : 0,
  transform: showError.value ? 'scale(1)' : 'scale(0.8)',
  transformOrigin: 'center',
}))
</script>

<template>
  <svg :width="size" :height="size" viewBox="0 0 24 24" fill="none">
    <!-- Send arrow -->
    <g class="send-arrow-icon" :style="arrowStyle">
      <path
        d="M9.875 14.125L12.3506 19.6951C12.7184 20.5227 13.9091 20.4741 14.2083 19.6193L18.8139 6.46032C19.0907 5.6695 18.3305 4.90933 17.5397 5.18611L4.38072 9.79174C3.52589 10.0909 3.47731 11.2816 4.30494 11.6494L9.875 14.125ZM9.875 14.125L13.375 10.625"
        stroke="currentColor"
        stroke-width="1.5"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    </g>
    <!-- Green checkmark circle -->
    <g class="send-check-icon" :style="checkStyle">
      <path
        d="M12 20C7.58172 20 4 16.4182 4 12C4 7.58172 7.58172 4 12 4C16.4182 4 20 7.58172 20 12C20 16.4182 16.4182 20 12 20Z"
        stroke="#22c55e"
        stroke-width="1.5"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
      <path
        d="M15 10L11 14.25L9.25 12.25"
        stroke="#22c55e"
        stroke-width="1.5"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    </g>
    <!-- Red error circle with exclamation -->
    <g class="send-error-icon" :style="errorStyle">
      <path
        d="M12 20C7.58172 20 4 16.4182 4 12C4 7.58172 7.58172 4 12 4C16.4182 4 20 7.58172 20 12C20 16.4182 16.4182 20 12 20Z"
        stroke="#ef4444"
        stroke-width="1.5"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
      <path
        d="M12 8V12"
        stroke="#ef4444"
        stroke-width="1.5"
        stroke-linecap="round"
      />
      <circle cx="12" cy="15" r="0.5" fill="#ef4444" stroke="#ef4444" stroke-width="1" />
    </g>
  </svg>
</template>

<style>
.send-arrow-icon, .send-check-icon, .send-error-icon {
  transition: opacity 0.15s ease, transform 0.15s ease;
}
</style>
