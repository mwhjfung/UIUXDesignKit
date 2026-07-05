/**
 * Builds the injectable browser toolbar (dist/tooling/pdk-tools.js).
 *
 * Single self-contained IIFE: Vue runtime bundled, styles injected by JS
 * (CSS-module hashed class names keep them from clashing with host pages).
 * Served to prototypes by the catalogue dev server under /tooling/.
 */

import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'
import cssInjectedByJsPlugin from 'vite-plugin-css-injected-by-js'

export default defineConfig({
  plugins: [vue(), cssInjectedByJsPlugin()],
  define: {
    'process.env.NODE_ENV': JSON.stringify('production'),
    __VUE_OPTIONS_API__: 'true',
    __VUE_PROD_DEVTOOLS__: 'false',
    __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: 'false',
  },
  build: {
    outDir: 'dist/tooling',
    emptyOutDir: true,
    sourcemap: false,
    lib: {
      entry: 'src/toolbar/mount.ts',
      name: 'PdkTools',
      formats: ['iife'],
      fileName: () => 'pdk-tools.js',
    },
  },
})
