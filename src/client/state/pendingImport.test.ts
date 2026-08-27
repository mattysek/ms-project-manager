// Odložený import mezi LandingPage a otevřeným projektem.
import { afterEach, describe, expect, it } from 'vitest';
import { stashPendingImport, takePendingImport } from './pendingImport';
import { makeAppState } from './testFixtures';
import type { ParsedImportData } from '../utils/importExport';

function parsed(fileCount: number, contentSize: number): ParsedImportData {
  const state = makeAppState();
  return {
    project: state.project,
    people: state.people,
    tasks: state.tasks,
    cats: state.cats,
    roles: state.roles,
    risks: [],
    opps: [],
    reminders: [],
    todos: [],
    kbPages: [],
    adoConfig: null,
    adoSyncLog: [],
    files: Array.from({ length: fileCount }, (_, i) => ({
      id: `f${i}`,
      name: `priloha-${i}.docx`,
      mimeType: 'application/octet-stream',
      size: contentSize,
      addedAt: '2026-01-05T08:00:00Z',
      note: '',
      content: 'A'.repeat(contentSize),
    })),
  };
}

afterEach(() => sessionStorage.clear());

describe('pendingImport', () => {
  it('vrátí odložený import i s přílohami', () => {
    stashPendingImport('p1', parsed(2, 10));

    const taken = takePendingImport('p1');

    expect(taken?.files).toHaveLength(2);
    expect(taken?.files[0].content).toBe('A'.repeat(10));
    expect(taken?.project.name).toBe(makeAppState().project.name);
  });

  // @scenario: project-management.feature > Import velkého ZIPu s přílohami
  it('obsah příloh se do sessionStorage neukládá', () => {
    // Tady byla ta chyba: ukládal se celý výsledek parsování včetně base64
    // obsahu. Reálný export (9,6 MB ZIP → ~13 MB base64) tím přetekl kvótu
    // úložiště a import spadl na „exceeded the quota" ve chvíli, kdy už na
    // serveru vznikl prázdný projekt.
    stashPendingImport('p1', parsed(3, 2000));

    const stored = sessionStorage.getItem('pendingImport:p1') ?? '';
    expect(stored).not.toContain('AAAA');
    expect(stored.length).toBeLessThan(2000);
  });

  it('velký ZIP odložení nezhavaruje', () => {
    // 8 MB obsahu — přes kvótu `sessionStorage`, ale do paměti se vejde.
    expect(() => stashPendingImport('p1', parsed(2, 4 * 1024 * 1024))).not.toThrow();
    expect(takePendingImport('p1')?.files).toHaveLength(2);
  });

  it('druhé vyzvednutí už nic nevrátí', () => {
    stashPendingImport('p1', parsed(1, 10));

    expect(takePendingImport('p1')).not.toBeNull();
    expect(takePendingImport('p1')).toBeNull();
  });

  it('po reloadu zbyde textová část bez příloh', () => {
    // Paměť reload nepřežije, `sessionStorage` ano — projekt se naimportuje,
    // jen bez příloh. Lepší než nenaimportovat nic.
    stashPendingImport('p1', parsed(2, 10));
    const stored = sessionStorage.getItem('pendingImport:p1');
    sessionStorage.clear();
    sessionStorage.setItem('pendingImport:p1', stored ?? '');

    // Simulace nového načtení stránky: paměťová mapa je prázdná, protože
    // `stash` proběhl v minulé relaci — vyzvedneme pod jiným id.
    sessionStorage.setItem('pendingImport:p2', stored ?? '');
    const taken = takePendingImport('p2');

    expect(taken?.files).toEqual([]);
    expect(taken?.project.name).toBe(makeAppState().project.name);
  });
});
