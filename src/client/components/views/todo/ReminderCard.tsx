// Jedna opakující se připomínka — zobrazení i editace (todo-reminders.feature).
import type { RecurringReminder } from '../../../types';
import {
  formatCzechDate,
  formatCzechDateObj,
  isReminderDue,
  nextOccurrence,
  recurrenceSummary,
} from '../../../utils/reminders';
import { ReminderEditForm } from './ReminderEditForm';
import { renderTextWithLinks } from './textHelpers';

// ── REMINDER CARD ─────────────────────────────────────────────────────────────

interface ReminderCardProps {
  r: RecurringReminder;
  isEditing: boolean;
  today: Date;
  onUpdate: (id: string, field: keyof RecurringReminder, value: string | boolean) => void;
  onDelete: (id: string) => void;
  onComplete: (id: string) => void;
  onToggleEdit: (id: string | null) => void;
}

/** Barevný štítek vlevo nahoře karty — priorita: vypnutá → splatná → souhrn opakování. */
function ReminderStatusBadge({ r, due }: { r: RecurringReminder; due: boolean }) {
  if (!r.enabled) {
    return (
      <span
        style={{
          padding: '2px 8px',
          background: '#33415522',
          border: '1px solid #33415588',
          borderRadius: 12,
          color: '#94a3b8',
          fontSize: 9,
          fontWeight: 700,
        }}
      >
        Vypnuto
      </span>
    );
  }
  if (due) {
    return (
      <span
        style={{
          padding: '2px 8px',
          background: '#f59e0b33',
          border: '1px solid #f59e0b88',
          borderRadius: 12,
          color: '#fcd34d',
          fontSize: 9,
          fontWeight: 700,
        }}
      >
        K PROVEDENÍ
      </span>
    );
  }
  return (
    <span
      style={{
        padding: '2px 8px',
        background: '#22c55e22',
        border: '1px solid #22c55e44',
        borderRadius: 12,
        color: '#4ade80',
        fontSize: 9,
        fontWeight: 500,
      }}
    >
      {recurrenceSummary(r)}
    </span>
  );
}

const ACTION_BTN: React.CSSProperties = { padding: '2px 9px', fontSize: 10 };

/** Řádek s akcemi karty — zapnout/vypnout, hotovo, editace, smazání. */
function ReminderActions({
  r,
  due,
  isEditing,
  onUpdate,
  onDelete,
  onComplete,
  onToggleEdit,
}: Omit<ReminderCardProps, 'today'> & { due: boolean }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        marginBottom: isEditing ? 8 : 6,
      }}
    >
      <ReminderStatusBadge r={r} due={due} />

      {/* Enable/disable toggle — akční popisek (co se stane po kliknutí), ne
          aktuální stav (ten nese `ReminderStatusBadge` výše — „Vypnuto"). */}
      <button
        type="button"
        className="btn"
        onClick={() => onUpdate(r.id, 'enabled', !r.enabled)}
        style={{ ...ACTION_BTN, background: '#161b27', borderColor: '#2d3748', color: '#64748b' }}
      >
        {r.enabled ? 'Vypnout' : 'Zapnout'}
      </button>

      <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
        {due && r.enabled && (
          <button
            type="button"
            className="btn"
            onClick={() => onComplete(r.id)}
            style={{
              ...ACTION_BTN,
              background: '#0d2210',
              borderColor: '#34d39966',
              color: '#6ee7b7',
            }}
          >
            Hotovo
          </button>
        )}
        <button
          type="button"
          className="btn"
          onClick={() => onToggleEdit(isEditing ? null : r.id)}
          style={{ ...ACTION_BTN, background: '#161b27', borderColor: '#2d3748', color: '#94a3b8' }}
        >
          {isEditing ? '✓ Zavřít' : '✎ Edit'}
        </button>
        <button
          type="button"
          className="btn"
          onClick={() => onDelete(r.id)}
          style={{
            ...ACTION_BTN,
            background: '#2a1010',
            borderColor: '#f8717144',
            color: '#f87171',
          }}
        >
          ✕
        </button>
      </div>
    </div>
  );
}

/** Text připomínky a termíny — zobrazuje se, když se karta needituje. */
function ReminderDetails({
  r,
  due,
  nextDue,
}: {
  r: RecurringReminder;
  due: boolean;
  nextDue: Date;
}) {
  return (
    <>
      <div
        style={{
          fontSize: 12,
          fontWeight: 600,
          color: due ? '#fcd34d' : '#f1f5f9',
          marginBottom: 5,
          userSelect: 'text',
          cursor: 'text',
        }}
      >
        {renderTextWithLinks(r.title)}
      </div>
      {r.description && (
        <div
          style={{
            fontSize: 11,
            color: '#94a3b8',
            lineHeight: 1.6,
            whiteSpace: 'pre-wrap',
            marginBottom: 6,
            userSelect: 'text',
            cursor: 'text',
          }}
        >
          {renderTextWithLinks(r.description)}
        </div>
      )}
      <div style={{ fontSize: 10, color: '#475569' }}>
        {due ? (
          <>
            Další termín:{' '}
            <strong style={{ color: '#fbbf24' }}>{formatCzechDateObj(nextDue)}</strong>
          </>
        ) : (
          <>Další termín: {formatCzechDateObj(nextDue)}</>
        )}
        {r.lastCompleted && (
          <span style={{ marginLeft: 12 }}>· Naposledy: {formatCzechDate(r.lastCompleted)}</span>
        )}
      </div>
    </>
  );
}

export function ReminderCard({
  r,
  isEditing,
  today,
  onUpdate,
  onDelete,
  onComplete,
  onToggleEdit,
}: ReminderCardProps) {
  const due = isReminderDue(r, today);

  return (
    <div
      style={{
        background: due ? '#2a2010' : '#0f1117',
        border: `1px solid ${due ? '#f59e0b55' : '#1e2533'}`,
        borderRadius: 8,
        padding: '14px 16px',
        marginBottom: 8,
      }}
    >
      <ReminderActions
        r={r}
        due={due}
        isEditing={isEditing}
        onUpdate={onUpdate}
        onDelete={onDelete}
        onComplete={onComplete}
        onToggleEdit={onToggleEdit}
      />
      {isEditing ? (
        <ReminderEditForm r={r} onUpdate={onUpdate} />
      ) : (
        <ReminderDetails r={r} due={due} nextDue={nextOccurrence(r)} />
      )}
    </div>
  );
}
