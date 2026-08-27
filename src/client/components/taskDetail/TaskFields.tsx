// Základní pole úkolu — název, přiřazení, kategorie, týdny, MD a progress.
import type { Categories, Category, PersonWithWeeks, Task } from '../../types';
import { progressColor } from '../../utils';
import type { TaskDraft } from './useTaskDraft';

const FIELD_LABEL: React.CSSProperties = {
  display: 'block',
  fontSize: 9,
  color: '#64748b',
  letterSpacing: '0.1em',
  textTransform: 'uppercase',
  marginBottom: 6,
};

interface TaskFieldsProps {
  editedTask: Task;
  updateField: TaskDraft['updateField'];
  cats: Categories;
  people: PersonWithWeeks[];
  numWeeks: number;
  currentCat: Category;
  currentPerson: PersonWithWeeks | undefined;
}

function NameField({
  editedTask,
  updateField,
}: Pick<TaskFieldsProps, 'editedTask' | 'updateField'>) {
  return (
    <div>
      <label htmlFor="task-detail-name" style={FIELD_LABEL}>
        Název úkolu
      </label>
      <input
        id="task-detail-name"
        className="inp"
        value={editedTask.name}
        onChange={(e) => updateField('name', e.target.value)}
        style={{ width: '100%', fontSize: 14, fontWeight: 600, color: '#f1f5f9' }}
      />
    </div>
  );
}

function AssignmentRow({
  editedTask,
  updateField,
  cats,
  people,
  currentCat,
  currentPerson,
}: Omit<TaskFieldsProps, 'numWeeks'>) {
  return (
    <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
      <div style={{ flex: '1 1 200px' }}>
        <label htmlFor="task-detail-person" style={FIELD_LABEL}>
          Přiřazeno
        </label>
        <select
          id="task-detail-person"
          className="inp"
          value={editedTask.p}
          onChange={(e) => updateField('p', e.target.value)}
          style={{ width: '100%', cursor: 'pointer', color: currentPerson?.color || '#64748b' }}
        >
          <option value="" style={{ background: '#0c1018', color: '#64748b' }}>
            — Backlog —
          </option>
          {people.map((p) => (
            <option key={p.id} value={p.id} style={{ background: '#0c1018', color: p.color }}>
              {p.name}
            </option>
          ))}
        </select>
      </div>

      <div style={{ flex: '1 1 200px' }}>
        <label htmlFor="task-detail-cat" style={FIELD_LABEL}>
          Kategorie
        </label>
        <select
          id="task-detail-cat"
          className="inp"
          value={editedTask.cat}
          onChange={(e) => updateField('cat', e.target.value)}
          style={{
            width: '100%',
            cursor: 'pointer',
            background: currentCat.bg,
            borderColor: currentCat.bd,
            color: currentCat.tx,
          }}
        >
          {Object.entries(cats).map(([k, v]) => (
            <option key={k} value={k} style={{ background: '#0c1018', color: '#e2e8f0' }}>
              {v.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

/** Číselné pole týdne — zároveň klávesnicová náhrada za drag/resize v Ganttu. */
function WeekField({
  id,
  label,
  value,
  numWeeks,
  onChange,
}: {
  id: string;
  label: string;
  value: number;
  numWeeks: number;
  onChange: (value: number) => void;
}) {
  return (
    <div style={{ flex: '0 0 auto' }}>
      <label htmlFor={id} style={FIELD_LABEL}>
        {label}
      </label>
      <input
        id={id}
        type="number"
        min={1}
        max={numWeeks}
        className="inp"
        value={value}
        onChange={(e) => onChange(Math.max(1, Math.min(numWeeks, Number(e.target.value) || 1)))}
        style={{ width: 70, textAlign: 'center', color: '#94a3b8' }}
      />
    </div>
  );
}

function ProgressField({
  editedTask,
  updateField,
}: Pick<TaskFieldsProps, 'editedTask' | 'updateField'>) {
  const progress = editedTask.progress ?? 0;
  return (
    <div style={{ flex: '1 1 150px' }}>
      <label htmlFor="task-detail-progress" style={{ ...FIELD_LABEL, color: '#34d399' }}>
        Progress: {progress}%
      </label>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <input
          id="task-detail-progress"
          aria-label="Progress"
          type="range"
          min={0}
          max={100}
          step={5}
          value={progress}
          onChange={(e) => updateField('progress', Number(e.target.value))}
          style={{
            flex: 1,
            height: 6,
            cursor: 'pointer',
            accentColor: progress === 100 ? '#34d399' : '#fbbf24',
          }}
        />
        <span
          style={{
            fontSize: 12,
            fontWeight: 700,
            minWidth: 40,
            textAlign: 'right',
            color: progressColor(progress),
          }}
        >
          {progress}%
        </span>
      </div>
    </div>
  );
}

function ScheduleRow({
  editedTask,
  updateField,
  numWeeks,
}: Pick<TaskFieldsProps, 'editedTask' | 'updateField' | 'numWeeks'>) {
  return (
    <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-end' }}>
      <WeekField
        id="task-detail-week-start"
        label="Týden od"
        value={editedTask.s}
        numWeeks={numWeeks}
        onChange={(v) => updateField('s', v)}
      />
      <WeekField
        id="task-detail-week-end"
        label="Týden do"
        value={editedTask.e}
        numWeeks={numWeeks}
        onChange={(v) => updateField('e', v)}
      />
      <div style={{ flex: '0 0 auto' }}>
        <label htmlFor="task-detail-md" style={{ ...FIELD_LABEL, color: '#f59e0b' }}>
          MD
        </label>
        <input
          id="task-detail-md"
          type="number"
          min={0.5}
          max={100}
          step={0.5}
          className="inp"
          value={editedTask.md}
          onChange={(e) => updateField('md', Number(e.target.value) || 1)}
          style={{ width: 80, textAlign: 'right', color: '#fcd34d', fontWeight: 700 }}
        />
      </div>
      <ProgressField editedTask={editedTask} updateField={updateField} />
    </div>
  );
}

export function TaskFields(props: TaskFieldsProps) {
  return (
    <>
      <NameField editedTask={props.editedTask} updateField={props.updateField} />
      <AssignmentRow {...props} />
      <ScheduleRow
        editedTask={props.editedTask}
        updateField={props.updateField}
        numWeeks={props.numWeeks}
      />
    </>
  );
}
