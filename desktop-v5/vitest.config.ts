import { svelte } from '@sveltejs/vite-plugin-svelte'
import { defineConfig } from 'vitest/config'

// The plugin compiles `.svelte.ts` modules (runes), which the renderer's i18n state uses.
export default defineConfig({
  plugins: [svelte()],
  test: { include: ['tests/**/*.test.ts'], environment: 'node' }
})
