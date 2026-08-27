// „Přehled připomínek pro aktuální měsíc" — všechny výskyty (i minulé) v
// rámci kalendářního měsíce, `todo-reminders.feature` scénář „Přehled
// připomínek pro aktuální měsíc". Na rozdíl od `UpcomingReminders` jde o
// rozvrh (`occurrencesInMonth` — čistá funkce data zahájení + opakování), ne o
// stav plnění — proběhlé výskyty se zobrazují taky, jen odlišené stylem.
import type { CSSProperties } from 'react';
import type { RecurringReminder } from '../../../types';
import { daysUntil, formatCzechDayMonth, occurrencesInMonth } from '../../../utils/reminders';

interface MonthlyReminderOverviewProps {
  reminders: RecurringReminder[];
  today: Date;
}

const HEADING_STYLE: CSSProperties = {
  fontSize: 10,
  color: '#64748b',
  letterSpacing: '0.1em',
  textTransform: 'uppercase',
  fontWeight: 700,
  marginBottom: 8,
};

function occurrenceChip(date: Date, today: Date): { key: string; text: string; past: boolean } {
  // „Minulý" = dnes nebo dřív (scénář „Přehled připomínek…" počítá i dnešní
  // výskyt mezi minulé — do budoucna zbývají jen ty ostré `> today`).
  const past = daysUntil(date, today) <= 0;
  const label = formatCzechDayMonth(date);
  return { key: date.toISOString(), text: past ? `${label} (proběhlo)` : label, past };
}

export function MonthlyReminderOverview({ reminders, today }: MonthlyReminderOverviewProps) {
  const year = today.getFullYear();
  const month = today.getMonth();
  const rows = reminders
    .map((reminder) => ({ reminder, occurrences: occurrencesInMonth(reminder, year, month) }))
    .filter((row) => row.occurrences.length > 0);

  if (rows.length === 0) return null;

  return (
    <div style={{ padding: '10px 16px', borderBottom: '1px solid #1e253366' }}>
      <div style={HEADING_STYLE}>Přehled připomínek pro aktuální měsíc</div>
      {rows.map(({ reminder, occurrences }) => (
        <div key={reminder.id} style={{ fontSize: 11, marginBottom: 4 }}>
          <span style={{ color: '#e2e8f0' }}>{reminder.title}: </span>
          {occurrences.map((date, i) => {
            const chip = occurrenceChip(date, today);
            return (
              <span key={chip.key} style={{ color: chip.past ? '#475569' : '#94a3b8' }}>
                {chip.text}
                {i < occurrences.length - 1 ? ', ' : ''}
              </span>
            );
          })}
        </div>
      ))}
    </div>
  );
}
