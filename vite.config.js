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
        // 英文覆盖表文本量大且随译文增补，单独成块，避免把 index 主包顶过体积预算
        manualChunks(id) {
          if (/node_modules[/\\]three[/\\]/.test(id)) return 'three';
          if (/src[/\\]locales[/\\]en\.js$/.test(id)) return 'locale-en';
        },
      },
    },
  },
});
