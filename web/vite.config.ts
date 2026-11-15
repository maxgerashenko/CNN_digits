import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

// base './' makes every asset path relative, so the same build works at
// https://<user>.github.io/CNN_digits/ and at any other address.
export default defineConfig({
  base: './',
  plugins: [react()],
  build: {
    outDir: 'dist',
    sourcemap: false,
    // TensorFlow.js is loaded on demand and is a large chunk by nature.
    chunkSizeWarningLimit: 2000,
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    css: { modules: { classNameStrategy: 'non-scoped' } },
    restoreMocks: true,
  },
});
