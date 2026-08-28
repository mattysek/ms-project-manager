// „Moje práce" — úkoly přihlášeného uživatele napříč všemi projekty (PRD-08).
//
// Nová obrazovka, ne záložka projektu: kapacita je vlastnost člověka, ale
// `Person.weekAlloc` i úkoly žijí uvnitř jednoho projektu. Kdo je na třech
// projektech po 100 %, není v žádném z nich přetížený — a přitom nemá šanci to
// stihnout. Tohle je jediné místo, kde je to vidět.
import { useEffect, useRef } from 'react';
import type { MyTask } from '../../api/workloadApi';
import { AppStyles } from '../AppStyles';
import { formatCzechDate } from '../../utils/reminders';
import { useMyWorkload } from './useMyWorkload';
import type { WeekBucket } from './useMyWorkload';

interface MyWorkPageProps {
  onBack: () => void;
  /**
   * Otevře úkol tam, kde se i edituje — Úkoly + rozbalený detail.
   *
   * Dřív se prokliklo jen do projektu a uživatel si musel úkol najít sám,
   * což je u projektu s desítkami řádků práce navíc přesně ve chvíli, kdy
   * už jednou řekl, o který úkol jde.
   */
  onOpenTask: (projectId: string, taskId: string) => void;
}

const PAGE_STYLE: React.CSSProperties = {
  fontFamily: "'IBM Plex Mono','Courier New',monospace",
  background: '#0f1117',
  minHeight: '100vh',
  color: '#e2e8f0',
  padding: '32px 28px',
};

/** Kolik MD nad kapacitu je ještě šum ze zaokrouhlení, ne přetížení. */
const EPSILON = 0.05;

function loadColor(bucket: WeekBucket): string {
  if (bucket.demand > bucket.workdays + EPSILON) return '#f87171';
  if (bucket.demand > bucket.workdays * 0.85) return '#fbbf24';
  return '#34d399';
}

function TaskRow({ task, onOpen }: { task: MyTask; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        width: '100%',
        textAlign: 'left',
        background: 'none',
        border: 'none',
        borderTop: '1px solid #1e253366',
        color: 'inherit',
        cursor: 'pointer',
        fontFamily: 'inherit',
        fontSize: 11,
        padding: '7px 4px',
      }}
    >
      <span style={{ color: '#64748b', minWidth: 160 }}>{task.projectName}</span>
      <span style={{ flex: 1, color: '#e2e8f0' }}>{task.name}</span>
      <span style={{ color: '#94a3b8' }}>{task.md} MD</span>
      <span style={{ color: task.progress === 100 ? '#34d399' : '#475569', minWidth: 40 }}>
        {task.progress} %
      </span>
    </button>
  );
}

function WeekCard({
  bucket,
  isCurrent,
  cardRef,
  onOpen,
}: {
  bucket: WeekBucket;
  isCurrent: boolean;
  /** Nastaví se jen u týdne, na který se scrolluje (FR-WORK-07). */
  cardRef: React.Ref<HTMLDivElement> | undefined;
  onOpen: (task: MyTask) => void;
}) {
  return (
    <div
      ref={cardRef}
      style={{
        // Aktuální týden je zvýrazněný schválně: bez něj by posun seznamu
        // vypadal jako náhodná pozice a uživatel by nevěděl, kde je.
        border: isCurrent ? '1px solid #4f9cf9' : '1px solid #1e2533',
        borderRadius: 10,
        marginBottom: 14,
      }}
    >
      <div
        style={{
          background: '#161b27',
          padding: '8px 14px',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          fontSize: 11,
        }}
      >
        <span style={{ color: isCurrent ? '#93c5fd' : '#94a3b8', fontWeight: 700 }}>
          Týden od {formatCzechDate(bucket.mondayIso)}
        </span>
        {isCurrent && (
          <span
            style={{
              padding: '1px 7px',
              borderRadius: 8,
              background: '#0d1f38',
              border: '1px solid #4f9cf955',
              color: '#93c5fd',
              fontSize: 9,
            }}
          >
            tento týden
          </span>
        )}
        <span style={{ marginLeft: 'auto', color: loadColor(bucket), fontWeight: 700 }}>
          {bucket.demand} / {bucket.workdays} MD
        </span>
      </div>
      <div style={{ padding: '0 14px 8px' }}>
        {bucket.tasks.map((task) => (
          <TaskRow
            key={`${task.projectId}-${task.taskId}`}
            task={task}
            onOpen={() => onOpen(task)}
          />
        ))}
      </div>
    </div>
  );
}

