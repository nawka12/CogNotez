import { defineConfig } from 'electron-vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'

// Entries follow electron-vite defaults: src/main/index.ts, src/preload/index.ts, src/renderer/index.html.
// `node:sqlite` is a prefix-only builtin, so externalise it explicitly.
export default defineConfig({
  main: { build: { rollupOptions: { external: ['node:sqlite'] } } },
  preload: {},
  renderer: { plugins: [svelte()] }
})
