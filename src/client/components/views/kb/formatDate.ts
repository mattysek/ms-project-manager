/** Datum poslední úpravy KB stránky ve formátu „14. srp 2026, 10:32". */
export function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('cs-CZ', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
