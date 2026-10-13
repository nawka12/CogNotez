import js from '@eslint/js'
import { defineConfig } from 'eslint/config'
import globals from 'globals'
import svelte from 'eslint-plugin-svelte'
import ts from 'typescript-eslint'

export default defineConfig(
  { ignores: ['out/', 'dist/', 'node_modules/', 'coverage/'] },
  js.configs.recommended,
  ts.configs.recommended,
  svelte.configs.recommended,
  {
    languageOptions: { globals: { ...globals.node } },
    rules: {
      'no-console': ['error', { allow: ['warn', 'error'] }],
      // typescript-eslint's recommended preset switches this off for .ts; we want it on.
      'no-dupe-class-members': 'error'
    }
  },
  {
    files: ['src/renderer/**/*.{ts,svelte}'],
    languageOptions: { globals: { ...globals.browser } }
  },
  {
    files: ['**/*.svelte', '**/*.svelte.ts'],
    languageOptions: { parserOptions: { parser: ts.parser } }
  },
  // The logger is the one place allowed to touch console.
  { files: ['src/main/log.ts'], rules: { 'no-console': 'off' } }
)
