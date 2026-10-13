import { defineConfig } from 'electron-vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'

// Entries follow electron-vite defaults: src/main/index.ts, src/preload/index.ts, src/renderer/index.html.
// `node:sqlite` is a prefix-only builtin, so externalise it explicitly.
export default defineConfig({
  // `marked` is bundled into main so the packaged app needs no node_modules (package.json `files` is out/** only).
  // dynamicImportInCjs: false turns import() into require(): a native import() of a CommonJS package sees only the
  // exports Node can detect statically, and electron-updater's `autoUpdater` is a lazy getter it misses.
  main: {
    build: {
      externalizeDeps: { exclude: ['marked'] },
      rollupOptions: { external: ['node:sqlite'], output: { dynamicImportInCjs: false } }
    }
  },
  preload: {},
  renderer: { plugins: [svelte()] }
})
