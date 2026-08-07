import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // The engine is a linked workspace package shipping raw TypeScript.
  // Excluding it from dep pre-bundling keeps edits hot-reloading correctly.
  optimizeDeps: { exclude: ['@nenworld/engine'] },
  server: { port: 5180 },
});