function UndatedSection({ tasks, onOpen }: { tasks: MyTask[]; onOpen: (task: MyTask) => void }) {
  if (tasks.length === 0) return null;
  return (
    <div style={{ border: '1px solid #1e2533', borderRadius: 10, marginBottom: 14 }}>
      <div style={{ background: '#161b27', padding: '8px 14px', fontSize: 11, color: '#94a3b8' }}>
        Bez termínu — projekt nemá nastavené datumy
      </div>
      <div style={{ padding: '0 14px 8px' }}>
        {tasks.map((task) => (
          <TaskRow
            key={`${task.projectId}-${task.taskId}`}
            task={task}
            onOpen={() => onOpen(task)}
          />
        ))}
      </div>
    </div>
  );
}

export function MyWorkPage({ onBack, onOpenTask }: MyWorkPageProps) {
  const workload = useMyWorkload();
  const openTask = (task: MyTask) => onOpenTask(task.projectId, task.taskId);
  const empty = !workload.loading && workload.weeks.length === 0 && workload.undated.length === 0;
  const focusRef = useRef<HTMLDivElement | null>(null);
  const scrolled = useRef(false);

  // Posun na aktuální týden se dělá **jen jednou za návštěvu** (FR-WORK-07).
  // „Obnovit" nesmí uživatele odrolovat zpátky: přehled se čte mimo actory
  // a obnovuje se často, takže by ho to při každém kliknutí vracelo z místa,
  // kam se právě prokoukal.
  useEffect(() => {
    if (scrolled.current || !workload.focusWeekIso || !focusRef.current) return;
    scrolled.current = true;
    focusRef.current.scrollIntoView({ block: 'start' });
  }, [workload.focusWeekIso]);

  return (
    <div style={PAGE_STYLE}>
      <AppStyles />
      <div style={{ maxWidth: 900, margin: '0 auto' }}>
        <Header
          onBack={onBack}
          onReload={workload.reload}
          staleAfterSeconds={workload.staleAfterSeconds}
        />

        {workload.error && (
          <div role="alert" style={{ color: '#fca5a5', fontSize: 11, marginBottom: 14 }}>
            ⚠ {workload.error}
          </div>
        )}
        {workload.loading && <div style={{ color: '#475569', fontSize: 11 }}>Načítám…</div>}
        {empty && (
          <div style={{ color: '#475569', fontSize: 11 }}>
            Nemáte přiřazený žádný úkol. Aby se sem úkoly dostaly, musí vás PM v Kapacitě spárovat s
            osobou (volba „Účet") a přiřadit vám práci.
          </div>
        )}

        {workload.weeks.map((bucket) => (
          <WeekCard
            key={bucket.mondayIso}
            bucket={bucket}
            isCurrent={bucket.mondayIso === workload.currentWeekIso}
            cardRef={bucket.mondayIso === workload.focusWeekIso ? focusRef : undefined}
            onOpen={openTask}
          />
        ))}
        <UndatedSection tasks={workload.undated} onOpen={openTask} />
      </div>
    </div>
  );
}

function Header({
  onBack,
  onReload,
  staleAfterSeconds,
}: {
  onBack: () => void;
  onReload: () => void;
  staleAfterSeconds: number;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
      <button
        type="button"
        className="btn"
        onClick={onBack}
        style={{ background: 'transparent', border: '1px solid #2d3748', color: '#64748b' }}
      >
        ← Projekty
      </button>
      <div>
        <div style={{ fontSize: 16, fontWeight: 700, color: '#f1f5f9' }}>Moje práce</div>
        {/* Přehled se čte mimo actory, takže může být pozadu (ADR-015).
            Radši to řekneme, než aby si uživatel myslel, že je živý. */}
        <div style={{ fontSize: 10, color: '#475569' }}>
          Napříč všemi projekty · údaje mohou být až {staleAfterSeconds} s staré
        </div>
      </div>
      {/* Přehled se nečte přes actory (ADR-015), takže čerstvě zadaný úkol se
          v něm objeví až po jednom persist ticku. Bez tlačítka by uživateli
          nezbylo než obnovovat celou stránku. */}
      <button
        type="button"
        className="btn"
        onClick={onReload}
        style={{
          marginLeft: 'auto',
          background: '#161b27',
          border: '1px solid #2d3748',
          color: '#94a3b8',
        }}
      >
        ↻ Obnovit
      </button>
    </div>
  );
}
