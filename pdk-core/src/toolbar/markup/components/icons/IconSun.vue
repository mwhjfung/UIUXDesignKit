<script setup lang="ts">
withDefaults(defineProps<{ size?: number }>(), { size: 16 })
</script>

<template>
  <svg :width="size" :height="size" viewBox="0 0 20 20" fill="none">
    <path d="M9.99999 12.7082C11.4958 12.7082 12.7083 11.4956 12.7083 9.99984C12.7083 8.50407 11.4958 7.2915 9.99999 7.2915C8.50422 7.2915 7.29166 8.50407 7.29166 9.99984C7.29166 11.4956 8.50422 12.7082 9.99999 12.7082Z" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M10 3.9585V5.05698" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M10 14.9429V16.0414" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M5.7269 5.72656L6.50682 6.50649" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M13.4932 13.4932L14.2731 14.2731" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M3.95834 10H5.05683" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M14.9432 10H16.0417" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M5.7269 14.2731L6.50682 13.4932" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M13.4932 6.50649L14.2731 5.72656" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>
</template>
