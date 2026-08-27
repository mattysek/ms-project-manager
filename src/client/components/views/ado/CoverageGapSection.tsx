// Coverage gap (FR-ADO-09) — práce v ADO bez pokrytí v plánu.
import { useState } from 'react';
import type { ADOWorkItemView } from '../../../types';
import type { AdoSyncCommands, UseAdoSyncResult } from '../../../hooks/useAdoSync';
import { AddToPlanForm } from './AddToPlanForm';
import { AdoDetailPanel } from './AdoDetailPanel';
import { Badge } from './primitives';
import { BTN_BLUE, BTN_GHOST, BTN_GREEN, EMPTY_BOX, PANEL, SECTION_TITLE } from './styles';
import type { GapContext } from './types';

interface GapRowProps {
  wi: ADOWorkItemView;
  ctx: GapContext;
  commands: AdoSyncCommands;
  onResolved: () => void;
}

function GapRow({ wi, ctx, commands, onResolved }: GapRowProps) {
  const [open, setOpen] = useState<'none' | 'form' | 'detail'>('none');

  return (
    <div style={{ padding: 12, borderBottom: '1px solid #1e253366' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <span style={{ fontSize: 14 }}>{wi.workItemType === 'Bug' ? '🔴' : '🟡'}</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 12, color: '#f1f5f9', marginBottom: 4 }}>
            <span style={{ color: '#64748b' }}>{wi.workItemType}</span> #{wi.id} {wi.title}
          </div>
          <div style={{ fontSize: 10, color: '#64748b', display: 'flex', gap: 12 }}>
            {wi.assignedTo && <span>Přiřazen: {wi.assignedTo}</span>}
            {wi.remainingWork !== undefined && <span>Remaining: {wi.remainingWork}h</span>}
            {wi.iterationPath && <span>Iterace: {wi.iterationPath}</span>}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button
            type="button"
            className="btn"
            onClick={() => setOpen(open === 'form' ? 'none' : 'form')}
            style={BTN_GREEN}
          >
            {open === 'form' ? 'Zrušit' : 'Přidat do plánu'}
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => setOpen(open === 'detail' ? 'none' : 'detail')}
            style={BTN_BLUE}
          >
            {open === 'detail' ? 'Zavřít' : 'Zobrazit ADO'}
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => commands.ignoreGap(wi.id, true)}
            style={BTN_GHOST}
          >
            Ignorovat
          </button>
        </div>
      </div>
      {open === 'detail' && (
        <AdoDetailPanel wi={wi} config={ctx.config} onClose={() => setOpen('none')} />
      )}
      {open === 'form' && (
        <AddToPlanForm
          wi={wi}
          ctx={ctx}
          commands={commands}
          onDone={(result) => {
            setOpen('none');
            if (result === 'resolved') onResolved();
          }}
        />
      )}
    </div>
  );
}

export function CoverageGapSection({
  ado,
  ctx,
}: {
  ado: UseAdoSyncResult;
  ctx: GapContext | null;
}) {
  // Work item přidaný do plánu (nebo propojený s úkolem) už gap není, ale ve
  // výsledku posledního syncu zůstává — server ho odfiltruje až při příštím
  // běhu. Do té doby si ho odfiltruje view samo (FR-ADO-09).
  const [resolved, setResolved] = useState<number[]>([]);
  const gaps = ado.visibleGaps.filter((wi) => !resolved.includes(wi.id));

  return (
    <div style={{ marginBottom: 24 }}>
      <div style={SECTION_TITLE}>
        Coverage gap — práce v ADO bez pokrytí v plánu
        {gaps.length > 0 && <Badge text={`${gaps.length} nových`} tone="alert" />}
      </div>
      {gaps.length === 0 || !ctx ? (
        <div style={EMPTY_BOX}>Zatím žádná synchronizace nebo vše pokryto</div>
      ) : (
        <div style={PANEL}>
          {gaps.map((wi) => (
            <GapRow
              key={wi.id}
              wi={wi}
              ctx={ctx}
              commands={ado.commands}
              onResolved={() => setResolved((prev) => [...prev, wi.id])}
            />
          ))}
        </div>
      )}
    </div>
  );
}
