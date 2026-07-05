<script setup lang="ts">
import { Copy, ExternalLink, GitBranch, Send, Terminal } from 'lucide-vue-next'
import { computed, ref } from 'vue'
import type { CatalogueRequest, PrototypeInfo } from './types'

const props = defineProps<{
  prototype: PrototypeInfo
  running: boolean
  request?: CatalogueRequest
}>()

defineEmits<{ remix: []; handover: []; status: [status: string]; retry: [id: string] }>()

const copied = ref(false)
const statusMenuOpen = ref(false)
const LIFECYCLE: Array<{ value: string; label: string }> = [
  { value: 'draft', label: 'Draft' },
  { value: 'in-review', label: 'In review' },
  { value: 'ready-for-dev', label: 'Ready for dev' },
  { value: 'handed-off', label: 'Handed off' },
  { value: 'archived', label: 'Archived' },
]

const statusColor = computed(
  () =>
    ({
      draft: 'var(--status-draft)',
      experimental: 'var(--status-experimental)',
      validated: 'var(--status-validated)',
      merged: 'var(--status-merged)',
      archived: 'var(--status-archived)',
      'in-review': 'var(--status-experimental)',
      'ready-for-dev': 'var(--status-validated)',
      'handed-off': 'var(--status-merged)',
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
      <div class="ml-auto shrink-0 relative">
        <button
          class="inline-flex items-center gap-1.5 rounded-full border border-border px-2 py-0.5 text-xs capitalize hover:bg-accent"
          @click="statusMenuOpen = !statusMenuOpen"
        >
          <span class="size-1.5 rounded-full" :style="{ background: statusColor }" />
          {{ prototype.status }}
        </button>
        <div
          v-if="statusMenuOpen"
          class="absolute right-0 top-full mt-1 z-10 w-36 rounded-md border border-border bg-background shadow-md py-1"
        >
          <button
            v-for="opt in LIFECYCLE"
            :key="opt.value"
            class="block w-full text-left px-3 py-1.5 text-xs hover:bg-accent"
            :class="{ 'font-semibold': prototype.status === opt.value }"
            @click="statusMenuOpen = false; $emit('status', opt.value)"
          >
            {{ opt.label }}
          </button>
        </div>
      </div>
    </div>

    <p
      v-if="request && request.status !== 'done'"
      class="text-xs rounded-md border px-2 py-1 flex items-center gap-2"
      :class="request.status === 'failed' ? 'border-red-300 text-red-700' : 'border-border text-muted-foreground'"
    >
      <span v-if="request.status === 'pending'">Handoff queued — run /orders in Claude Code</span>
      <span v-else-if="request.status === 'in-progress'">Handoff in progress…</span>
      <span v-else>Handoff failed: {{ request.note ?? 'see Claude Code' }}</span>
      <button v-if="request.status === 'failed'" class="ml-auto underline" @click="$emit('retry', request.id)">
        Retry
      </button>
    </p>

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
        class="inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-sm ml-auto"
        :class="
          prototype.status === 'ready-for-dev'
            ? 'bg-primary text-primary-foreground border-transparent hover:opacity-90'
            : 'border-border hover:bg-accent'
        "
        title="File a handoff order ticket for developers"
        @click="$emit('handover')"
      >
        <Send class="size-3.5" /> Hand over
      </button>
      <button
        class="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-sm hover:bg-accent"
        title="Copy this prototype as a starting point"
        @click="$emit('remix')"
      >
        <GitBranch class="size-3.5" /> Remix
      </button>
    </div>
  </div>
</template>
