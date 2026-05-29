import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@core': resolve(__dirname, 'src/core'),
      '@generation': resolve(__dirname, 'src/generation'),
      '@rendering': resolve(__dirname, 'src/rendering'),
      '@export': resolve(__dirname, 'src/export'),
      '@ui': resolve(__dirname, 'src/ui'),
    },
  },
  server: {
    port: 3000,
    open: true,
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
});
