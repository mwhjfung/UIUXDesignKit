<script setup lang="ts">
import { ref, watch } from 'vue'

// Read __VERSION__ in the script block (where Vite's define replaces it),
// then expose as a reactive variable for the template.
declare const __VERSION__: string
const toolbarVersion: string = typeof __VERSION__ !== 'undefined' ? __VERSION__ : '1.0.0'
import { originalSetTimeout } from '../utils/freeze-animations'
import ToolbarTooltip from './ToolbarTooltip.vue'
import {
  IconHelp,
  IconCheckSmallAnimated,
  IconSun,
  IconMoon,
  IconChevronLeft,
} from './icons'
import styles from '../styles/page-toolbar.module.scss'
import {
  OUTPUT_DETAIL_OPTIONS,
  COLOR_OPTIONS,
  isValidUrl,
  type ToolbarSettings,
} from '../composables/useToolbarSettings'

const props = defineProps<{
  settings: ToolbarSettings
  isDarkMode: boolean
  showSettingsVisible: boolean
  toolbarPosition: { x: number; y: number } | null
  isLocalhost: boolean
  endpoint?: string
  connectionStatus: 'disconnected' | 'connecting' | 'connected'
  isTransitioning: boolean
  settingsPage: 'main' | 'automations'
}>()

const emit = defineEmits<{
  (e: 'update:isDarkMode', value: boolean): void
  (e: 'update:settings', value: Partial<ToolbarSettings>): void
  (e: 'update:settingsPage', value: 'main' | 'automations'): void
}>()

function updateSetting<K extends keyof ToolbarSettings>(key: K, value: ToolbarSettings[K]) {
  emit('update:settings', { [key]: value })
}

function cycleOutputDetail() {
  const currentIndex = OUTPUT_DETAIL_OPTIONS.findIndex(
    (opt) => opt.value === props.settings.outputDetail,
  )
  const nextIndex = (currentIndex + 1) % OUTPUT_DETAIL_OPTIONS.length
  updateSetting('outputDetail', OUTPUT_DETAIL_OPTIONS[nextIndex].value)
}
</script>

