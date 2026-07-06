<script setup lang="ts">
import { X } from 'lucide-vue-next'
import { computed, ref } from 'vue'
import type { PrototypeInfo, StackInfo } from './types'

const props = defineProps<{ prototype: PrototypeInfo; stacks: StackInfo[] }>()
const emit = defineEmits<{ close: []; queued: [] }>()

const linked = computed(
  () => props.stacks.find((s) => s.name === props.prototype.stack)?.productRepo ?? null,
)
const targetRepo = ref(linked.value?.path ?? '')
const targetSubdir = ref(`src/features/${props.prototype.slug}`)
const busy = ref(false)
const error = ref('')

async function queue(): Promise<void> {
  if (!targetRepo.value.trim()) return
  busy.value = true
  error.value = ''
  try {
    const res = await fetch('/__api/requests', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'handoff',
        handoff: {
          slug: props.prototype.folder,
          targetRepo: targetRepo.value.trim(),
          targetSubdir: targetSubdir.value.trim() || undefined,
        },
      }),
    })
    const body = await res.json()
    if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`)
    emit('queued')
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to queue the handoff.'
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" @click.self="emit('close')">
    <div class="w-full max-w-md rounded-lg bg-background border border-border p-6">
      <div class="flex items-center mb-4">
        <h2 class="font-semibold">Hand over "{{ prototype.title }}"</h2>
        <button class="ml-auto rounded p-1 hover:bg-accent" @click="emit('close')">
          <X class="size-4" />
        </button>
      </div>

      <div class="space-y-4">
        <p
          v-if="prototype.status !== 'ready-for-dev'"
          class="text-xs rounded-md border border-border px-2 py-1.5 text-muted-foreground"
        >
          Tip: mark it "Ready for dev" first so the team knows it's approved.
        </p>

        <label class="block">
          <span class="text-sm font-medium">Destination repo (absolute path)</span>
          <input
            v-model.trim="targetRepo"
            placeholder="/path/to/your/product-repo"
            class="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
          />
          <span v-if="linked" class="text-xs text-muted-foreground">Pre-filled from the linked codebase.</span>
        </label>

        <label class="block">
          <span class="text-sm font-medium">Subdirectory for the code</span>
          <input
            v-model.trim="targetSubdir"
            class="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
          />
        </label>

        <p class="text-xs text-muted-foreground">
          Files an order ticket. Claude Code exports the prototype onto a
          <code>handoff/{{ prototype.folder }}</code> branch in that repo with a
          HANDOFF.md checklist, then marks this card "Handed off".
        </p>

        <p v-if="error" class="text-sm text-red-600">{{ error }}</p>

        <div class="flex justify-end gap-2 pt-2">
          <button class="rounded-md border border-border px-3 py-2 text-sm hover:bg-accent" @click="emit('close')">
            Cancel
          </button>
          <button
            class="rounded-md bg-primary text-primary-foreground px-3 py-2 text-sm disabled:opacity-50"
            :disabled="!targetRepo.trim() || busy"
            @click="queue"
          >
            {{ busy ? 'Queuing…' : 'Queue handoff' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
