// Změny na navázaných WI (FR-ADO-05 až 07).
import { useMemo, useState } from 'react';
import type { ADOConfig, ADOWorkItemView, Task, WIChange } from '../../../types';
import type { AdoSyncCommands, UseAdoSyncResult } from '../../../hooks/useAdoSync';
import { defaultResolvedState, severityBadge } from '../../../utils/adoLinks';
import { AdoDetailPanel } from './AdoDetailPanel';
import { DescriptionDiffPanel } from './DescriptionDiffPanel';
import { Badge } from './primitives';
import { BTN_BLUE, BTN_GHOST, BTN_GREEN, EMPTY_BOX, PANEL, SECTION_TITLE } from './styles';

interface ChangeActionsProps {
  change: WIChange;
  wi?: ADOWorkItemView;
  commands: AdoSyncCommands;
}

/** Uzavření WI z plánovače — cílový stav závisí na procesní šabloně, proto pole. */
function CloseInAdoAction({ change, wi, commands }: ChangeActionsProps) {
  const [state, setState] = useState(defaultResolvedState(wi?.workItemType || ''));
  return (
    <>
      <input
        className="inp"
        aria-label={`Cílový stav v ADO — WI #${change.wiId}`}
        value={state}
        onChange={(e) => setState(e.target.value)}
        style={{ width: 90, fontSize: 10 }}
      />
      <button
        type="button"
        className="btn"
        onClick={() => commands.pushState(change.wiId, change.taskId, state)}
        style={BTN_BLUE}
      >
        Uzavřít v ADO →
      </button>
    </>
  );
}

function ChangeActions({ change, wi, commands }: ChangeActionsProps) {
  const accept = (field: 'state' | 'assignee') =>
    commands.acceptFromAdo({ wiId: change.wiId, taskId: change.taskId, field });

  switch (change.type) {
    case 'state_regression':
    case 'state_resolved':
      return (
        <button type="button" className="btn" onClick={() => accept('state')} style={BTN_GREEN}>
          Přijmout — aktualizovat progress
        </button>
      );
    case 'assignee_change':
      return (
        <button type="button" className="btn" onClick={() => accept('assignee')} style={BTN_GREEN}>
          ← Přijmout z ADO
        </button>
      );
    case 'planner_assignment_differs':
      return (
        <>
          <button
            type="button"
            className="btn"
            onClick={() => commands.pushAssignee(change.wiId, change.taskId)}
            style={BTN_BLUE}
          >
            Synchronizovat do ADO →
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => accept('assignee')}
            style={BTN_GREEN}
          >
            ← Přijmout z ADO
          </button>
        </>
      );
    case 'planner_completed_not_ado':
      return <CloseInAdoAction change={change} wi={wi} commands={commands} />;
    default:
      return null;
  }
}

interface ChangeRowProps {
  change: WIChange;
  wi?: ADOWorkItemView;
  plannerDesc: string;
  commands: AdoSyncCommands;
  config: ADOConfig | null;
}

function ChangeRow({ change, wi, plannerDesc, commands, config }: ChangeRowProps) {
  const [panel, setPanel] = useState<'none' | 'diff' | 'detail'>('none');
  const style = severityBadge(change.severity);
  // U změny popisu se rozbaluje merge editor, u ostatních jen náhled z ADO.
  const isDesc = change.type === 'description_change';
  const detail = isDesc ? 'diff' : 'detail';
  const detailLabel = isDesc ? 'Zobrazit diff' : 'Zobrazit ADO';

  return (
    <div style={{ padding: 12, borderBottom: '1px solid #1e253366', background: style.bg }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <span style={{ fontSize: 14 }}>{style.icon}</span>
        <div style={{ flex: 1 }}>
          <div
            style={{
              fontSize: 12,
              color: '#f1f5f9',
              marginBottom: 4,
              display: 'flex',
              gap: 8,
              flexWrap: 'wrap',
            }}
          >
            {change.taskName} → WI #{change.wiId} {change.wiTitle}
            {change.direction === 'planner_to_ado' && <Badge text="Planner → ADO" tone="muted" />}
          </div>
          <div style={{ fontSize: 11, color: style.tx }}>{change.details}</div>
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          <ChangeActions change={change} wi={wi} commands={commands} />
          <button
            type="button"
            className="btn"
            onClick={() => setPanel(panel === 'none' ? detail : 'none')}
            style={BTN_BLUE}
          >
            {panel === 'none' ? detailLabel : 'Zavřít'}
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => commands.acknowledgeChange(change.wiId, change.type, true)}
            style={BTN_GHOST}
          >
            Potvrdit (Acknowledge)
          </button>
        </div>
      </div>
      {panel === 'diff' && (
        <DescriptionDiffPanel
          change={change}
          plannerDesc={plannerDesc}
          adoDesc={wi?.descriptionMd || ''}
          commands={commands}
          onClose={() => setPanel('none')}
        />
      )}
      {panel === 'detail' && (
        <AdoDetailPanel wi={wi} config={config} onClose={() => setPanel('none')} />
      )}
    </div>
  );
}

export function ChangesSection({
  ado,
  tasks,
  config,
}: {
  ado: UseAdoSyncResult;
  tasks: Task[];
  config: ADOConfig | null;
}) {
  const changes = ado.visibleChanges;
  const workItems = useMemo(
    () => new Map((ado.result?.workItems || []).map((wi) => [wi.id, wi])),
    [ado.result]
  );

  return (
    <div style={{ marginBottom: 24 }}>
      <div style={SECTION_TITLE}>
        Změny na navázaných WI
        {changes.length > 0 && <Badge text={`${changes.length} nových`} tone="warn" />}
      </div>
      {changes.length === 0 ? (
        <div style={EMPTY_BOX}>Zatím žádná synchronizace nebo žádné změny</div>
      ) : (
        <div style={PANEL}>
          {changes.map((change) => (
            <ChangeRow
              key={`${change.wiId}-${change.type}`}
              change={change}
              wi={workItems.get(change.wiId)}
              plannerDesc={tasks.find((t) => t.id === change.taskId)?.desc || ''}
              commands={ado.commands}
              config={config}
            />
          ))}
        </div>
      )}
    </div>
  );
}
