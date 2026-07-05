<script setup lang="ts">
import { Plus, RefreshCw } from 'lucide-vue-next'
import { computed, onMounted, ref } from 'vue'
import CreatePrototypeModal from './CreatePrototypeModal.vue'
import PrototypeCard from './PrototypeCard.vue'
import RemixModal from './RemixModal.vue'
import type { PrototypeInfo, StackInfo } from './types'

const prototypes = ref<PrototypeInfo[]>([])
const stacks = ref<StackInfo[]>([])
const running = ref<Record<string, boolean>>({})
const loading = ref(true)
const error = ref('')
const showCreate = ref(false)
const remixSource = ref<PrototypeInfo | null>(null)

const sorted = computed(() =>
  [...prototypes.value].sort((a, b) => {
    // Legacy/archived (underscore-prefixed) folders sink to the bottom.
    const aLegacy = a.folder.startsWith('_') ? 1 : 0
    const bLegacy = b.folder.startsWith('_') ? 1 : 0
    if (aLegacy !== bLegacy) return aLegacy - bLegacy
    return (b.created ?? '').localeCompare(a.created ?? '')
  }),
)

async function probe(proto: PrototypeInfo): Promise<void> {
  const port = Number(proto.defaultPort)
  if (!Number.isInteger(port)) return
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 800)
    const res = await fetch(`http://localhost:${port}/__pdk/info`, { signal: controller.signal })
    clearTimeout(timer)
    running.value[proto.folder] = res.ok
  } catch {
    running.value[proto.folder] = false
  }
}

async function load(): Promise<void> {
  loading.value = true
  error.value = ''
  try {
    const [pRes, sRes] = await Promise.all([
      fetch('/__api/prototypes'),
      fetch('/__api/stacks'),
    ])
    prototypes.value = (await pRes.json()).prototypes
    stacks.value = (await sRes.json()).stacks
    prototypes.value.forEach(probe)
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to load prototypes.'
  } finally {
    loading.value = false
  }
}

function onCreated(): void {
  showCreate.value = false
  load()
}

function onRemixed(): void {
  remixSource.value = null
  load()
}

onMounted(load)
</script>

<template>
  <div class="min-h-screen bg-background">
    <header class="border-b border-border">
      <div class="max-w-6xl mx-auto px-6 py-5 flex items-center gap-4">
        <div>
          <h1 class="text-xl font-semibold tracking-tight">Product Design Kit</h1>
          <p class="text-sm text-muted-foreground">
            Prototypes built on your design system — tweak in the browser, hand off as code.
          </p>
        </div>
        <div class="ml-auto flex items-center gap-2">
          <button
            class="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-2 text-sm hover:bg-accent"
            @click="load"
          >
            <RefreshCw class="size-4" /> Refresh
          </button>
          <button
            class="inline-flex items-center gap-1.5 rounded-md bg-primary text-primary-foreground px-3 py-2 text-sm hover:opacity-90"
            @click="showCreate = true"
          >
            <Plus class="size-4" /> New prototype
          </button>
        </div>
      </div>
    </header>

    <main class="max-w-6xl mx-auto px-6 py-8">
      <p v-if="error" class="text-sm text-red-600 mb-4">{{ error }}</p>

      <div v-if="loading" class="text-sm text-muted-foreground">Loading…</div>

      <div v-else-if="sorted.length === 0" class="text-center py-24">
        <p class="text-muted-foreground mb-4">
          No prototypes yet. Create your first one from a stack template.
        </p>
        <button
          class="inline-flex items-center gap-1.5 rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm"
          @click="showCreate = true"
        >
          <Plus class="size-4" /> New prototype
        </button>
      </div>

      <div v-else class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <PrototypeCard
          v-for="proto in sorted"
          :key="proto.folder"
          :prototype="proto"
          :running="running[proto.folder] ?? false"
          @remix="remixSource = proto"
        />
      </div>
    </main>

    <CreatePrototypeModal
      v-if="showCreate"
      :stacks="stacks"
      @close="showCreate = false"
      @created="onCreated"
    />
    <RemixModal
      v-if="remixSource"
      :source="remixSource"
      @close="remixSource = null"
      @remixed="onRemixed"
    />
  </div>
</template>
