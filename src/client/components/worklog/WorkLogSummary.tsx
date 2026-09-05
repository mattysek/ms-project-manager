// Přehled: dlaždice s metrikami a tři grafy nad zvoleným obdobím (FR-WL-08).
import { useMemo } from 'react';
import type { WorkLogEntry } from '../../api/worklogApi';
import { byProject, byTag, computeStats, dailySeries, formatDuration } from '../../utils/worklog';
import { DailyChart, SliceChart } from './WorkLogCharts';
import type { Period } from './period';

interface WorkLogSummaryProps {
  entries: WorkLogEntry[];
  now: number;
  period: Period;
  projectNames: Map<string, string>;
}

function Tile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div
      style={{
        border: '1px solid #1e2533',
        borderRadius: 8,
        padding: '10px 12px',
        minWidth: 150,
        flex: '1 1 150px',
      }}
    >
      <div
        style={{
          fontSize: 9,
          color: '#64748b',
          textTransform: 'uppercase',
          letterSpacing: '0.1em',
        }}
      >
        {label}
      </div>
      <div style={{ fontSize: 20, color: '#e2e8f0', marginTop: 4 }}>{value}</div>
      {hint && <div style={{ fontSize: 9, color: '#475569', marginTop: 4 }}>{hint}</div>}
    </div>
  );
}

export function WorkLogSummary({ entries, now, period, projectNames }: WorkLogSummaryProps) {
  const stats = useMemo(() => computeStats(entries, now), [entries, now]);
  const daily = useMemo(
    () => dailySeries(entries, now, { fromDay: period.fromDay, toDay: period.toDay }),
    [entries, now, period.fromDay, period.toDay]
  );
  const projects = useMemo(
    () => byProject(entries, now, projectNames),
    [entries, now, projectNames]
  );
  const tags = useMemo(() => byTag(entries, now), [entries, now]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <Tile label="Celkem odpracováno" value={formatDuration(stats.totalMs)} />
        {/* Popisek u průměru je funkční požadavek, ne dekorace: bez něj si
            každý přečte jiné číslo (ADR-017). */}
        <Tile
          label="Průměr na den"
          value={formatDuration(stats.averagePerDayMs)}
          hint="ze dnů, ve kterých je aspoň jeden záznam"
        />
        <Tile label="Dnů se záznamem" value={String(stats.daysWithWork)} />
        <Tile label="Nejdelší den" value={formatDuration(stats.longestDayMs)} />
        <Tile label="Počet záznamů" value={String(stats.entryCount)} />
        <Tile label="Průměrný záznam" value={formatDuration(stats.averageEntryMs)} />
      </div>

      <DailyChart points={daily} title="Odpracovaný čas po dnech" />

      <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 320px' }}>
          <SliceChart slices={projects} title="Podle projektů" />
        </div>
        <div style={{ flex: '1 1 320px' }}>
          <SliceChart
            slices={tags}
            title="Podle tagů"
            note="Záznam s víc tagy se počítá do každého z nich, takže součet může přesáhnout odpracovaný čas."
          />
        </div>
      </div>
    </div>
  );
}
