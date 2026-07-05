<script setup lang="ts">
import { Copy, ExternalLink, GitBranch, Terminal } from 'lucide-vue-next'
import { computed, ref } from 'vue'
import type { PrototypeInfo } from './types'

const props = defineProps<{
  prototype: PrototypeInfo
  running: boolean
}>()

defineEmits<{ remix: [] }>()

const copied = ref(false)

const statusColor = computed(
  () =>
    ({
      draft: 'var(--status-draft)',
      experimental: 'var(--status-experimental)',
      validated: 'var(--status-validated)',
      merged: 'var(--status-merged)',
      archived: 'var(--status-archived)',
    })[props.prototype.status] ?? 'var(--status-draft)',
)

const url = computed(() => `http://localhost:${props.prototype.defaultPort}`)
const devCommand = computed(
  () => `cd prototypes/${props.prototype.folder} && npm install && npm run dev`,
)

async function copyCommand(): Promise<void> {
  await navigator.clipboard.writeText(devCommand.value)
  copied.value = true
  setTimeout(() => (copied.value = false), 1500)
}
</script>

<template>
  <div class="rounded-lg border border-border p-4 flex flex-col gap-3 bg-background">
    <div class="flex items-start gap-2">
      <div class="min-w-0">
        <h2 class="font-medium truncate">{{ prototype.title }}</h2>
        <p class="text-xs text-muted-foreground">
          {{ prototype.stack ?? `${prototype.framework} · ${prototype.library}` }}
          · port {{ prototype.defaultPort }}
          <span v-if="prototype.parent"> · remix of {{ prototype.parent }}</span>
        </p>
      </div>
      <span
        class="ml-auto shrink-0 inline-flex items-center gap-1.5 rounded-full border border-border px-2 py-0.5 text-xs capitalize"
      >
        <span class="size-1.5 rounded-full" :style="{ background: statusColor }" />
        {{ prototype.status }}
      </span>
    </div>

    <p class="text-sm text-muted-foreground line-clamp-2 grow">{{ prototype.description }}</p>

    <div class="flex items-center gap-1.5">
      <a
        :href="url"
        target="_blank"
        class="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm border"
        :class="
          running
            ? 'bg-primary text-primary-foreground border-transparent hover:opacity-90'
            : 'border-border text-muted-foreground hover:bg-accent'
        "
        :title="running ? 'Open the running prototype' : 'Dev server not detected — start it first'"
      >
        <ExternalLink class="size-3.5" />
        {{ running ? 'Open' : 'Not running' }}
      </a>
      <button
        class="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-sm hover:bg-accent"
        title="Copy the dev-server command"
        @click="copyCommand"
      >
        <component :is="copied ? Copy : Terminal" class="size-3.5" />
        {{ copied ? 'Copied' : 'Dev' }}
      </button>
      <button
        class="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-sm hover:bg-accent ml-auto"
        title="Copy this prototype as a starting point"
        @click="$emit('remix')"
      >
        <GitBranch class="size-3.5" /> Remix
      </button>
    </div>
  </div>
</template>
