// Parsování importovaného souboru (project-management.feature).
//
// Import je jediné místo, kde do aplikace vstupují data z jiné (starší) verze,
// takže se tady i dorovnávají na dnešní tvar — viz `personFromImport`.
import { describe, expect, it } from 'vitest';
import { parseImportFile } from './importExport';

/**
 * JSON soubor pro `parseImportFile`.
 *
 * jsdom zatím neimplementuje `Blob.prototype.text()`, které JSON větev
 * používá — v prohlížeči je plně podporované, jde tedy o mezeru testovacího
 * prostředí, ne produkčního kódu.
 */
function jsonFile(data: Record<string, unknown>): File {
  const file = new File([JSON.stringify(data)], 'zaloha.json', { type: 'application/json' });
  if (typeof file.text !== 'function') {
    Object.defineProperty(file, 'text', { value: async () => JSON.stringify(data) });
  }
  return file;
}

// ── Kompatibilita se staršími exporty ────────────────────────────────────────

describe('parseImportFile — starší formát exportu', () => {
  // @scenario: project-management.feature > Import staršího exportu bez vazby na účty
  it('doplní osobám chybějící userId', async () => {
    // `Person.userId` přibyl až s rolemi (ADR-006) a na serveru je povinný.
    // Bez doplnění server odmítne CELÝ `full_state_import` na vazbě argumentů
    // — nenaimportuje se nic, ani úkoly a dokumentace.
    const legacy = {
      _version: 1,
      project: { name: 'Starý projekt', startDate: '2026-01-05', endDate: '2026-07-03' },
      people: [{ id: 'p1', name: 'Petra Kolářová', role: 'BE', color: '#34d399', weekAlloc: [] }],
      tasks: [],
    };
    const parsed = await parseImportFile(jsonFile(legacy));

    expect(parsed.people[0].userId).toBeNull();
    expect(parsed.people[0].name).toBe('Petra Kolářová');
  });

  it('existující userId nepřepíše', async () => {
    const current = {
      _version: 1,
      project: { name: 'Nový projekt' },
      people: [{ id: 'p1', name: 'Petra', role: 'BE', color: '#34d399', weekAlloc: [], userId: 'u-petra' }],
    };
    const parsed = await parseImportFile(jsonFile(current));

    expect(parsed.people[0].userId).toBe('u-petra');
  });
});
