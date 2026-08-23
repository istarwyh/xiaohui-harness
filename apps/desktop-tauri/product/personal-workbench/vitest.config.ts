import { defineConfig } from 'vitest/config'
import tsconfigPaths from 'vite-tsconfig-paths'

export default defineConfig({
  root: import.meta.dirname,
  plugins: [tsconfigPaths({ projects: ['../../../../tsconfig.base.json'] })],
  test: {
    include: ['tests/**/*.spec.ts', 'tests/**/*.spec.tsx'],
  },
})
