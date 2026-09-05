// Rozvrh opakujících se připomínek (todo-reminders.feature).
//
// Čistý výpočet nad `startDate`/`recurrence`/`lastCompleted` — server nic
// odvozeného nedrží (ADR-005), takže je tohle jediné místo, kde se rozhoduje,
// kdy je připomínka splatná.
import { describe, expect, it } from 'vitest';
import { toISO } from './dates';
import { isReminderDue, nextOccurrence, occurrenceAt, occurrencesInMonth } from './reminders';
import type { RecurrenceType, RecurringReminder } from '../types';

function reminder(over: Partial<RecurringReminder> & { startDate: string }): RecurringReminder {
  return {
    id: 'r1',
    title: 'Status',
    description: '',
    recurrence: 'weekly' as RecurrenceType,
    enabled: true,
    ...over,
  };
}

const day = (iso: string) => new Date(`${iso}T00:00:00`);

describe('nextOccurrence', () => {
  it('bez odškrtnutí je prvním výskytem datum zahájení', () => {
    expect(toISO(nextOccurrence(reminder({ startDate: '2026-08-03' })))).toBe('2026-08-03');
  });

  // @scenario: todo-reminders.feature > Označení připomínky jako splněné (pro tento výskyt)
  it('po odškrtnutí v termínu posune na další výskyt rozvrhu', () => {
    const r = reminder({ startDate: '2026-08-17', lastCompleted: '2026-08-17' });
    expect(toISO(nextOccurrence(r))).toBe('2026-08-24');
  });

  // @scenario: todo-reminders.feature > Pozdní odškrtnutí rozvrh neposune
  it('pozdní odškrtnutí rozvrh neposune', () => {
    // Pondělní status odškrtnutý ve středu. Dřív se počítalo
    // `lastCompleted + 7`, tedy středa 12. 8. — a od té chvíle už navždy středy.
    const r = reminder({ startDate: '2026-08-03', lastCompleted: '2026-08-05' });
    expect(toISO(nextOccurrence(r))).toBe('2026-08-10');
  });

  it('opakované zpoždění rozvrh nerozjede', () => {
    // Tři zpožděná odškrtnutí po sobě: rozvrh drží pondělky, protože se
    // odpočítává od `startDate`, ne od poslední kliknuté hodnoty.
    const late = ['2026-08-05', '2026-08-13', '2026-08-19'];
    const expected = ['2026-08-10', '2026-08-17', '2026-08-24'];

    late.forEach((completed, i) => {
      const r = reminder({ startDate: '2026-08-03', lastCompleted: completed });
      expect(toISO(nextOccurrence(r))).toBe(expected[i]);
    });
  });

  // @scenario: todo-reminders.feature > Zmeškaný výskyt se nepřeskakuje
  it('zmeškaný výskyt zůstává po termínu, nepřeskočí se na budoucí', () => {
    const r = reminder({ startDate: '2026-08-03', lastCompleted: '2026-08-03' });

    expect(toISO(nextOccurrence(r))).toBe('2026-08-10');
    expect(isReminderDue(r, day('2026-08-20'))).toBe(true);
  });

  it('vypnutá připomínka není splatná, i když má výskyt v minulosti', () => {
    const r = reminder({ startDate: '2026-08-03', enabled: false });
    expect(isReminderDue(r, day('2026-08-20'))).toBe(false);
  });

  it('výskyt přesně dnes je splatný', () => {
    const r = reminder({ startDate: '2026-08-17' });
    expect(isReminderDue(r, day('2026-08-17'))).toBe(true);
    expect(isReminderDue(r, day('2026-08-16'))).toBe(false);
  });

  it('biweekly skáče po čtrnácti dnech', () => {
    const r = reminder({
      startDate: '2026-08-03',
      recurrence: 'biweekly',
      lastCompleted: '2026-08-03',
    });
    expect(toISO(nextOccurrence(r))).toBe('2026-08-17');
  });
});

// @scenario: todo-reminders.feature > Měsíční připomínka na konci měsíce neuteče na začátek
describe('occurrenceAt — měsíční rozvrh', () => {
  it('konec měsíce se ořízne, místo aby přetekl do dalšího', () => {
    // `setMonth` na 31. 1. vyrobí 3. 3. (únor přeteče) a od té chvíle už
    // rozvrh běží na třetím dni v měsíci.
    const r = reminder({ startDate: '2026-01-31', recurrence: 'monthly' });

    expect([0, 1, 2, 3].map((i) => toISO(occurrenceAt(r, i)))).toEqual([
      '2026-01-31',
      '2026-02-28',
      '2026-03-31',
      '2026-04-30',
    ]);
  });

  it('den uprostřed měsíce zůstává beze změny', () => {
    const r = reminder({ startDate: '2026-01-15', recurrence: 'monthly' });
    expect(toISO(occurrenceAt(r, 2))).toBe('2026-03-15');
  });
});

// @scenario: todo-reminders.feature > Přehled připomínek pro aktuální měsíc
describe('occurrencesInMonth', () => {
  it('vrátí všechny výskyty daného měsíce', () => {
    const r = reminder({ startDate: '2026-08-03' });
    expect(occurrencesInMonth(r, 2026, 7).map(toISO)).toEqual([
      '2026-08-03',
      '2026-08-10',
      '2026-08-17',
      '2026-08-24',
      '2026-08-31',
    ]);
  });

  it('přehled a odpočet mluví o týchž datech', () => {
    // Tyhle dvě části obrazovky si dřív odporovaly: přehled stavěl rozvrh od
    // data zahájení, odpočet od data odškrtnutí.
    const r = reminder({ startDate: '2026-08-03', lastCompleted: '2026-08-05' });
    const next = toISO(nextOccurrence(r));

    expect(occurrencesInMonth(r, 2026, 7).map(toISO)).toContain(next);
  });

  it('měsíc před zahájením je prázdný', () => {
    const r = reminder({ startDate: '2026-08-03' });
    expect(occurrencesInMonth(r, 2026, 6)).toHaveLength(0);
  });
});
