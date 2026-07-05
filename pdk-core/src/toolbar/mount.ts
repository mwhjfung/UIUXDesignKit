/**
 * pdk-tools.js entry — the self-contained browser toolbar bundle.
 *
 * Loaded into any prototype page (Vue, React, plain HTML) by
 * tooling/pdk-prelude.js. Vue is bundled inside; CSS-module class names are
 * hashed and styles are injected by the bundle, so the host page's framework
 * and styles are untouched.
 *
 * Mounts only when the page's own dev server exposes the PDK middleware
 * (GET /markup/health) — i.e. never on production builds or non-PDK pages.
 */

import { createApp, h } from 'vue'
import MarkupToolbar from './markup'
import { TweakerHost } from './tweaker'

declare global {
  interface Window {
    __PDK_TOOLS_MOUNTED__?: boolean
  }
}

const CONTAINER_ID = '__pdk-tools'

async function serverHasMarkup(): Promise<boolean> {
  try {
    const res = await fetch('/markup/health')
    return res.ok
  } catch {
    return false
  }
}

async function mount(): Promise<void> {
  if (window.__PDK_TOOLS_MOUNTED__ || document.getElementById(CONTAINER_ID)) return
  if (!(await serverHasMarkup())) {
    console.info('[pdk-tools] no /markup endpoint on this origin — toolbar not mounted')
    return
  }
  window.__PDK_TOOLS_MOUNTED__ = true

  const container = document.createElement('div')
  container.id = CONTAINER_ID
  document.body.appendChild(container)

  const app = createApp({
    name: 'PdkTools',
    render: () => [h(MarkupToolbar, { endpoint: '/markup' }), h(TweakerHost)],
  })
  app.mount(container)
  console.info('[pdk-tools] toolbar mounted')
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => void mount())
} else {
  void mount()
}
