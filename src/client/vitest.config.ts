import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// Samostatná konfigurace pro Vitest, oddělená od vite.config.ts (produkční build).
// Testovací nastavení (jsdom prostředí, setup soubor) nemá co dělat v konfiguraci,
// která ovlivňuje výstup do dist/ — viz ADR-011.
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./test/setup.ts'],
    css: false,
    restoreMocks: true,
  },
});
