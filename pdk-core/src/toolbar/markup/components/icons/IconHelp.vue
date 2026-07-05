<script setup lang="ts">
withDefaults(defineProps<{ size?: number }>(), { size: 20 })
</script>

<template>
  <svg :width="size" :height="size" viewBox="0 0 20 20" fill="none">
    <circle
      cx="10"
      cy="10.5"
      r="5.25"
      stroke="currentColor"
      stroke-width="1.25"
    />
    <path
      d="M8.5 8.75C8.5 7.92 9.17 7.25 10 7.25C10.83 7.25 11.5 7.92 11.5 8.75C11.5 9.58 10.83 10.25 10 10.25V11"
      stroke="currentColor"
      stroke-width="1.25"
      stroke-linecap="round"
      stroke-linejoin="round"
    />
    <circle cx="10" cy="13" r="0.75" fill="currentColor" />
  </svg>
</template>
