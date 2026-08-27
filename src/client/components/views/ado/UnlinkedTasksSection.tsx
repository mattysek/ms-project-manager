// Úkoly bez ADO linku (FR-ADO-08).
import { useMemo, useState } from 'react';
import type { ADOConfig, ADOWorkItemDraft, Task } from '../../../types';
import type { AdoSyncCommands, UseAdoSyncResult } from '../../../hooks/useAdoSync';
import type { MemberRole } from '../../../types/protocol';
import { PermissionGate } from '../../PermissionGate';
import { mdToHours, tasksWithoutAdoLink } from '../../../utils/adoLinks';
import { Badge, TextField } from './primitives';
import {
  BTN_BLUE,
  BTN_GHOST,
  BTN_GREEN,
  EMPTY_BOX,
  GRID2,
  LABEL,
  PANEL,
  SECTION_TITLE,
  SUB_PANEL,
} from './styles';

interface PushFormProps {
  task: Task;
  config: ADOConfig;
  commands: AdoSyncCommands;
  onDone: () => void;
}

function PushToAdoForm({ task, config, commands, onDone }: PushFormProps) {
  const mapping = config.memberMapping.find((m) => m.plannerId === task.p);
  const [draft, setDraft] = useState<ADOWorkItemDraft>({
    wiType: config.defaultPushWiType,
    title: task.name,
    descriptionMd: task.desc,
    areaPath: config.areaPath,
    iterationPath: config.defaultIteration,
    assignedTo: mapping?.adoIdentity || '',
    remainingWork: mdToHours(task.md, config.mdToHoursCoefficient),
  });
  const set = (fields: Partial<ADOWorkItemDraft>) => setDraft((prev) => ({ ...prev, ...fields }));

  return (
    <div style={SUB_PANEL}>
      <div style={GRID2}>
        <TextField label="Typ WI" value={draft.wiType} onChange={(wiType) => set({ wiType })} />
        <TextField label="Název" value={draft.title} onChange={(title) => set({ title })} />
        <TextField
          label="Area Path"
          value={draft.areaPath}
          onChange={(areaPath) => set({ areaPath })}
        />
        <TextField
          label="Iterace"
          value={draft.iterationPath}
          onChange={(iterationPath) => set({ iterationPath })}
        />
        <TextField
          label="Přiřadit"
          value={draft.assignedTo}
          onChange={(assignedTo) => set({ assignedTo })}
          placeholder="jmeno@firma.cz"
        />
        <TextField
          label="Remaining Work (h)"
          value={String(draft.remainingWork)}
          onChange={(value) => set({ remainingWork: Number.parseFloat(value) || 0 })}
        />
      </div>
      <div style={{ marginTop: 12 }}>
        <label style={LABEL} htmlFor={`push-desc-${task.id}`}>
          Popis (Markdown)
        </label>
        <textarea
          id={`push-desc-${task.id}`}
          className="inp"
          value={draft.descriptionMd}
          onChange={(e) => set({ descriptionMd: e.target.value })}
          style={{ width: '100%', minHeight: 90 }}
        />
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 12, justifyContent: 'flex-end' }}>
        <button
          type="button"
          className="btn"
          onClick={() => {
            commands.createWorkItem(task.id, draft);
            onDone();
          }}
          style={BTN_GREEN}
        >
          Vytvořit WI
        </button>
        <button type="button" className="btn" onClick={onDone} style={BTN_GHOST}>
          Zrušit
        </button>
      </div>
    </div>
  );
}

interface UnlinkedRowProps {
  task: Task;
  config: ADOConfig | null;
  role: MemberRole | null;
  ignored: boolean;
  commands: AdoSyncCommands;
}

function UnlinkedTaskRow({ task, config, role, ignored, commands }: UnlinkedRowProps) {
  const [open, setOpen] = useState(false);

  return (
    <div style={{ padding: 12, borderBottom: '1px solid #1e253366', opacity: ignored ? 0.6 : 1 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 12, color: '#f1f5f9' }}>{task.name}</div>
          <div style={{ fontSize: 10, color: '#64748b' }}>
            W{task.s + 1}–W{task.e + 1} · {task.md} MD{ignored ? ' · ignorováno' : ''}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <PermissionGate role={role} require="pm">
            <button
              type="button"
              className="btn"
              onClick={() => setOpen(!open)}
              disabled={!config}
              style={BTN_BLUE}
            >
              {open ? 'Zrušit' : 'Přidat do ADO'}
            </button>
          </PermissionGate>
          <PermissionGate role={role} require="pm">
            <button
              type="button"
              className="btn"
              onClick={() => commands.ignoreUnlinkedTask(task.id, !ignored)}
              style={BTN_GHOST}
            >
              {ignored ? 'Znovu otevřít' : 'Ignorovat'}
            </button>
          </PermissionGate>
        </div>
      </div>
      {open && config && (
        <PushToAdoForm
          task={task}
          config={config}
          commands={commands}
          onDone={() => setOpen(false)}
        />
      )}
    </div>
  );
}

interface UnlinkedSectionProps {
  tasks: Task[];
  config: ADOConfig | null;
  role: MemberRole | null;
  ado: UseAdoSyncResult;
}

export function UnlinkedTasksSection({ tasks, config, role, ado }: UnlinkedSectionProps) {
  const unlinked = useMemo(() => tasksWithoutAdoLink(tasks), [tasks]);
  const ignored = new Set(ado.decisions.ignoredUnlinkedTaskIds);
  const open = unlinked.filter((task) => !ignored.has(task.id)).length;

  return (
    <div style={{ marginBottom: 24 }}>
      <div style={SECTION_TITLE}>
        Úkoly bez ADO linku
        {unlinked.length > 0 && <Badge text={`${open}/${unlinked.length}`} tone="muted" />}
      </div>
      {unlinked.length === 0 ? (
        <div style={EMPTY_BOX}>Všechny úkoly mají ADO vazbu</div>
      ) : (
        <div style={PANEL}>
          {unlinked.slice(0, 20).map((task) => (
            <UnlinkedTaskRow
              key={task.id}
              task={task}
              config={config}
              role={role}
              ignored={ignored.has(task.id)}
              commands={ado.commands}
            />
          ))}
        </div>
      )}
    </div>
  );
}
