import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  // O mesmo plugin do build: JSX com runtime automático (ficheiros sem
  // `import React` funcionam nos testes como funcionam na app).
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.js'],
  },
});
