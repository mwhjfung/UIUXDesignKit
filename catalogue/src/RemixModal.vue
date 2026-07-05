<script setup lang="ts">
import { X } from 'lucide-vue-next'
import { computed, ref } from 'vue'
import type { PrototypeInfo } from './types'

const props = defineProps<{ source: PrototypeInfo }>()
const emit = defineEmits<{ close: []; remixed: [slug: string] }>()

const name = ref(`${props.source.slug}-remix`)
const author = ref(localStorage.getItem('pdk-author') ?? '')
const busy = ref(false)
const error = ref('')

const slugValid = computed(() => /^[a-z0-9][a-z0-9-]*$/.test(name.value))

async function remix(): Promise<void> {
  if (!slugValid.value) return
  busy.value = true
  error.value = ''
  try {
    const res = await fetch('/__api/remix-prototype', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source: props.source.folder, name: name.value, author: author.value }),
    })
    const body = await res.json()
    if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`)
    localStorage.setItem('pdk-author', author.value)
    emit('remixed', body.slug)
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to remix prototype.'
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" @click.self="emit('close')">
    <div class="w-full max-w-md rounded-lg bg-background border border-border p-6">
      <div class="flex items-center mb-1">
        <h2 class="font-semibold">Remix “{{ source.title }}”</h2>
        <button class="ml-auto rounded p-1 hover:bg-accent" @click="emit('close')">
          <X class="size-4" />
        </button>
      </div>
      <p class="text-sm text-muted-foreground mb-4">
        Copies the whole prototype as a new starting point; lineage is recorded in pdk.json.
      </p>

      <div class="space-y-4">
        <label class="block">
          <span class="text-sm font-medium">New name (kebab-case)</span>
          <input
            v-model.trim="name"
            class="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
          />
          <span v-if="name && !slugValid" class="text-xs text-red-600">
            Lowercase letters, digits, and dashes only.
          </span>
        </label>

        <label class="block">
          <span class="text-sm font-medium">Author</span>
          <input
            v-model.trim="author"
            class="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
          />
        </label>

        <p v-if="error" class="text-sm text-red-600">{{ error }}</p>

        <div class="flex justify-end gap-2 pt-2">
          <button class="rounded-md border border-border px-3 py-2 text-sm hover:bg-accent" @click="emit('close')">
            Cancel
          </button>
          <button
            class="rounded-md bg-primary text-primary-foreground px-3 py-2 text-sm disabled:opacity-50"
            :disabled="!slugValid || busy"
            @click="remix"
          >
            {{ busy ? 'Remixing…' : 'Remix' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
