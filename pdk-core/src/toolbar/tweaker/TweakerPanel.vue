<script setup lang="ts">
/**
 * The Tweaker — manifest-driven runtime prop editor.
 *
 * Toggle on → hover highlights any component the stack manifest knows how to
 * detect → click selects it → the panel offers exactly the props/variants the
 * design system defines. Edits are written back to the prototype's source via
 * POST /__api/update-prop (Vite HMR refreshes the page). Ambiguous targets
 * are refused by the server; the panel then points the user at the Markup
 * annotation loop instead.
 */

import { computed, onBeforeUnmount, ref } from 'vue'
import {
  discoverInstances,
  fetchBrowserManifest,
  instanceAtPoint,
  type BrowserManifest,
  type TweakInstance,
} from './discovery'

const enabled = ref(false)
const manifest = ref<BrowserManifest | null>(null)
const manifestMissing = ref(false)
const instances = ref<TweakInstance[]>([])
const hovered = ref<TweakInstance | null>(null)
const selected = ref<TweakInstance | null>(null)
const busyProp = ref<string | null>(null)
const error = ref('')
const applied = ref('')

const hoverRect = computed(() => (hovered.value ? hovered.value.el.getBoundingClientRect() : null))
const selectedRect = computed(() =>
  selected.value ? selected.value.el.getBoundingClientRect() : null,
)

async function toggle(): Promise<void> {
  enabled.value = !enabled.value
  error.value = ''
  applied.value = ''
  hovered.value = null
  selected.value = null
  if (enabled.value) {
    if (!manifest.value) {
      manifest.value = await fetchBrowserManifest()
      manifestMissing.value = manifest.value === null
    }
    refresh()
    window.addEventListener('mousemove', onMouseMove, true)
    window.addEventListener('click', onClick, true)
  } else {
    window.removeEventListener('mousemove', onMouseMove, true)
    window.removeEventListener('click', onClick, true)
  }
}

function refresh(): void {
  if (manifest.value) instances.value = discoverInstances(manifest.value)
}

function inOwnUi(target: EventTarget | null): boolean {
  return target instanceof Element && !!target.closest('#__pdk-tools, .pdk-tweaker-panel, .pdk-tweaker-toggle')
}

function onMouseMove(e: MouseEvent): void {
  if (inOwnUi(e.target)) {
    hovered.value = null
    return
  }
  hovered.value = instanceAtPoint(instances.value as TweakInstance[], e.clientX, e.clientY)
}

function onClick(e: MouseEvent): void {
  if (inOwnUi(e.target)) return
  const hit = instanceAtPoint(instances.value as TweakInstance[], e.clientX, e.clientY)
  if (hit) {
    e.preventDefault()
    e.stopPropagation()
    selected.value = hit
    error.value = ''
    applied.value = ''
  }
}

async function apply(propName: string, value: string | number | boolean | null): Promise<void> {
  const target = selected.value
  if (!target) return
  busyProp.value = propName
  error.value = ''
  applied.value = ''
  try {
    const res = await fetch('/__api/update-prop', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        componentName: target.component.name,
        occurrence: target.occurrence,
        propName,
        value,
      }),
    })
    const body = (await res.json()) as { success?: boolean; file?: string; error?: string }
    if (!res.ok) {
      error.value = body.error ?? `HTTP ${res.status}`
      return
    }
    applied.value = `${propName} updated in ${body.file}`
    // HMR will re-render; rebuild the registry once the DOM settles.
    setTimeout(() => {
      refresh()
      selected.value = null
    }, 600)
  } catch (e2) {
    error.value = e2 instanceof Error ? e2.message : 'Request failed'
  } finally {
    busyProp.value = null
  }
}

function onSelectChange(propName: string, event: Event): void {
  const value = (event.target as HTMLSelectElement).value
  void apply(propName, value === '__pdk_unset__' ? null : value)
}

function onCheckboxChange(propName: string, event: Event): void {
  void apply(propName, (event.target as HTMLInputElement).checked)
}

function onTextCommit(propName: string, type: 'string' | 'number', event: Event): void {
  const raw = (event.target as HTMLInputElement).value
  if (raw === '') return void apply(propName, null)
  void apply(propName, type === 'number' ? Number(raw) : raw)
}

onBeforeUnmount(() => {
  window.removeEventListener('mousemove', onMouseMove, true)
  window.removeEventListener('click', onClick, true)
})
</script>

