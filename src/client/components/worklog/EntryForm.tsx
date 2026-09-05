// Formulář záznamu — ruční zápis i oprava časů (FR-WL-01, FR-WL-04).
//
// Konec smí zůstat prázdný: takový záznam je běžící činnost a server podle
// toho ukončí tu předchozí (FR-WL-03).
import { useId, useState } from 'react';
import type { WorkLogEntry, WorkLogEntryInput } from '../../api/worklogApi';
import { fromLocalInputValue, toLocalInputValue } from '../../utils/worklog';
import { TagInput } from './TagInput';

export interface ProjectOption {
  id: string;
  name: string;
}

interface EntryFormProps {
  /** `undefined` = nový záznam. */
  entry?: WorkLogEntry;
  projects: ProjectOption[];
  knownTags: string[];
  onSave: (input: WorkLogEntryInput) => Promise<boolean>;
  onCancel: () => void;
}

interface Draft {
  title: string;
  description: string;
  projectId: string;
  startedAt: string;
  endedAt: string;
  tags: string[];
}

function toDraft(entry: WorkLogEntry | undefined): Draft {
  if (!entry) {
    const now = new Date().toISOString();
    return {
      title: '',
      description: '',
      projectId: '',
      startedAt: toLocalInputValue(now),
      endedAt: toLocalInputValue(now),
      tags: [],
    };
  }
  return {
    title: entry.title,
    description: entry.description,
    projectId: entry.projectId ?? '',
    startedAt: toLocalInputValue(entry.startedAt),
    endedAt: entry.endedAt ? toLocalInputValue(entry.endedAt) : '',
    tags: entry.tags,
  };
}

function Field({ label, children }: { label: string; children: (id: string) => React.ReactNode }) {
  const id = useId();
  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <label className="auth-label" htmlFor={id}>
        {label}
      </label>
      {children(id)}
    </div>
  );
}

/**
 * Dvojice datum+čas. Konec smí zůstat prázdný — takový záznam je běžící
 * činnost a server podle toho ukončí tu předchozí (FR-WL-03).
 */
function TimeRange({
  startedAt,
  endedAt,
  onChange,
}: {
  startedAt: string;
  endedAt: string;
  onChange: (field: 'startedAt' | 'endedAt', value: string) => void;
}) {
  return (
    <div style={{ display: 'flex', gap: 8 }}>
      {(['startedAt', 'endedAt'] as const).map((field) => (
        <div key={field} style={{ flex: 1 }}>
          <Field label={field === 'startedAt' ? 'Začátek' : 'Konec'}>
            {(id) => (
              <input
                id={id}
                type="datetime-local"
                className="inp"
                value={field === 'startedAt' ? startedAt : endedAt}
                onChange={(event) => onChange(field, event.target.value)}
              />
            )}
          </Field>
        </div>
      ))}
    </div>
  );
}

export function EntryForm({ entry, projects, knownTags, onSave, onCancel }: EntryFormProps) {
  const [draft, setDraft] = useState<Draft>(() => toDraft(entry));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const set = <K extends keyof Draft>(field: K, value: Draft[K]) =>
    setDraft((current) => ({ ...current, [field]: value }));

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!draft.title.trim()) {
      setError('Název činnosti je povinný');
      return;
    }
    if (draft.endedAt && draft.endedAt < draft.startedAt) {
      setError('Konec nesmí být dřív než začátek');
      return;
    }
    setSaving(true);
    setError(null);
    const saved = await onSave({
      id: entry?.id,
      title: draft.title.trim(),
      description: draft.description,
      projectId: draft.projectId || null,
      startedAt: fromLocalInputValue(draft.startedAt),
      endedAt: draft.endedAt ? fromLocalInputValue(draft.endedAt) : null,
      tags: draft.tags,
    });
    setSaving(false);
    if (saved) onCancel();
    else setError('Uložení se nepovedlo, zkontroluj časy');
  };

  return (
    <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <Field label="Název činnosti">
        {(id) => (
          <input
            id={id}
            className="inp"
            value={draft.title}
            onChange={(event) => set('title', event.target.value)}
          />
        )}
      </Field>
      <Field label="Popis">
        {(id) => (
          <textarea
            id={id}
            className="inp"
            rows={2}
            value={draft.description}
            onChange={(event) => set('description', event.target.value)}
          />
        )}
      </Field>
      <Field label="Projekt">
        {(id) => (
          <select
            id={id}
            className="inp"
            value={draft.projectId}
            onChange={(event) => set('projectId', event.target.value)}
          >
            <option value="">Bez projektu</option>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>
        )}
      </Field>
      <TimeRange
        startedAt={draft.startedAt}
        endedAt={draft.endedAt}
        onChange={(field, value) => set(field, value)}
      />
      <TagInput tags={draft.tags} suggestions={knownTags} onChange={(tags) => set('tags', tags)} />
      {error && <div className="auth-error">{error}</div>}
      <div style={{ display: 'flex', gap: 8 }}>
        <button type="submit" className="btn btn-primary" disabled={saving}>
          Uložit
        </button>
        <button type="button" className="btn" onClick={onCancel}>
          Zrušit
        </button>
      </div>
    </form>
  );
}
