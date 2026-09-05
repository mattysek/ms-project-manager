// Rychlý start a stop z horní lišty (FR-WL-10).
//
// Panel umí schválně málo: spustit činnost, zastavit běžící a poslat dál na
// celou obrazovku. Úpravy časů, filtry a statistiky patří tam, kde je na ně
// místo — tady by z toho byla druhá, horší kopie výkazů.
import { useId, useState } from 'react';
import type { WorkTimer } from '../../hooks/useWorkTimer';
import { durationMs, formatDuration } from '../../utils/worklog';
import { FloatingPanel } from '../FloatingPanel';
import { TagInput } from './TagInput';
import type { ProjectOption } from './EntryForm';

interface WorkLogPanelProps {
  timer: WorkTimer;
  projects: ProjectOption[];
  knownTags: string[];
  onClose: () => void;
  onOpenFull: () => void;
}

function RunningView({ timer }: { timer: WorkTimer }) {
  const running = timer.running;
  if (!running) return null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ fontSize: 11, color: '#94a3b8' }}>Běží</div>
      <div style={{ fontSize: 13, color: '#e2e8f0' }}>{running.title}</div>
      <div style={{ fontSize: 28, color: '#34d399' }}>
        {formatDuration(durationMs(running, timer.now))}
      </div>
      <button type="button" className="btn btn-danger" onClick={() => void timer.stop()}>
        ⏹ Stop
      </button>
    </div>
  );
}

function StartForm({
  timer,
  projects,
  knownTags,
}: {
  timer: WorkTimer;
  projects: ProjectOption[];
  knownTags: string[];
}) {
  const [title, setTitle] = useState('');
  const [projectId, setProjectId] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const titleId = useId();

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!title.trim()) return;
    await timer.start({ title: title.trim(), projectId: projectId || null, tags });
    setTitle('');
    setTags([]);
  };

  return (
    <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <label className="auth-label" htmlFor={titleId}>
        Co teď děláš?
      </label>
      <input
        id={titleId}
        className="inp"
        value={title}
        onChange={(event) => setTitle(event.target.value)}
      />
      <select
        className="inp"
        aria-label="Projekt"
        value={projectId}
        onChange={(event) => setProjectId(event.target.value)}
      >
        <option value="">Bez projektu</option>
        {projects.map((project) => (
          <option key={project.id} value={project.id}>
            {project.name}
          </option>
        ))}
      </select>
      <TagInput tags={tags} suggestions={knownTags} onChange={setTags} />
      <button type="submit" className="btn btn-primary">
        ▶ Start
      </button>
    </form>
  );
}

export function WorkLogPanel({
  timer,
  projects,
  knownTags,
  onClose,
  onOpenFull,
}: WorkLogPanelProps) {
  return (
    <FloatingPanel
      label="Výkazy práce"
      title="⏱ Výkazy práce"
      closeLabel="Zavřít výkazy"
      onClose={onClose}
    >
      <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
        {timer.notice && <div className="auth-notice">{timer.notice}</div>}
        {timer.error && <div className="auth-error">{timer.error}</div>}
        {timer.running ? (
          <RunningView timer={timer} />
        ) : (
          <StartForm timer={timer} projects={projects} knownTags={knownTags} />
        )}
        <button type="button" className="btn btn-accent" onClick={onOpenFull}>
          Otevřít výkazy
        </button>
      </div>
    </FloatingPanel>
  );
}
