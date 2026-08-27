/** Datum záznamu changelogu ve formátu „5. srp 2026". */
export function formatChangelogDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('cs-CZ', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}
