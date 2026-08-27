// Testy `syncLogToCsv` — export sync logu do CSV (PRD-06, FR-ADO-10).
import { describe, expect, it } from 'vitest';
import { syncLogToCsv } from './adoLinks';
import type { ADOSyncLogEntry } from '../types';

function entry(overrides: Partial<ADOSyncLogEntry> = {}): ADOSyncLogEntry {
  return {
    id: 'e1',
    timestamp: '2026-08-11T14:36:00.000Z',
    action: 'ACKNOWLEDGED',
    details: 'Změna vzata na vědomí',
    ...overrides,
  };
}

describe('syncLogToCsv', () => {
  // @scenario: ado-sync.feature > Export sync logu do CSV (PM only)
  it('vygeneruje hlavičku a jeden řádek na záznam', () => {
    const csv = syncLogToCsv([
      entry({
        id: 'e2',
        action: 'PUSHED_TO_ADO',
        taskId: 't1',
        taskName: 'API refaktoring',
        wiId: 1234,
        wiTitle: 'Refaktoring API autentizace',
        details: 'Přiřazení posláno do ADO: petra.kolarova@firma.cz',
      }),
    ]);
    const lines = csv.replace(/^﻿/, '').split('\r\n');
    expect(lines[0]).toBe('Datum,Akce,ID úkolu,Úkol,WI,Název WI,Detail');
    expect(lines[1]).toContain('PUSHED_TO_ADO');
    expect(lines[1]).toContain('t1');
    expect(lines[1]).toContain('API refaktoring');
    expect(lines[1]).toContain('1234');
    expect(lines[1]).toContain('Přiřazení posláno do ADO: petra.kolarova@firma.cz');
  });

  it('escapuje buňky obsahující čárku nebo uvozovku', () => {
    const csv = syncLogToCsv([entry({ details: 'Popis, s čárkou a "citací"' })]);
    const [, row] = csv.replace(/^﻿/, '').split('\r\n');
    expect(row).toContain('"Popis, s čárkou a ""citací"""');
  });

  it('prázdný log vrátí jen hlavičku', () => {
    const csv = syncLogToCsv([]);
    const lines = csv.replace(/^﻿/, '').split('\r\n');
    expect(lines).toHaveLength(1);
    expect(lines[0]).toBe('Datum,Akce,ID úkolu,Úkol,WI,Název WI,Detail');
  });

  it('obsahuje BOM na začátku, aby Excel poznal UTF-8', () => {
    const csv = syncLogToCsv([entry()]);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
  });
});
