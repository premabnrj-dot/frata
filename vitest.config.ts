import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      // `server-only` throws outside Next's server build; tests run in plain Node.
      'server-only': fileURLToPath(new URL('./node_modules/server-only/empty.js', import.meta.url)),
    },
  },
  // tsconfig says jsx: preserve (Next compiles JSX); tests that import a page or component need it compiled here.
  oxc: { jsx: { runtime: 'automatic' } },
  test: { include: ['src/**/__tests__/**/*.test.ts', 'scripts/**/__tests__/**/*.test.ts'] },
})
