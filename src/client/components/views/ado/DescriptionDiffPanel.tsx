// Merge editor popisu (FR-ADO-06, 07).
import { useMemo, useState } from 'react';
import type { WIChange } from '../../../types';
import type { AdoSyncCommands } from '../../../hooks/useAdoSync';
import type { DiffBlock, Side } from './textDiff';
import { computeDiffBlocks, mergeText } from './textDiff';
import { BTN_BLUE, BTN_GHOST, BTN_GREEN, LABEL, PANEL, SUB_PANEL } from './styles';

function DiffColumn({
  lines,
  active,
  tone,
}: {
  lines: string[];
  active: boolean;
  tone: 'planner' | 'ado';
}) {
  const palette =
    tone === 'planner'
      ? { on: '#2a1d2a', off: '#1a1520', tx: '#e9d5ff' }
      : { on: '#1d2a3b', off: '#151a20', tx: '#bfdbfe' };
  return (
    <div
      style={{
        background: active ? palette.on : palette.off,
        padding: '4px 8px',
        userSelect: 'text',
      }}
    >
      {lines.length === 0 ? (
        <div style={{ color: '#475569', fontStyle: 'italic' }}>(prázdné)</div>
      ) : (
        lines.map((line, index) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: řádky diffu nemají vlastní identitu
          <div key={index} style={{ color: palette.tx, minHeight: 18 }}>
            {line || ' '}
          </div>
        ))
      )}
    </div>
  );
}

function ConflictBlock({
  block,
  selected,
  onSelect,
}: {
  block: DiffBlock;
  selected?: Side;
  onSelect: (side: Side) => void;
}) {
  const button = (side: Side, label: string) => (
    <button
      type="button"
      className="btn"
      onClick={() => onSelect(side)}
      style={{
        ...BTN_GHOST,
        color: selected === side ? '#f1f5f9' : '#64748b',
        fontSize: 9,
        padding: '2px 8px',
      }}
    >
      {label}
    </button>
  );
  return (
    <div style={{ borderTop: '1px solid #1e2533', borderBottom: '1px solid #1e2533' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '6px 8px',
          background: '#161b27',
        }}
      >
        <span style={{ fontSize: 9, color: '#64748b', textTransform: 'uppercase' }}>
          Konflikt #{block.id + 1}
        </span>
        <div style={{ flex: 1 }} />
        {button('left', '← Plánovač')}
        {button('right', 'ADO →')}
        {button('both', 'Obě')}
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          fontSize: 11,
          fontFamily: 'monospace',
        }}
      >
        <DiffColumn
          lines={block.leftLines}
          active={selected === 'left' || selected === 'both'}
          tone="planner"
        />
        <DiffColumn
          lines={block.rightLines}
          active={selected === 'right' || selected === 'both'}
          tone="ado"
        />
      </div>
    </div>
  );
}

interface DescriptionDiffPanelProps {
  change: WIChange;
  plannerDesc: string;
  adoDesc: string;
  commands: AdoSyncCommands;
  onClose: () => void;
}

export function DescriptionDiffPanel({
  change,
  plannerDesc,
  adoDesc,
  commands,
  onClose,
}: DescriptionDiffPanelProps) {
  const blocks = useMemo(() => computeDiffBlocks(plannerDesc, adoDesc), [plannerDesc, adoDesc]);
  // Výchozí volba je „obě" — merge editor tak startuje s oběma texty spojenými
  // (FR-ADO-07, „Merge popisů obousměrně") a uživatel jen odebírá, co nechce.
  const [selections, setSelections] = useState<Record<number, Side | undefined>>(() =>
    Object.fromEntries(blocks.filter((b) => b.type === 'conflict').map((b) => [b.id, 'both']))
  );
  const [edited, setEdited] = useState<string | null>(null);
  const computed = useMemo(() => mergeText(blocks, selections), [blocks, selections]);
  const text = edited ?? computed;
  const args = { wiId: change.wiId, taskId: change.taskId };

  return (
    <div style={SUB_PANEL}>
      <div style={{ fontSize: 10, color: '#64748b', marginBottom: 8, textTransform: 'uppercase' }}>
        Merge editor — vlevo plánovač, vpravo ADO
      </div>
      <div style={{ ...PANEL, marginBottom: 12 }}>
        {blocks.map((block) =>
          block.type === 'same' ? (
            <div
              key={block.id}
              style={{
                background: '#0c1018',
                padding: '4px 8px',
                fontFamily: 'monospace',
                fontSize: 11,
                color: '#94a3b8',
              }}
            >
              {block.leftLines.join('\n') || ' '}
            </div>
          ) : (
            <ConflictBlock
              key={block.id}
              block={block}
              selected={selections[block.id]}
              onSelect={(side) =>
                setSelections((prev) => ({
                  ...prev,
                  [block.id]: prev[block.id] === side ? undefined : side,
                }))
              }
            />
          )
        )}
      </div>
      <label style={LABEL} htmlFor={`merge-${change.wiId}`}>
        Výsledek merge
      </label>
      <textarea
        id={`merge-${change.wiId}`}
        className="inp"
        value={text}
        onChange={(e) => setEdited(e.target.value)}
        style={{ width: '100%', minHeight: 120, fontFamily: "'IBM Plex Mono', monospace" }}
      />
      <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
        <button
          type="button"
          className="btn"
          onClick={() => commands.acceptFromAdo({ ...args, field: 'description', text })}
          style={BTN_BLUE}
        >
          ← Přijmout z ADO
        </button>
        <button
          type="button"
          className="btn"
          onClick={() => commands.pushDescription({ ...args, text, alsoPlanner: false })}
          style={BTN_BLUE}
        >
          → Synchronizovat do ADO
        </button>
        <button
          type="button"
          className="btn"
          onClick={() => commands.pushDescription({ ...args, text, alsoPlanner: true })}
          style={BTN_GREEN}
        >
          ↔ Uložit merge (obousměrně)
        </button>
        <button type="button" className="btn" onClick={onClose} style={BTN_GHOST}>
          Zavřít
        </button>
      </div>
    </div>
  );
}
