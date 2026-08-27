// Akce nad opakujícími se připomínkami (todo-reminders.feature).
import { useState } from 'react';
import type { RecurringReminder } from '../../../types';
import { toISO, uid } from '../../../utils';

export function useReminderActions(
  reminders: RecurringReminder[],
  setReminders: React.Dispatch<React.SetStateAction<RecurringReminder[]>>
) {
  /** Id právě editované připomínky — nová se otevře k editaci rovnou. */
  const [editR, setEditR] = useState<string | null>(null);

  const updR = (id: string, f: keyof RecurringReminder, v: string | boolean) =>
    setReminders((p) => p.map((r) => (r.id === id ? { ...r, [f]: v } : r)));

  const delR = (id: string) => {
    const reminder = reminders.find((r) => r.id === id);
    if (!reminder) return;
    if (!window.confirm(`Opravdu trvale odstranit připomínku "${reminder.title}"?`)) return;
    setReminders((p) => p.filter((r) => r.id !== id));
  };

  /**
   * Odškrtnutí výskytu zároveň zavře editaci.
   *
   * Nová připomínka se otevře rovnou k editaci (`addR`), takže po zadání
   * názvu a kliknutí na „Hotovo" zůstávala v rozepsaném stavu s poli
   * dokořán — a jediná cesta ven bylo najít ještě „✓ Zavřít". Že se to dělo
   * jen u té první, byla shoda okolností: `editR` drží jedno id, takže
   * založení další připomínky tu předchozí zavřelo za ni.
   *
   * „Hotovo" je konec práce s kartou, ne mezikrok — zavírá tedy i editaci.
   */
  const completeR = (id: string) => {
    setReminders((p) =>
      p.map((r) => (r.id === id ? { ...r, lastCompleted: toISO(new Date()) } : r))
    );
    setEditR((current) => (current === id ? null : current));
  };

  const addR = () => {
    const id = uid();
    setReminders((p) => [
      ...p,
      {
        id,
        title: 'Nové upozornění',
        description: '',
        startDate: toISO(new Date()),
        recurrence: 'weekly',
        enabled: true,
      },
    ]);
    setEditR(id);
  };

  return { editR, setEditR, updR, delR, completeR, addR };
}
