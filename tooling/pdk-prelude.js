/* ProductDesignKit — prelude
 *
 * Single include for all PDK tooling. Drop into any prototype's index.html:
 *   <script src="http://localhost:5170/tooling/pdk-prelude.js" async></script>
 *
 * Loads pdk-tools.js (Markup annotation toolbar + Tweaker), skipping it when
 * the catalogue isn't running. Framework-agnostic; works in Vue, React,
 * Svelte, plain HTML — the bundle carries its own runtime and styles.
 */
(function () {
  'use strict'

  const BASE = 'http://localhost:5170/tooling/'
  const TOOLS = ['pdk-tools.js']

  function loadScript(src) {
    return new Promise(function (resolve) {
      const s = document.createElement('script')
      s.src = src
      s.async = false
      s.onload = resolve
      s.onerror = function () {
        // Silently skip — catalogue may not be running in all environments
        resolve()
      }
      document.head.appendChild(s)
    })
  }

  // Load sequentially so annotate.js always comes before tweak-palette.js
  TOOLS.reduce(function (chain, tool) {
    return chain.then(function () { return loadScript(BASE + tool) })
  }, Promise.resolve())
})()
