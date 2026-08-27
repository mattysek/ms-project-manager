// Formulář „Přidat do plánu" pro coverage gap (FR-ADO-09).
import { useState } from 'react';
import type { ADOWorkItemView } from '../../../types';
import type { AdoSyncCommands } from '../../../hooks/useAdoSync';
import { uid } from '../../../utils';
import { buildWiUrl, hoursToMd } from '../../../utils/adoLinks';
import { TextField } from './primitives';
import { BTN_GHOST, BTN_GREEN, GRID2, LABEL, SUB_PANEL } from './styles';
import type { GapContext } from './types';

export interface AddToPlanFormProps {
  wi: ADOWorkItemView;
  ctx: GapContext;
  commands: AdoSyncCommands;
  /** `resolved` = work item byl založen/propojen, `cancel` = jen zavřít formulář. */
  onDone: (result: 'resolved' | 'cancel') => void;
}

/** Stav a odeslání formuláře „Přidat do plánu" — oddělené od JSX, ať zůstane komponenta krátká. */
function useAddToPlanForm({ wi, ctx, commands, onDone }: AddToPlanFormProps) {
  const mapped = ctx.config.memberMapping.find(
    (m) => m.adoIdentity && m.adoIdentity.toLowerCase() === (wi.assignedToEmail || '').toLowerCase()
  );
  const [mode, setMode] = useState<'new' | 'link'>('new');
  const [name, setName] = useState(wi.title);
  const [personId, setPersonId] = useState(mapped?.plannerId || '');
  const [catKey, setCatKey] = useState(Object.keys(ctx.cats)[0] || '');
  const [startWeek, setStartWeek] = useState(0);
  const [endWeek, setEndWeek] = useState(0);
  const [md, setMd] = useState(
    wi.remainingWork ? hoursToMd(wi.remainingWork, ctx.config.mdToHoursCoefficient) : 1
  );
  const [linkTaskId, setLinkTaskId] = useState('');

  const submit = () => {
    if (mode === 'link') {
      if (!linkTaskId) return;
      commands.linkGapToTask(wi.id, linkTaskId);
    } else {
      commands.addGapToPlan(wi.id, {
        id: uid(),
        p: personId,
        name,
        cat: catKey,
        s: startWeek,
        e: endWeek,
        md,
        progress: 0,
        desc: wi.descriptionMd,
        links: [{ id: uid(), label: `WI #${wi.id}`, url: buildWiUrl(ctx.config, wi.id) }],
      });
    }
    onDone('resolved');
  };

  return {
    mode,
    setMode,
    name,
    setName,
    personId,
    setPersonId,
    catKey,
    setCatKey,
    startWeek,
    setStartWeek,
    endWeek,
    setEndWeek,
    md,
    setMd,
    linkTaskId,
    setLinkTaskId,
    submit,
  };
}

type AddToPlanFormState = ReturnType<typeof useAddToPlanForm>;

function ModeToggle({ mode, setMode }: Pick<AddToPlanFormState, 'mode' | 'setMode'>) {
  return (
    <div style={{ display: 'flex', gap: 12, marginBottom: 12, fontSize: 11, color: '#94a3b8' }}>
      <label>
        <input type="radio" checked={mode === 'new'} onChange={() => setMode('new')} /> Vytvořit
        nový úkol
      </label>
      <label>
        <input type="radio" checked={mode === 'link'} onChange={() => setMode('link')} /> Propojit s
        existujícím
      </label>
    </div>
  );
}

function NewTaskFields({
  wi,
  ctx,
  form,
}: {
  wi: ADOWorkItemView;
  ctx: GapContext;
  form: AddToPlanFormState;
}) {
  return (
    <div style={GRID2}>
      <TextField label="Název" value={form.name} onChange={form.setName} />
      <div>
        <label style={LABEL} htmlFor={`gap-person-${wi.id}`}>
          Osoba
        </label>
        <select
          id={`gap-person-${wi.id}`}
          className="inp"
          value={form.personId}
          onChange={(e) => form.setPersonId(e.target.value)}
          style={{ width: '100%' }}
        >
          <option value="">— Backlog —</option>
          {ctx.people.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label style={LABEL} htmlFor={`gap-cat-${wi.id}`}>
          Kategorie
        </label>
        <select
          id={`gap-cat-${wi.id}`}
          className="inp"
          value={form.catKey}
          onChange={(e) => form.setCatKey(e.target.value)}
          style={{ width: '100%' }}
        >
          {Object.entries(ctx.cats).map(([key, cat]) => (
            <option key={key} value={key}>
              {cat.label}
            </option>
          ))}
        </select>
      </div>
      <TextField
        label="MD"
        value={String(form.md)}
        onChange={(value) => form.setMd(Number.parseFloat(value) || 0)}
      />
      <TextField
        label="Týden od"
        value={String(form.startWeek + 1)}
        onChange={(value) => form.setStartWeek(clampWeek(value, ctx.numWeeks))}
      />
      <TextField
        label="Týden do"
        value={String(form.endWeek + 1)}
        onChange={(value) => form.setEndWeek(clampWeek(value, ctx.numWeeks))}
      />
    </div>
  );
}

function LinkExistingField({
  wi,
  ctx,
  form,
}: {
  wi: ADOWorkItemView;
  ctx: GapContext;
  form: AddToPlanFormState;
}) {
  return (
    <div>
      <label style={LABEL} htmlFor={`gap-task-${wi.id}`}>
        Vybrat úkol
      </label>
      <select
        id={`gap-task-${wi.id}`}
        className="inp"
        value={form.linkTaskId}
        onChange={(e) => form.setLinkTaskId(e.target.value)}
        style={{ width: '100%' }}
      >
        <option value="">— Vyberte úkol —</option>
        {ctx.tasks.map((task) => (
          <option key={task.id} value={task.id}>
            {task.name}
          </option>
        ))}
      </select>
    </div>
  );
}

export function AddToPlanForm({ wi, ctx, commands, onDone }: AddToPlanFormProps) {
  const form = useAddToPlanForm({ wi, ctx, commands, onDone });

  return (
    <div style={SUB_PANEL}>
      <ModeToggle mode={form.mode} setMode={form.setMode} />
      {form.mode === 'new' ? (
        <NewTaskFields wi={wi} ctx={ctx} form={form} />
      ) : (
        <LinkExistingField wi={wi} ctx={ctx} form={form} />
      )}
      <div style={{ display: 'flex', gap: 8, marginTop: 12, justifyContent: 'flex-end' }}>
        <button type="button" className="btn" onClick={form.submit} style={BTN_GREEN}>
          {form.mode === 'new' ? 'Přidat úkol' : 'Propojit'}
        </button>
        <button type="button" className="btn" onClick={() => onDone('cancel')} style={BTN_GHOST}>
          Zrušit
        </button>
      </div>
    </div>
  );
}

export function clampWeek(value: string, numWeeks: number): number {
  const parsed = Number.parseInt(value, 10) - 1;
  if (Number.isNaN(parsed)) return 0;
  return Math.min(Math.max(parsed, 0), Math.max(numWeeks - 1, 0));
}
