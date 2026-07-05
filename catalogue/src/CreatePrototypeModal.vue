<script setup lang="ts">
import { X } from 'lucide-vue-next'
import { computed, ref } from 'vue'
import type { StackInfo } from './types'

const props = defineProps<{ stacks: StackInfo[] }>()
const emit = defineEmits<{ close: []; created: [slug: string] }>()

const name = ref('')
const description = ref('')
const author = ref(localStorage.getItem('pdk-author') ?? '')
const stack = ref(props.stacks.find((s) => s.name === 'react-shadcn')?.name ?? props.stacks[0]?.name ?? '')
const busy = ref(false)
const error = ref('')

const slugValid = computed(() => /^[a-z0-9][a-z0-9-]*$/.test(name.value))

async function create(): Promise<void> {
  if (!slugValid.value || !stack.value) return
  busy.value = true
  error.value = ''
  try {
    const res = await fetch('/__api/create-prototype', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        stack: stack.value,
        name: name.value,
        description: description.value,
        author: author.value,
      }),
    })
    const body = await res.json()
    if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`)
    localStorage.setItem('pdk-author', author.value)
    emit('created', body.slug)
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to create prototype.'
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" @click.self="emit('close')">
    <div class="w-full max-w-md rounded-lg bg-background border border-border p-6">
      <div class="flex items-center mb-4">
        <h2 class="font-semibold">New prototype</h2>
        <button class="ml-auto rounded p-1 hover:bg-accent" @click="emit('close')">
          <X class="size-4" />
        </button>
      </div>

      <div class="space-y-4">
        <label class="block">
          <span class="text-sm font-medium">Stack</span>
          <select
            v-model="stack"
            class="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
          >
            <option v-for="s in props.stacks" :key="s.name" :value="s.name">
              {{ s.name }} ({{ s.framework }} · {{ s.library }}){{ s.hasManifest ? '' : ' — no manifest yet' }}
            </option>
          </select>
        </label>

        <label class="block">
          <span class="text-sm font-medium">Name (kebab-case)</span>
          <input
            v-model.trim="name"
            placeholder="order-tracking"
            class="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
          />
          <span v-if="name && !slugValid" class="text-xs text-red-600">
            Lowercase letters, digits, and dashes only.
          </span>
        </label>

        <label class="block">
          <span class="text-sm font-medium">Description</span>
          <textarea
            v-model.trim="description"
            rows="2"
            placeholder="What is this prototype exploring?"
            class="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
          />
        </label>

        <label class="block">
          <span class="text-sm font-medium">Author</span>
          <input
            v-model.trim="author"
            placeholder="Your name"
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
            :disabled="!slugValid || !stack || busy"
            @click="create"
          >
            {{ busy ? 'Creating…' : 'Create' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
