import type { ViewType } from '../types';
import type { PresenceEntry } from '../types/protocol';
import type { ChannelConnectionStatus } from '../hooks/useProjectChannel';
import { TABS } from '../constants';
import { fmtPeriod, progressColor } from '../utils';
import { HeaderConnectionStatus } from './HeaderConnectionStatus';
import { PresenceAvatars } from './PresenceAvatars';

interface HeaderProps {
  projectName: string;
  startDate: string;
  endDate: string;
  budget: number;
  numWeeks: number;
  grand: number;
  /** Naplánovaná práce v MD (součet `task.md`) — hlavní číslo souhrnu. */
  planned: number;
  /** `planned − budget`; barvu souhrnu řídí tenhle rozdíl, ne kapacita. */
  plannedDiff: number;
  overallProgress: number;
  view: ViewType;
  setView: (view: ViewType) => void;
  exportJSON: () => void;
  onBack: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  connectionStatus: ChannelConnectionStatus;
  presence: PresenceEntry[];
  /**
   * Počet splatných připomínek přihlášeného uživatele. Bez odznaku byly
   * připomínky vidět až po otevření záložky TODO, takže fakticky
   * nepřipomínaly (todo-reminders.feature).
   */
  dueReminders: number;
}

// Barva souhrnu: naplánovaná práce vs. rozpočet — výrazný přesah červeně,
// mírný žlutě, v pořádku zeleně.
function mdSummaryColor(plannedDiff: number): string {
  if (plannedDiff > 8) return '#f87171';
  if (plannedDiff > 0) return '#fbbf24';
  return '#34d399';
}

export function Header({
  projectName,
  startDate,
  endDate,
  budget,
  numWeeks,
  grand,
  planned,
  plannedDiff,
  overallProgress,
  view,
  setView,
  exportJSON,
  onBack,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  connectionStatus,
  presence,
  dueReminders,
}: HeaderProps) {
  return (
    <div
      style={{
        background: 'linear-gradient(135deg,#0d1117,#161b27)',
        borderBottom: '1px solid #1e2533',
        padding: '16px 28px 0',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 14,
          flexWrap: 'wrap',
          marginBottom: 12,
        }}
      >
        <button
          type="button"
          className="btn"
          onClick={onBack}
          style={{
            background: 'transparent',
            border: '1px solid #2d3748',
            color: '#64748b',
            padding: '4px 10px',
            fontSize: 12,
          }}
          title="Zpět na seznam projektů"
        >
          ← Projekty
        </button>

        <ProjectTitle
          projectName={projectName}
          startDate={startDate}
          endDate={endDate}
          budget={budget}
          numWeeks={numWeeks}
        />

        <div
          style={{
            marginLeft: 'auto',
            display: 'flex',
            gap: 8,
            alignItems: 'center',
            flexWrap: 'wrap',
          }}
        >
          <UndoRedo canUndo={canUndo} canRedo={canRedo} onUndo={onUndo} onRedo={onRedo} />
          {/* Stav spojení (nahrazuje bývalý „Uloženo HH:MM" — persistence běží na serveru) */}
          <HeaderConnectionStatus connectionStatus={connectionStatus} />
          {/* Presence — FR-COLLAB-04 */}
          <PresenceAvatars users={presence} />
          <ProgressSummary overallProgress={overallProgress} />
          <MdSummary grand={grand} planned={planned} plannedDiff={plannedDiff} />
          <ExportButton exportJSON={exportJSON} />
        </div>
      </div>
      <TabBar view={view} setView={setView} dueReminders={dueReminders} />
    </div>
  );
}

/** Název projektu, období, budget a počet týdnů. */
function ProjectTitle({
  projectName,
  startDate,
  endDate,
  budget,
  numWeeks,
}: Pick<HeaderProps, 'projectName' | 'startDate' | 'endDate' | 'budget' | 'numWeeks'>) {
  const meta: React.CSSProperties = { fontSize: 11, fontWeight: 400, color: '#475569' };
  return (
    <div>
      <div
        style={{
          fontSize: 10,
          color: '#4f9cf9',
          letterSpacing: '0.15em',
          textTransform: 'uppercase',
          marginBottom: 3,
        }}
      >
        {projectName}
      </div>
      <div
        style={{
          fontFamily: "'IBM Plex Sans',sans-serif",
          fontSize: 15,
          fontWeight: 600,
          color: '#f1f5f9',
        }}
      >
        {fmtPeriod(startDate, endDate)}
        <span style={{ ...meta, marginLeft: 12 }}>Budget: {budget} MD</span>
        <span style={{ ...meta, marginLeft: 8 }}>· {numWeeks} týdnů</span>
      </div>
    </div>
  );
}

function UndoRedo({
  canUndo,
  canRedo,
  onUndo,
  onRedo,
}: Pick<HeaderProps, 'canUndo' | 'canRedo' | 'onUndo' | 'onRedo'>) {
  const style = (enabled: boolean): React.CSSProperties => ({
    background: 'transparent',
    border: '1px solid #2d3748',
    color: enabled ? '#94a3b8' : '#334155',
    padding: '4px 8px',
    fontSize: 14,
    cursor: enabled ? 'pointer' : 'not-allowed',
  });
  return (
    <div style={{ display: 'flex', gap: 2 }}>
      <button
        type="button"
        className="btn"
        onClick={onUndo}
        disabled={!canUndo}
        style={style(canUndo)}
        title="Zpět (Ctrl+Z)"
      >
        ↶
      </button>
      <button
        type="button"
        className="btn"
        onClick={onRedo}
        disabled={!canRedo}
        style={style(canRedo)}
        title="Znovu (Ctrl+Shift+Z)"
      >
        ↷
      </button>
    </div>
  );
}

