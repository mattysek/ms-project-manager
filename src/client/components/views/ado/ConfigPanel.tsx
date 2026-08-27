// Konfigurace připojení (FR-ADO-01, 02, 03).
import { useEffect, useState } from 'react';
import type { ADOConfig, Person } from '../../../types';
import type { UseAdoSyncResult } from '../../../hooks/useAdoSync';
import { formatAdoDate } from '../../../utils/adoLinks';
import { TextField } from './primitives';
import { BTN_BLUE, BTN_GHOST, BTN_GREEN, GRID2, LABEL, PANEL, PANEL_HEAD } from './styles';

const DEFAULT_CONFIG: ADOConfig = {
  orgUrl: '',
  project: '',
  areaPath: '',
  trackedWiTypes: ['Product Backlog Item', 'Bug'],
  defaultPushWiType: 'Product Backlog Item',
  defaultIteration: '',
  mdToHoursCoefficient: 8,
  includePATInExport: false,
  memberMapping: [],
};

interface ConfigPanelProps {
  config: ADOConfig | null;
  people: Person[];
  ado: UseAdoSyncResult;
}

/** Mapování osob plánovače na ADO identity (FR-ADO-01, `memberMapping`). */
function MemberMappingTable({
  people,
  config,
  onChange,
}: {
  people: Person[];
  config: ADOConfig;
  onChange: (config: ADOConfig) => void;
}) {
  const setIdentity = (personId: string, identity: string) => {
    const rest = config.memberMapping.filter((m) => m.plannerId !== personId);
    const next = identity
      ? [...rest, { plannerId: personId, adoIdentity: identity, adoDisplayName: null }]
      : rest;
    onChange({ ...config, memberMapping: next });
  };

  return (
    <div style={{ marginBottom: 16 }}>
      {/* Nadpis sekce, ne popisek jednoho pole — každý řádek má vlastní aria-label */}
      <div style={{ ...LABEL, marginBottom: 8 }}>MAPOVÁNÍ ČLENŮ TÝMU NA ADO IDENTITY</div>
      <div style={{ ...PANEL, background: '#0f1117' }}>
        {people.length === 0 && (
          <div style={{ padding: 12, textAlign: 'center', color: '#64748b', fontSize: 11 }}>
            Nejprve přidejte členy týmu v záložce Kapacita
          </div>
        )}
        {people.map((person) => (
          <div
            key={person.id}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              padding: '6px 12px',
              borderTop: '1px solid #1e253366',
            }}
          >
            <span style={{ flex: 1, fontSize: 11, color: '#e2e8f0' }}>{person.name}</span>
            <input
              className="inp"
              aria-label={`ADO identita — ${person.name}`}
              value={config.memberMapping.find((m) => m.plannerId === person.id)?.adoIdentity || ''}
              onChange={(e) => setIdentity(person.id, e.target.value.trim())}
              placeholder="jmeno@firma.cz"
              style={{ flex: 2, fontSize: 11 }}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

/** PAT (FR-ADO-02) — hodnota jde jedním směrem na server, zpět jen `patSet`/`patUpdatedAt`. */
function PatSection({ ado }: { ado: UseAdoSyncResult }) {
  const [pat, setPat] = useState('');
  const { patSet, patUpdatedAt } = ado.patStatus;

  const save = () => {
    if (!pat) return;
    ado.commands.savePat(pat);
    setPat(''); // v paměti klienta nezůstává ani po uložení
  };

  const remove = () => {
    if (window.confirm('Opravdu smazat uložený PAT ze serveru?')) ado.commands.deletePat();
  };

  return (
    <div style={{ marginBottom: 16 }}>
      <TextField
        label="PERSONAL ACCESS TOKEN (scope vso.work_write)"
        value={pat}
        onChange={setPat}
        type="password"
        placeholder="Vložte PAT..."
      />
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
        <button type="button" className="btn" onClick={save} style={BTN_GREEN}>
          Uložit PAT
        </button>
        {patSet && (
          <button type="button" className="btn" onClick={remove} style={BTN_GHOST}>
            Smazat PAT
          </button>
        )}
        <span style={{ fontSize: 10, color: patSet ? '#6ee7b7' : '#f59e0b' }}>
          {patSet && patUpdatedAt
            ? `PAT uložen — poslední aktualizace: ${formatAdoDate(patUpdatedAt)}`
            : 'PAT není nastaven'}
        </span>
      </div>
      <div style={{ marginTop: 8, fontSize: 10, color: '#64748b' }}>
        PAT se ukládá zašifrovaný na serveru a nikdy se nevrací do prohlížeče (ADR-008).
      </div>
    </div>
  );
}

/** Výsledek „Ověřit připojení" — inline, ne popup (FR-ADO-03). */
function ConnectionResult({ result }: { result: { ok: boolean; message: string } | null }) {
  if (!result) return null;
  return (
    <div
      role="status"
      style={{
        padding: '8px 12px',
        marginBottom: 16,
        borderRadius: 6,
        fontSize: 11,
        background: result.ok ? '#0d2210' : '#2a1010',
        border: `1px solid ${result.ok ? '#34d39966' : '#f8717166'}`,
        color: result.ok ? '#6ee7b7' : '#fca5a5',
      }}
    >
      {result.message}
    </div>
  );
}

function ConfigFields({
  config,
  onChange,
}: {
  config: ADOConfig;
  onChange: (config: ADOConfig) => void;
}) {
  const set = (fields: Partial<ADOConfig>) => onChange({ ...config, ...fields });
  return (
    <div style={{ ...GRID2, marginBottom: 16 }}>
      <TextField
        label="ORGANIZATION URL"
        value={config.orgUrl}
        onChange={(orgUrl) => set({ orgUrl })}
        placeholder="https://dev.azure.com/moje-org"
      />
      <TextField
        label="PROJECT NAME"
        value={config.project}
        onChange={(project) => set({ project })}
        placeholder="NPEZ"
      />
      <TextField
        label="AREA PATH (pro Coverage gap)"
        value={config.areaPath}
        onChange={(areaPath) => set({ areaPath })}
        placeholder="NPEZ\RP04"
      />
      <TextField
        label="ITERACE (pro Sync i Push)"
        value={config.defaultIteration}
        onChange={(defaultIteration) => set({ defaultIteration })}
        placeholder="NPEZ\Sprint 42"
      />
      <TextField
        label="SLEDOVANÉ TYPY WI (čárkou oddělené)"
        value={config.trackedWiTypes.join(', ')}
        onChange={(value) =>
          set({
            trackedWiTypes: value
              .split(',')
              .map((s) => s.trim())
              .filter(Boolean),
          })
        }
        placeholder="Product Backlog Item, Bug"
      />
      <TextField
        label="TYP WI PRO PUSH"
        value={config.defaultPushWiType}
        onChange={(defaultPushWiType) => set({ defaultPushWiType })}
        placeholder="Product Backlog Item"
      />
      <TextField
        label="1 MD = N HODIN"
        value={String(config.mdToHoursCoefficient)}
        onChange={(value) => set({ mdToHoursCoefficient: Number.parseFloat(value) || 0 })}
        placeholder="8"
      />
    </div>
  );
}

export function ConfigPanel({ config, people, ado }: ConfigPanelProps) {
  const [expanded, setExpanded] = useState(!config?.orgUrl);
  const [draft, setDraft] = useState<ADOConfig>(config || DEFAULT_CONFIG);
  const [saved, setSaved] = useState(false);

  // Konfigurace je sdílená — mohl ji mezitím změnit jiný PM (nebo dorazila až
  // po namontování view), takže rozpracovaný formulář jde za serverem.
  useEffect(() => {
    if (config) setDraft(config);
  }, [config]);

  const change = (next: ADOConfig) => {
    setDraft(next);
    setSaved(false);
  };
  const save = () => {
    ado.commands.saveConfig(draft);
    setSaved(true);
  };

  return (
    <div style={{ ...PANEL, marginBottom: 16 }}>
      <button
        type="button"
        style={{ ...PANEL_HEAD, width: '100%', border: 'none', font: 'inherit', textAlign: 'left' }}
        onClick={() => setExpanded(!expanded)}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 11 }}>{expanded ? '▼' : '▶'}</span>
          <span style={{ fontSize: 11, fontWeight: 600, color: '#f1f5f9' }}>
            Nastavení připojení
          </span>
        </div>
      </button>
      {expanded && (
        <div style={{ padding: 16, background: '#0c1018' }}>
          <ConfigFields config={draft} onChange={change} />
          <PatSection ado={ado} />
          <MemberMappingTable people={people} config={draft} onChange={change} />
          <ConnectionResult result={ado.connectionTest} />
          {saved && (
            <div style={{ fontSize: 11, color: '#6ee7b7', marginBottom: 12 }}>
              Konfigurace uložena
            </div>
          )}
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              className="btn"
              onClick={() => ado.commands.testConnection()}
              style={BTN_BLUE}
            >
              Ověřit připojení
            </button>
            <button type="button" className="btn" onClick={save} style={BTN_GREEN}>
              Uložit nastavení
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
