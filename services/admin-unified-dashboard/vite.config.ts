import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5176,
    open: true,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3000',
        changeOrigin: true,
        rewrite: (path) => path,
      },
      '/health': {
        target: 'http://127.0.0.1:3000',
        changeOrigin: true,
        rewrite: (path) => path,
      },
      '/metrics': {
        target: 'http://127.0.0.1:3000',
        changeOrigin: true,
        rewrite: (path) => path,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
});