function ProgressSummary({ overallProgress }: Pick<HeaderProps, 'overallProgress'>) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '4px 10px',
        background: '#0c1018',
        border: '1px solid #1e2533',
        borderRadius: 4,
      }}
    >
      <div
        style={{ width: 60, height: 6, background: '#1e2533', borderRadius: 3, overflow: 'hidden' }}
      >
        <div
          style={{
            width: `${overallProgress}%`,
            height: '100%',
            background: overallProgress === 100 ? '#34d399' : '#fbbf24',
            borderRadius: 3,
            transition: 'width 0.3s',
          }}
        />
      </div>
      <span style={{ fontSize: 11, fontWeight: 600, color: progressColor(overallProgress) }}>
        {overallProgress}%
      </span>
    </div>
  );
}

/**
 * Naplánovaná práce proti rozpočtu, s dostupnou kapacitou jako doplňkem.
 *
 * Dřív tu stálo jen `grand` (kapacita) a `grandDiff` proti rozpočtu, takže
 * hlavička odpovídala na „má tým víc lidí, než rozpočet platí?" — ne na
 * otázku, kterou PM opravdu má. Naplánováno je teď hlavní číslo, kapacita
 * zůstala jako kontext: bez ní není poznat, jestli se práce vůbec dá stihnout.
 */
function MdSummary({
  grand,
  planned,
  plannedDiff,
}: Pick<HeaderProps, 'grand' | 'planned' | 'plannedDiff'>) {
  return (
    <div style={{ fontSize: 13, fontWeight: 700, color: mdSummaryColor(plannedDiff) }}>
      {planned} MD
      <span
        style={{
          fontSize: 10,
          fontWeight: 500,
          marginLeft: 6,
          color: plannedDiff > 0 ? '#f87171' : '#34d399',
        }}
      >
        {plannedDiff > 0 ? '+' : ''}
        {plannedDiff} vs rozpočet
      </span>
      <span style={{ fontSize: 10, fontWeight: 500, marginLeft: 8, color: '#64748b' }}>
        · kapacita {grand} MD
      </span>
    </div>
  );
}

/**
 * Jen export.
 *
 * Import do OTEVŘENÉHO projektu tady byl taky, ale byl to nůž: přepsal celý
 * stav projektu jedním `full_state_import` a stál vedle nenápadného „Export".
 * Smysluplný import je „ze zálohy udělej nový projekt", a ten je na
 * LandingPage, kde nemá co přepsat.
 */
function ExportButton({ exportJSON }: Pick<HeaderProps, 'exportJSON'>) {
  return (
    <button
      type="button"
      className="btn"
      onClick={exportJSON}
      style={{ background: '#0d2a1a', borderColor: '#16a34a44', color: '#4ade80' }}
    >
      ⬇ Export
    </button>
  );
}

/** Počet splatných připomínek u záložky TODO; nula se nezobrazuje. */
function ReminderBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span
      role="status"
      aria-label={`Splatné připomínky: ${count}`}
      style={{
        marginLeft: 6,
        padding: '1px 6px',
        fontSize: 9,
        fontWeight: 700,
        borderRadius: 8,
        background: '#7c2d12',
        border: '1px solid #fbbf2455',
        color: '#fcd34d',
      }}
    >
      {count}
    </span>
  );
}

function TabBar({
  view,
  setView,
  dueReminders,
}: Pick<HeaderProps, 'view' | 'setView' | 'dueReminders'>) {
  return (
    <div style={{ display: 'flex', gap: 0, overflowX: 'auto' }} role="tablist">
      {TABS.map(([v, l]) => (
        <button
          type="button"
          key={v}
          role="tab"
          aria-selected={view === v}
          onClick={() => setView(v as ViewType)}
          style={{
            padding: '7px 18px',
            fontSize: 11,
            fontWeight: view === v ? 600 : 400,
            letterSpacing: '0.07em',
            textTransform: 'uppercase',
            cursor: 'pointer',
            color: view === v ? '#f1f5f9' : '#64748b',
            borderBottom: view === v ? '2px solid #4f9cf9' : '2px solid transparent',
            borderTop: 'none',
            borderLeft: 'none',
            borderRight: 'none',
            background: 'transparent',
            transition: 'all .2s',
            userSelect: 'none',
            whiteSpace: 'nowrap',
            fontFamily: 'inherit',
            outline: 'none',
          }}
          onFocus={(e) => {
            e.currentTarget.style.outline = '1px solid #4f9cf955';
            e.currentTarget.style.outlineOffset = '-1px';
          }}
          onBlur={(e) => {
            e.currentTarget.style.outline = 'none';
          }}
        >
          {l}
          {v === 'todo' && <ReminderBadge count={dueReminders} />}
        </button>
      ))}
    </div>
  );
}
