<script setup lang="ts">
withDefaults(defineProps<{ size?: number }>(), { size: 24 })
</script>

<template>
  <svg :width="size" :height="size" viewBox="0 0 24 24" fill="none">
    <path
      d="M15.8787 4.87868C16.6597 4.09763 17.9261 4.09763 18.7071 4.87868L19.1213 5.29289C19.9024 6.07394 19.9024 7.34027 19.1213 8.12132L9.58579 17.6569C9.21071 18.0319 8.70201 18.2426 8.17157 18.2426H5.75V15.8284C5.75 15.298 5.96071 14.7893 6.33579 14.4142L15.8787 4.87868Z"
      stroke="currentColor"
      stroke-width="1.5"
      stroke-linecap="round"
      stroke-linejoin="round"
    />
    <path
      d="M14.5 6.5L17.5 9.5"
      stroke="currentColor"
      stroke-width="1.5"
      stroke-linecap="round"
    />
  </svg>
</template>
