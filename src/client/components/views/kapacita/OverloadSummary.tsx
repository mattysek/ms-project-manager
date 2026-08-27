// Shrnutí přetížení nad alokační tabulkou.
//
// Barevné buňky samy o sobě nestačí: u projektu na 26 týdnů se přetížený
// týden snadno schová mimo viditelnou část tabulky. Shrnutí proto říká, kolik
// jich je, a odscrolluje na první z nich.
import type { Week } from '../../../types';

interface OverloadSummaryProps {
  weeks: Week[];
  /** Indexy týdnů, kde je aspoň jedna osoba přetížená. */
  overloadedWeeks: number[];
}

/** Český tvar podle počtu — „1 týden", „3 týdny", „6 týdnů". */
function weekCountLabel(count: number): string {
  if (count === 1) return '1 týden';
  if (count <= 4) return `${count} týdny`;
  return `${count} týdnů`;
}

export function OverloadSummary({ weeks, overloadedWeeks }: OverloadSummaryProps) {
  if (overloadedWeeks.length === 0) return null;

  const firstIdx = overloadedWeeks[0] ?? 0;
  const firstLabel = weeks[firstIdx]?.label ?? `W${firstIdx + 1}`;

  const scrollToFirst = () => {
    document
      .querySelector(`[data-week-index="${firstIdx}"]`)
      ?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
  };

  return (
    <button
      type="button"
      onClick={scrollToFirst}
      style={{
        display: 'block',
        width: '100%',
        marginBottom: 10,
        padding: '7px 12px',
        textAlign: 'left',
        fontSize: 11,
        borderRadius: 8,
        background: '#2a0a0a',
        border: '1px solid #f8717155',
        color: '#fca5a5',
        cursor: 'pointer',
        fontFamily: 'inherit',
      }}
    >
      Přetížení: {weekCountLabel(overloadedWeeks.length)} — první je {firstLabel}. Kliknutím
      přejdete na něj.
    </button>
  );
}