<template>
  <div
    :class="[
      styles.settingsPanel,
      isDarkMode ? styles.dark : styles.light,
      showSettingsVisible ? styles.enter : styles.exit,
    ]"
    data-settings-panel
    @click.stop
    :style="
      toolbarPosition && toolbarPosition.y < 230
        ? { bottom: 'auto', top: 'calc(100% + 0.5rem)' }
        : undefined
    "
  >
    <div
      :class="[
        styles.settingsPanelContainer,
        isTransitioning ? styles.transitioning : '',
      ]"
    >
      <!-- Main settings page -->
      <div
        :class="[
          styles.settingsPage,
          settingsPage === 'automations' ? styles.slideLeft : '',
        ]"
      >
        <div :class="styles.settingsHeader">
          <span :class="styles.settingsBrand">
            <span
              :class="styles.settingsBrandSlash"
              :style="{ color: settings.annotationColor, transition: 'color 0.2s ease' }"
            >/</span>
            markup
          </span>
          <span :class="styles.settingsVersion">v{{ toolbarVersion }}</span>
          <button
            :class="styles.themeToggle"
            :title="isDarkMode ? 'Switch to light mode' : 'Switch to dark mode'"
            @click="emit('update:isDarkMode', !isDarkMode)"
          >
            <span :class="styles.themeIconWrapper">
              <span :class="styles.themeIcon">
                <IconSun v-if="isDarkMode" :size="20" />
                <IconMoon v-else :size="20" />
              </span>
            </span>
          </button>
        </div>

        <div :class="styles.settingsSection">
          <div :class="styles.settingsRow">
            <div :class="[styles.settingsLabel, !isDarkMode ? styles.light : '']">
              Output Detail
              <ToolbarTooltip
                content="Controls how much detail is included in the copied output"
                :is-transitioning="isTransitioning"
              >
                <span :class="styles.helpIcon">
                  <IconHelp :size="20" />
                </span>
              </ToolbarTooltip>
            </div>
            <button
              :class="[styles.cycleButton, !isDarkMode ? styles.light : '']"
              @click="cycleOutputDetail"
            >
              <span :class="styles.cycleButtonText">
                {{ OUTPUT_DETAIL_OPTIONS.find((opt) => opt.value === settings.outputDetail)?.label }}
              </span>
              <span :class="styles.cycleDots">
                <span
                  v-for="option in OUTPUT_DETAIL_OPTIONS"
                  :key="option.value"
                  :class="[
                    styles.cycleDot,
                    !isDarkMode ? styles.light : '',
                    settings.outputDetail === option.value ? styles.active : '',
                  ]"
                />
              </span>
            </button>
          </div>

          <div
            :class="[
              styles.settingsRow,
              styles.settingsRowMarginTop,
              !isLocalhost ? styles.settingsRowDisabled : '',
            ]"
          >
            <div :class="[styles.settingsLabel, !isDarkMode ? styles.light : '']">
              Vue Components
              <ToolbarTooltip
                :content="
                  !isLocalhost
                    ? 'Disabled \u2014 production builds minify component names, making detection unreliable. Use on localhost in development mode.'
                    : 'Include Vue component names in annotations'
                "
                :is-transitioning="isTransitioning"
              >
                <span :class="styles.helpIcon">
                  <IconHelp :size="20" />
                </span>
              </ToolbarTooltip>
            </div>
            <label :class="[styles.toggleSwitch, !isLocalhost ? styles.disabled : '']">
              <input
                type="checkbox"
                :checked="isLocalhost && settings.reactEnabled"
                :disabled="!isLocalhost"
                @change="updateSetting('reactEnabled', !settings.reactEnabled)"
              />
              <span :class="styles.toggleSlider" />
            </label>
          </div>
        </div>

        <div :class="styles.settingsSection">
          <div :class="[styles.settingsLabel, styles.settingsLabelMarker, !isDarkMode ? styles.light : '']">
            Marker Colour
          </div>
          <div :class="styles.colorOptions">
            <div
              v-for="color in COLOR_OPTIONS"
              :key="color.value"
              role="button"
              :style="{
                borderColor: settings.annotationColor === color.value ? color.value : 'transparent',
              }"
              :class="[
                styles.colorOptionRing,
                settings.annotationColor === color.value ? styles.selected : '',
              ]"
              @click="updateSetting('annotationColor', color.value)"
            >
              <div
                :class="[
                  styles.colorOption,
                  settings.annotationColor === color.value ? styles.selected : '',
                ]"
                :style="{ backgroundColor: color.value }"
                :title="color.label"
              />
            </div>
          </div>
        </div>

        <div :class="styles.settingsSection">
          <label :class="styles.settingsToggle">
            <input
              type="checkbox"
              id="autoClearAfterCopy"
              :checked="settings.autoClearAfterCopy"
              @change="updateSetting('autoClearAfterCopy', !settings.autoClearAfterCopy)"
            />
            <label
              :class="[styles.customCheckbox, settings.autoClearAfterCopy ? styles.checked : '']"
              for="autoClearAfterCopy"
            >
              <IconCheckSmallAnimated v-if="settings.autoClearAfterCopy" :size="14" />
            </label>
            <span :class="[styles.toggleLabel, !isDarkMode ? styles.light : '']">
              Clear on copy/send
              <ToolbarTooltip
                content="Automatically clear annotations after copying"
                :is-transitioning="isTransitioning"
              >
                <span :class="[styles.helpIcon, styles.helpIconNudge2]">
                  <IconHelp :size="20" />
                </span>
              </ToolbarTooltip>
            </span>
          </label>
          <label :class="[styles.settingsToggle, styles.settingsToggleMarginBottom]">
            <input
              type="checkbox"
              id="blockInteractions"
              :checked="settings.blockInteractions"
              @change="updateSetting('blockInteractions', !settings.blockInteractions)"
            />
            <label
              :class="[styles.customCheckbox, settings.blockInteractions ? styles.checked : '']"
              for="blockInteractions"
            >
              <IconCheckSmallAnimated v-if="settings.blockInteractions" :size="14" />
            </label>
            <span :class="[styles.toggleLabel, !isDarkMode ? styles.light : '']">
              Block page interactions
            </span>
          </label>
        </div>

        <div :class="[styles.settingsSection, styles.settingsSectionExtraPadding]">
          <button
            :class="[styles.settingsNavLink, !isDarkMode ? styles.light : '']"
            @click="emit('update:settingsPage', 'automations')"
          >
            <span>Manage MCP & Webhooks</span>
            <span :class="styles.settingsNavLinkRight">
              <span
                v-if="endpoint && connectionStatus !== 'disconnected'"
                :class="[styles.mcpNavIndicator, styles[connectionStatus]]"
              />
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M7.5 12.5L12 8L7.5 3.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </span>
          </button>
        </div>
      </div>

      <!-- Automations Page -->
      <div
        :class="[
          styles.settingsPage,
          styles.automationsPage,
          settingsPage === 'automations' ? styles.slideIn : '',
        ]"
      >
        <button
          :class="[styles.settingsBackButton, !isDarkMode ? styles.light : '']"
          @click="emit('update:settingsPage', 'main')"
        >
          <IconChevronLeft :size="16" />
          <span>Manage MCP & Webhooks</span>
        </button>

        <!-- MCP Connection section -->
        <div :class="styles.settingsSection">
          <div :class="styles.settingsRow">
            <span :class="[styles.automationHeader, !isDarkMode ? styles.light : '']">
              MCP Connection
              <ToolbarTooltip
                content="Connect via Model Context Protocol to let AI agents like Claude Code receive annotations in real-time."
                :is-transitioning="isTransitioning"
              >
                <span :class="[styles.helpIcon, styles.helpIconNudgeDown]">
                  <IconHelp :size="20" />
                </span>
              </ToolbarTooltip>
            </span>
            <div
              v-if="endpoint"
              :class="[styles.mcpStatusDot, styles[connectionStatus]]"
              :title="
                connectionStatus === 'connected'
                  ? 'Connected'
                  : connectionStatus === 'connecting'
                    ? 'Connecting...'
                    : 'Disconnected'
              "
            />
          </div>
          <p :class="[styles.automationDescription, !isDarkMode ? styles.light : '']" :style="{ paddingBottom: '6px' }">
            MCP connection allows agents to receive and act on annotations.
            <a
              href="https://agentation.dev/mcp"
              target="_blank"
              rel="noopener noreferrer"
              :class="[styles.learnMoreLink, !isDarkMode ? styles.light : '']"
            >Learn more</a>
          </p>
        </div>

        <!-- Webhooks section -->
        <div :class="[styles.settingsSection, styles.settingsSectionGrow]">
          <div :class="styles.settingsRow">
            <span :class="[styles.automationHeader, !isDarkMode ? styles.light : '']">
              Webhooks
              <ToolbarTooltip
                content="Send annotation data to any URL endpoint when annotations change. Useful for custom integrations."
                :is-transitioning="isTransitioning"
              >
                <span :class="[styles.helpIcon, styles.helpIconNoNudge]">
                  <IconHelp :size="20" />
                </span>
              </ToolbarTooltip>
            </span>
            <div :class="styles.autoSendRow">
              <span
                :class="[
                  styles.autoSendLabel,
                  !isDarkMode ? styles.light : '',
                  settings.webhooksEnabled ? styles.active : '',
                ]"
              >Auto-Send</span>
              <label :class="[styles.toggleSwitch, !settings.webhookUrl ? styles.disabled : '']">
                <input
                  type="checkbox"
                  :checked="settings.webhooksEnabled"
                  :disabled="!settings.webhookUrl"
                  @change="updateSetting('webhooksEnabled', !settings.webhooksEnabled)"
                />
                <span :class="styles.toggleSlider" />
              </label>
            </div>
          </div>
          <p :class="[styles.automationDescription, !isDarkMode ? styles.light : '']">
            The webhook URL will receive live annotation changes and annotation data.
          </p>
          <textarea
            :class="[styles.webhookUrlInput, !isDarkMode ? styles.light : '']"
            placeholder="Webhook URL"
            :value="settings.webhookUrl"
            :style="{ '--marker-color': settings.annotationColor } as any"
            @input="updateSetting('webhookUrl', ($event.target as HTMLTextAreaElement).value)"
          />
        </div>
      </div>
    </div>
  </div>
</template>

<script lang="ts">
// Declare the build-time constant
declare const __VERSION__: string
</script>
