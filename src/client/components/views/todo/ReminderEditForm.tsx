// Editační podoba karty připomínky — vytaženo z `ReminderCard`, aby ani
// jedna z obou větví nepřerostla rozpočet 60 řádků (ADR-012).
import type { RecurringReminder } from '../../../types';
import { RECURRENCE_SELECT_LABELS } from '../../../utils/reminders';

interface ReminderEditFormProps {
  r: RecurringReminder;
  onUpdate: (id: string, field: keyof RecurringReminder, value: string | boolean) => void;
}

export function ReminderEditForm({ r, onUpdate }: ReminderEditFormProps) {
  return (
    <>
      <input
        className="inp"
        value={r.title}
        onChange={(e) => onUpdate(r.id, 'title', e.target.value)}
        style={{ width: '100%', marginBottom: 6, fontWeight: 600 }}
        placeholder="Název..."
        // biome-ignore lint/a11y/noAutofocus: uživatel právě přepnul do editace jediné karty
        autoFocus
      />
      <textarea
        className="inp"
        value={r.description}
        onChange={(e) => onUpdate(r.id, 'description', e.target.value)}
        style={{ width: '100%', marginBottom: 8, minHeight: 80 }}
        placeholder="Popis (podporuje více řádků a odkazy)..."
      />
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <label
            htmlFor={`reminder-start-${r.id}`}
            style={{ fontSize: 9, color: '#64748b', display: 'block', marginBottom: 3 }}
          >
            Začátek
          </label>
          <input
            id={`reminder-start-${r.id}`}
            type="date"
            className="inp"
            value={r.startDate}
            onChange={(e) => onUpdate(r.id, 'startDate', e.target.value)}
            style={{ width: 130 }}
          />
        </div>
        <div>
          <label
            htmlFor={`reminder-recurrence-${r.id}`}
            style={{ fontSize: 9, color: '#64748b', display: 'block', marginBottom: 3 }}
          >
            Opakování
          </label>
          <select
            id={`reminder-recurrence-${r.id}`}
            className="inp"
            value={r.recurrence}
            onChange={(e) => onUpdate(r.id, 'recurrence', e.target.value)}
            style={{ width: 130, cursor: 'pointer' }}
          >
            <option value="weekly">{RECURRENCE_SELECT_LABELS.weekly}</option>
            <option value="biweekly">{RECURRENCE_SELECT_LABELS.biweekly}</option>
            <option value="monthly">{RECURRENCE_SELECT_LABELS.monthly}</option>
          </select>
        </div>
      </div>
    </>
  );
}