<template>
  <!-- Toggle button -->
  <button
    class="pdk-tweaker-toggle"
    :class="{ 'pdk-tweaker-toggle--on': enabled }"
    :title="enabled ? 'Exit tweak mode' : 'Tweak components (manifest-driven)'"
    @click="toggle"
  >
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
    </svg>
    Tweak
  </button>

  <template v-if="enabled">
    <!-- Hover / selection outlines -->
    <div
      v-if="hoverRect && hovered?.el !== selected?.el"
      class="pdk-tweaker-outline pdk-tweaker-outline--hover"
      :style="{
        top: `${hoverRect.top}px`,
        left: `${hoverRect.left}px`,
        width: `${hoverRect.width}px`,
        height: `${hoverRect.height}px`,
      }"
    >
      <span class="pdk-tweaker-outline__label">{{ hovered?.component.name }}</span>
    </div>
    <div
      v-if="selectedRect"
      class="pdk-tweaker-outline pdk-tweaker-outline--selected"
      :style="{
        top: `${selectedRect.top}px`,
        left: `${selectedRect.left}px`,
        width: `${selectedRect.width}px`,
        height: `${selectedRect.height}px`,
      }"
    />

    <!-- Panel -->
    <div class="pdk-tweaker-panel">
      <template v-if="manifestMissing">
        <p class="pdk-tweaker-panel__hint">
          No manifest available on this server — run /scaffold-manifest for this stack.
        </p>
      </template>
      <template v-else-if="!selected">
        <p class="pdk-tweaker-panel__hint">
          {{
            instances.length > 0
              ? `Click a highlighted component to tweak it (${instances.length} found).`
              : 'No tweakable components detected on this page.'
          }}
        </p>
      </template>
      <template v-else>
        <div class="pdk-tweaker-panel__header">
          <strong>{{ selected.component.name }}</strong>
          <span class="pdk-tweaker-panel__occurrence">#{{ selected.occurrence }}</span>
        </div>
        <div v-for="prop in selected.component.props" :key="prop.name" class="pdk-tweaker-field">
          <label class="pdk-tweaker-field__label">{{ prop.label }}</label>
          <select
            v-if="prop.type === 'select'"
            class="pdk-tweaker-field__control"
            :disabled="busyProp !== null"
            @change="onSelectChange(prop.name, $event)"
          >
            <option value="__pdk_unset__">
              (default{{ prop.default !== undefined ? `: ${prop.default}` : '' }})
            </option>
            <option v-for="opt in prop.options" :key="opt" :value="opt">{{ opt }}</option>
          </select>
          <input
            v-else-if="prop.type === 'boolean'"
            type="checkbox"
            class="pdk-tweaker-field__checkbox"
            :disabled="busyProp !== null"
            @change="onCheckboxChange(prop.name, $event)"
          />
          <input
            v-else
            :type="prop.type === 'number' ? 'number' : 'text'"
            class="pdk-tweaker-field__control"
            placeholder="(unset — press Enter to apply)"
            :disabled="busyProp !== null"
            @keydown.enter="onTextCommit(prop.name, prop.type === 'number' ? 'number' : 'string', $event)"
          />
        </div>
        <p v-if="applied" class="pdk-tweaker-panel__ok">{{ applied }}</p>
        <p v-if="error" class="pdk-tweaker-panel__error">
          {{ error }}
        </p>
      </template>
    </div>
  </template>
</template>

<style scoped>
.pdk-tweaker-toggle {
  position: fixed;
  bottom: 16px;
  right: 16px;
  z-index: 2147483000;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  border-radius: 999px;
  border: 1px solid #d4d4d8;
  background: #ffffff;
  color: #18181b;
  font: 500 12px/1 -apple-system, 'Inter Variable', system-ui, sans-serif;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.12);
  cursor: pointer;
}
.pdk-tweaker-toggle--on {
  background: #18181b;
  color: #fafafa;
  border-color: #18181b;
}
.pdk-tweaker-outline {
  position: fixed;
  z-index: 2147482998;
  pointer-events: none;
  border-radius: 4px;
}
.pdk-tweaker-outline--hover {
  outline: 2px dashed #6366f1;
  outline-offset: 1px;
}
.pdk-tweaker-outline--selected {
  outline: 2px solid #6366f1;
  outline-offset: 1px;
}
.pdk-tweaker-outline__label {
  position: absolute;
  top: -22px;
  left: 0;
  background: #6366f1;
  color: #fff;
  font: 600 10px/1 -apple-system, system-ui, sans-serif;
  padding: 4px 6px;
  border-radius: 3px;
  white-space: nowrap;
}
.pdk-tweaker-panel {
  position: fixed;
  bottom: 64px;
  right: 16px;
  z-index: 2147483000;
  width: 260px;
  max-height: 60vh;
  overflow-y: auto;
  background: #ffffff;
  color: #18181b;
  border: 1px solid #e4e4e7;
  border-radius: 10px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.16);
  padding: 12px;
  font: 400 12px/1.45 -apple-system, 'Inter Variable', system-ui, sans-serif;
}
.pdk-tweaker-panel__header {
  display: flex;
  align-items: baseline;
  gap: 6px;
  margin-bottom: 8px;
  font-size: 13px;
}
.pdk-tweaker-panel__occurrence {
  color: #71717a;
  font-size: 11px;
}
.pdk-tweaker-panel__hint {
  color: #71717a;
  margin: 0;
}
.pdk-tweaker-field {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}
.pdk-tweaker-field__label {
  flex: 0 0 40%;
  color: #3f3f46;
}
.pdk-tweaker-field__control {
  flex: 1;
  min-width: 0;
  border: 1px solid #d4d4d8;
  border-radius: 6px;
  padding: 4px 6px;
  background: #fff;
  color: inherit;
  font: inherit;
}
.pdk-tweaker-field__checkbox {
  width: 14px;
  height: 14px;
}
.pdk-tweaker-panel__ok {
  color: #16a34a;
  margin: 8px 0 0;
}
.pdk-tweaker-panel__error {
  color: #dc2626;
  margin: 8px 0 0;
}
</style>
