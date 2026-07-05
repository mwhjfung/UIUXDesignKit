<script setup lang="ts">
import { Button } from '@/components/ui/button'
</script>

<template>
  <div class="min-h-screen bg-background">
    <div class="max-w-5xl mx-auto px-6 py-8">
      <h1 class="text-2xl font-semibold tracking-tight mb-2">PROTOTYPE_TITLE</h1>
      <p class="text-muted-foreground mb-8">PROTOTYPE_DESCRIPTION</p>
      <div class="flex gap-2 flex-wrap">
        <Button>Primary</Button>
        <Button variant="outline">Outline</Button>
        <Button variant="ghost">Ghost</Button>
      </div>
    </div>
  </div>
</template>
