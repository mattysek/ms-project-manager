// Obrazovka „Výkazy práce" (PRD-10, FR-WL-11).
//
// Vlastní cesta `/vykazy` mimo `ProjectWorkspace`, stejně jako „Moje práce"
// (PRD-08): vykazovaná činnost nemusí patřit žádnému projektu, takže desátá
// záložka projektu by pro ni nebyla místo.
import type { WorkLogEntry } from '../../api/worklogApi';
import { AppStyles } from '../AppStyles';
import { NoticeBanner } from '../NoticeBanner';
import { EntryForm } from './EntryForm';
import { EntryList } from './EntryList';
import { WorkLogFilters } from './WorkLogFilters';
import { WorkLogSummary } from './WorkLogSummary';
import { exportWorkLogToExcel } from './exportWorkLogToExcel';
import { describePeriod } from './period';
import { useWorkLogPage } from './useWorkLogPage';

const PAGE_STYLE: React.CSSProperties = {
  fontFamily: "'IBM Plex Mono','Courier New',monospace",
  background: '#0f1117',
  minHeight: '100vh',
  color: '#e2e8f0',
  padding: '32px 28px',
};

interface WorkLogPageProps {
  onBack: () => void;
}

function TabButton({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={active ? 'btn btn-active' : 'btn'}
      aria-pressed={active}
      onClick={onClick}
    >
      {label}
    </button>
  );
}

export function WorkLogPage({ onBack }: WorkLogPageProps) {
  const page = useWorkLogPage();
  const { data, timer, period, filter } = page;

  const filterLabel = [
    filter.projectId ? (page.projectNames.get(filter.projectId) ?? filter.projectId) : null,
    filter.tag || null,
    filter.search || null,
  ]
    .filter(Boolean)
    .join(' + ');

  return (
    <div style={PAGE_STYLE}>
      {/* Bez `AppStyles` by tahle stránka měla neostylovaná `.btn` a `.inp` —
          přesně to se stalo „Mojí práci". */}
      <AppStyles />
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18 }}>
          <button type="button" className="btn" onClick={onBack}>
            ← Projekty
          </button>
          <div style={{ fontSize: 18, fontWeight: 700, color: '#4f9cf9' }}>⏱ Výkazy práce</div>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
            <TabButton
              active={page.tab === 'entries'}
              label="Záznamy"
              onClick={() => page.setTab('entries')}
            />
            <TabButton
              active={page.tab === 'summary'}
              label="Přehled"
              onClick={() => page.setTab('summary')}
            />
          </div>
        </div>

        <NoticeBanner
          variant="card"
          message={data.error ?? timer.error ?? timer.notice}
          onDismiss={data.error ? data.dismissError : timer.dismissNotice}
        />

        <WorkLogFilters
          period={period}
          onPeriod={page.setPeriod}
          filter={filter}
          onFilter={page.setFilter}
          projects={page.projects}
          knownTags={data.knownTags}
        />

        {page.tab === 'entries' ? (
          <EntriesTab page={page} filterLabel={filterLabel || 'Vše'} />
        ) : (
          <WorkLogSummary
            entries={page.visible}
            now={timer.now}
            period={period}
            projectNames={page.projectNames}
          />
        )}
      </div>
    </div>
  );
}

function EntriesTab({
  page,
  filterLabel,
}: {
  page: ReturnType<typeof useWorkLogPage>;
  filterLabel: string;
}) {
  const onSave = (input: Parameters<typeof page.data.save>[0]) => page.data.save(input);

  return (
    <>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <button type="button" className="btn btn-primary" onClick={page.openNew}>
          + Nový záznam
        </button>
        <button
          type="button"
          className="btn btn-accent"
          onClick={() =>
            exportWorkLogToExcel(page.visible, {
              periodLabel: describePeriod(page.period),
              filterLabel,
              projectNames: page.projectNames,
            })
          }
        >
          ⬇ Export
        </button>
      </div>

      {page.formOpen && (
        <div
          style={{
            border: '1px solid #1e2533',
            borderRadius: 8,
            padding: 14,
            marginBottom: 16,
            maxWidth: 520,
          }}
        >
          <EntryForm
            entry={page.editing ?? undefined}
            projects={page.projects}
            knownTags={page.data.knownTags}
            onSave={onSave}
            onCancel={page.closeForm}
          />
        </div>
      )}

      {page.data.loading ? (
        <div style={{ color: '#64748b', fontSize: 11 }}>Načítám…</div>
      ) : (
        <EntryList
          entries={page.visible}
          now={page.timer.now}
          projectNames={page.projectNames}
          onEdit={page.openEdit}
          onDelete={(entry: WorkLogEntry) => page.remove(entry)}
        />
      )}
    </>
  );
}
