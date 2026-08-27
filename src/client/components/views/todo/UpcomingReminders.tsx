// „Nadcházející připomínky" — souhrn zapnutých připomínek seřazený podle
// dalšího výskytu, `todo-reminders.feature` scénář „Zobrazení nadcházejících
// připomínek". Vypnuté připomínky sem nepatří (scénáře „Disable"/„Enable"
// připomínky) — zůstávají jen v hlavním seznamu níž, označené „Vypnuto".
import type { CSSProperties } from 'react';
import type { RecurringReminder } from '../../../types';
import {
  daysUntil,
  formatCzechDateObj,
  nextOccurrence,
  relativeDaysLabel,
} from '../../../utils/reminders';

interface UpcomingRemindersProps {
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

export function UpcomingReminders({ reminders, today }: UpcomingRemindersProps) {
  const upcoming = reminders
    .filter((r) => r.enabled)
    .map((reminder) => ({ reminder, next: nextOccurrence(reminder) }))
    .sort((a, b) => a.next.getTime() - b.next.getTime());

  return (
    <div style={{ padding: '10px 16px', borderBottom: '1px solid #1e253366' }}>
      <div style={HEADING_STYLE}>Nadcházející připomínky</div>
      {upcoming.length === 0 ? (
        <div style={{ color: '#475569', fontSize: 11 }}>Žádné aktivní připomínky</div>
      ) : (
        upcoming.map(({ reminder, next }) => (
          <div
            key={reminder.id}
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              fontSize: 11,
              padding: '3px 0',
            }}
          >
            <span style={{ color: '#e2e8f0' }}>{reminder.title}</span>
            <span style={{ color: '#94a3b8' }}>
              {formatCzechDateObj(next)} ({relativeDaysLabel(daysUntil(next, today))})
            </span>
          </div>
        ))
      )}
    </div>
  );
}
