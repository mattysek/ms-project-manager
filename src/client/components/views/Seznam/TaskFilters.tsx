// Řádek s filtrem kategorie, filtrem osoby, souhrnem a exportem do Excelu.
import type { Categories, PersonWithWeeks } from '../../../types';
import type { TaskFiltersState } from './useTaskFilters';

interface TaskFiltersSummary {
  count: number;
  totalMd: number;
  onExport: () => void;
}

interface TaskFiltersProps {
  cats: Categories;
  people: PersonWithWeeks[];
  filters: TaskFiltersState;
  summary: TaskFiltersSummary;
}

export function TaskFilters({ cats, people, filters, summary }: TaskFiltersProps) {
  return (
    <div
      style={{ display: 'flex', gap: 6, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}
    >
      <span style={{ fontSize: 10, color: '#475569', marginRight: 2 }}>Filtr:</span>
      {['all', ...Object.keys(cats)].map((k) => {
        const c =
          k === 'all' ? { bd: '#4f9cf9', tx: '#4f9cf9', bg: '#0d1f38', label: 'Vše' } : cats[k];
        const on = filters.filter === k;
        return (
          <button
            type="button"
            key={k}
            onClick={() => filters.setFilter(k)}
            style={{
              padding: '3px 10px',
              fontSize: 9,
              borderRadius: 5,
              cursor: 'pointer',
              fontFamily: 'inherit',
              background: on ? c.bg : 'transparent',
              border: `1px solid ${on ? c.bd : '#2d3748'}`,
              color: on ? c.tx : '#475569',
              transition: 'all .15s',
            }}
          >
            {c.label}
          </button>
        );
      })}
      <label style={{ fontSize: 10, color: '#475569', marginLeft: 10 }}>
        Filtr osoby:{' '}
        <select
          aria-label="Filtr osoby"
          className="inp"
          value={filters.personFilter}
          onChange={(e) => filters.setPersonFilter(e.target.value)}
          style={{ fontSize: 10 }}
        >
          <option value="all">Všichni</option>
          {people.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </label>
      <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{ fontSize: 10, color: '#64748b' }}>
          {summary.count} úkolů ·{' '}
          <span style={{ color: '#f1f5f9', fontWeight: 700 }}>{summary.totalMd.toFixed(1)} MD</span>
        </span>
        <button
          type="button"
          className="btn"
          onClick={summary.onExport}
          style={{
            padding: '3px 12px',
            background: '#0d1f38',
            borderColor: '#4f9cf944',
            color: '#4f9cf9',
            fontSize: 10,
            display: 'flex',
            alignItems: 'center',
            gap: 5,
          }}
        >
          <span style={{ fontSize: 12 }}>&#x2913;</span>
          Export Excel
        </button>
      </div>
    </div>
  );
}
