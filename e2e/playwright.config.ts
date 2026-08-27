// Tenká E2E vrstva nad běžící aplikací.
//
// Záměrně **nekopíruje** 259 Gherkin scénářů — ty jsou z drtivé většiny
// jednotky logiky (výpočet MD, inverze commandu, mapování ADO stavů), kde by
// E2E test běžel řádově déle a řekl míň. Tady jsou jen věci, které unit testy
// z principu neověří: že server, klient, SignalR, SQLite a prohlížeč drží
// pohromadě.
import { defineConfig, devices } from '@playwright/test';

const BASE_URL = process.env.E2E_BASE_URL ?? 'http://localhost:8080';

export default defineConfig({
  testDir: './tests',
  // Sdílená databáze jednoho serveru: paralelní běh by si testy navzájem
  // přepisoval účty i projekty.
  workers: 1,
  fullyParallel: false,
  reporter: process.env.CI ? 'list' : [['list'], ['html', { open: 'never' }]],
  timeout: 30_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: BASE_URL,
    locale: 'cs-CZ',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
