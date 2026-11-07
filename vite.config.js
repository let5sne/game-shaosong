import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  server: {
    host: '0.0.0.0',
    port: 5173,
  },
  build: {
    outDir: 'dist',
    target: 'es2020',
    // three vendor 约 527 KB 属第三方固有体积，已异步化、不压首屏，抬过告警阈值
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        // three 核心与 addons 单独成块：可跨版本长期缓存，且不进首屏关键路径
        manualChunks(id) {
          if (/node_modules[/\\]three[/\\]/.test(id)) return 'three';
        },
      },
    },
  },
});
