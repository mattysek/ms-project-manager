import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
    // Hashované názvy assetů (Vite default) → server je servíruje s immutable cache.
    // index.html se nehashuje a servíruje se s no-cache (viz ADR-011).
    assetsDir: 'assets',
    rollupOptions: {
      output: {
        // Těžké knihovny do vlastních chunků — mění se zřídka, cachují se nezávisle
        // na aplikačním kódu. Bez toho by každá změna v src/ invalidovala celý bundle.
        manualChunks: {
          react: ['react', 'react-dom'],
          xlsx: ['xlsx'],
          docx: ['mammoth'],
          zip: ['jszip'],
          canvas: ['html2canvas'],
          markdown: ['marked', 'turndown'],
        },
      },
    },
  },
});
