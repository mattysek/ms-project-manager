// Filtry seznamu výkazů (FR-WL-07). Období jde na server, zbytek se
// vyhodnocuje až nad staženými daty.
import { useId } from 'react';
import type { WorkLogFilter } from '../../utils/worklog';
import type { ProjectOption } from './EntryForm';
import { PERIOD_LABELS, makePeriod, type Period, type PeriodKind } from './period';

interface WorkLogFiltersProps {
  period: Period;
  onPeriod: (period: Period) => void;
  filter: WorkLogFilter;
  onFilter: (filter: WorkLogFilter) => void;
  projects: ProjectOption[];
  knownTags: string[];
}

const QUICK_PERIODS: Exclude<PeriodKind, 'custom'>[] = ['week', 'month', 'last30'];

export function WorkLogFilters({
  period,
  onPeriod,
  filter,
  onFilter,
  projects,
  knownTags,
}: WorkLogFiltersProps) {
  const fromId = useId();
  const toId = useId();
  const searchId = useId();

  const setDay = (field: 'fromDay' | 'toDay', value: string) =>
    onPeriod({ ...period, kind: 'custom', [field]: value });

  return (
    <div
      style={{
        display: 'flex',
        gap: 8,
        flexWrap: 'wrap',
        alignItems: 'flex-end',
        marginBottom: 16,
      }}
    >
      {QUICK_PERIODS.map((kind) => (
        <button
          key={kind}
          type="button"
          className={period.kind === kind ? 'btn btn-active' : 'btn'}
          aria-pressed={period.kind === kind}
          onClick={() => onPeriod(makePeriod(kind, new Date()))}
        >
          {PERIOD_LABELS[kind]}
        </button>
      ))}
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <label className="auth-label" htmlFor={fromId}>
          Od
        </label>
        <input
          id={fromId}
          type="date"
          className="inp"
          value={period.fromDay}
          onChange={(event) => setDay('fromDay', event.target.value)}
        />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <label className="auth-label" htmlFor={toId}>
          Do
        </label>
        <input
          id={toId}
          type="date"
          className="inp"
          value={period.toDay}
          onChange={(event) => setDay('toDay', event.target.value)}
        />
      </div>
      <select
        className="inp"
        aria-label="Filtr podle projektu"
        value={filter.projectId}
        onChange={(event) => onFilter({ ...filter, projectId: event.target.value })}
      >
        <option value="">Všechny projekty</option>
        {projects.map((project) => (
          <option key={project.id} value={project.id}>
            {project.name}
          </option>
        ))}
      </select>
      <select
        className="inp"
        aria-label="Filtr podle tagu"
        value={filter.tag}
        onChange={(event) => onFilter({ ...filter, tag: event.target.value })}
      >
        <option value="">Všechny tagy</option>
        {knownTags.map((tag) => (
          <option key={tag} value={tag}>
            {tag}
          </option>
        ))}
      </select>
      <div style={{ display: 'flex', flexDirection: 'column', flex: '1 1 160px' }}>
        <label className="auth-label" htmlFor={searchId}>
          Hledat
        </label>
        <input
          id={searchId}
          className="inp"
          value={filter.search}
          placeholder="Název nebo popis"
          onChange={(event) => onFilter({ ...filter, search: event.target.value })}
        />
      </div>
    </div>
  );
}
