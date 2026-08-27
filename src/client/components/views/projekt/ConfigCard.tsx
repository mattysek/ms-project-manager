// Základní nastavení projektu — název, datum od/do, budget v MD.
import type { ChangelogEntry, Project } from '../../../types';

interface ConfigCardProps {
  project: Project;
  updateProject: (field: keyof Project, val: string | number | ChangelogEntry[]) => void;
  /** Změna dat přepočítává týdny a ořezává úkoly — proto vlastní setter, ne `updateProject`. */
  changeDates: (field: 'startDate' | 'endDate', val: string) => void;
  numWeeks: number;
  totalWorkdays: number;
  /**
   * Smí přihlášený uživatel měnit metadata projektu? Jen PM (ADR-006,
   * `role-permissions.feature`: „Dev nemůže editovat metadata projektu").
   *
   * Vynucuje to server, tohle je UX — ale bez něj UI lhalo: Dev mohl do polí
   * psát a změna se tiše odrolovala zpátky, až když ji server odmítl.
   */
  editable: boolean;
}

/** Tooltip u polí, do kterých Dev psát nesmí. */
export const READ_ONLY_HINT = 'Metadata projektu může měnit pouze Project Manager';

const LABEL_STYLE: React.CSSProperties = {
  fontSize: 10,
  color: '#64748b',
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
};

const FIXED_LABEL_STYLE: React.CSSProperties = { ...LABEL_STYLE, width: 100, flexShrink: 0 };

function CardHeader() {
  return (
    <div
      style={{
        background: '#161b27',
        padding: '10px 16px',
        borderBottom: '1px solid #1e2533',
        fontSize: 10,
        color: '#64748b',
        letterSpacing: '0.1em',
        textTransform: 'uppercase',
      }}
    >
      Základní nastavení
    </div>
  );
}

function DateRow({
  project,
  changeDates,
  numWeeks,
  totalWorkdays,
  editable,
}: Pick<ConfigCardProps, 'project' | 'changeDates' | 'numWeeks' | 'totalWorkdays' | 'editable'>) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
      <label htmlFor="projekt-zacatek" style={FIXED_LABEL_STYLE}>
        Začátek
      </label>
      <input
        id="projekt-zacatek"
        type="date"
        className="inp"
        value={project.startDate}
        min="2024-01-01"
        max="2050-12-31"
        readOnly={!editable}
        title={editable ? undefined : READ_ONLY_HINT}
        onChange={(e) => editable && changeDates('startDate', e.target.value)}
        style={{ width: 140, color: '#e2e8f0' }}
      />
      <label htmlFor="projekt-konec" style={LABEL_STYLE}>
        Konec
      </label>
      <input
        id="projekt-konec"
        type="date"
        className="inp"
        value={project.endDate}
        min="2024-01-01"
        max="2050-12-31"
        readOnly={!editable}
        title={editable ? undefined : READ_ONLY_HINT}
        onChange={(e) => editable && changeDates('endDate', e.target.value)}
        style={{ width: 140, color: '#e2e8f0' }}
      />
      <div style={{ fontSize: 10, color: '#475569', marginLeft: 4 }}>
        → <span style={{ color: '#f1f5f9', fontWeight: 700 }}>{numWeeks}</span> týdnů ·&nbsp;
        <span style={{ color: '#f1f5f9', fontWeight: 700 }}>{totalWorkdays}</span> pracovních dní
      </div>
    </div>
  );
}

export function ConfigCard({
  project,
  updateProject,
  changeDates,
  numWeeks,
  totalWorkdays,
  editable,
}: ConfigCardProps) {
  return (
    <div
      style={{
        border: '1px solid #1e2533',
        borderRadius: 10,
        overflow: 'hidden',
        marginBottom: 22,
      }}
    >
      <CardHeader />
      <div style={{ padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <label htmlFor="projekt-nazev" style={FIXED_LABEL_STYLE}>
            Název
          </label>
          <input
            id="projekt-nazev"
            className="inp"
            value={project.name}
            readOnly={!editable}
            title={editable ? undefined : READ_ONLY_HINT}
            onChange={(e) => editable && updateProject('name', e.target.value)}
            style={{ flex: 1, fontSize: 12, fontWeight: 600, color: '#4f9cf9' }}
          />
        </div>
        <DateRow
          project={project}
          changeDates={changeDates}
          editable={editable}
          numWeeks={numWeeks}
          totalWorkdays={totalWorkdays}
        />
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <label htmlFor="projekt-budget" style={FIXED_LABEL_STYLE}>
            Budget (MD)
          </label>
          <input
            id="projekt-budget"
            type="number"
            min="1"
            max="9999"
            className="inp"
            value={project.budget}
            readOnly={!editable}
            title={editable ? undefined : READ_ONLY_HINT}
            onChange={(e) =>
              editable && updateProject('budget', Number(e.target.value) || project.budget)
            }
            style={{
              width: 100,
              textAlign: 'right',
              color: '#fcd34d',
              fontWeight: 700,
              fontSize: 14,
            }}
          />
          <span style={{ fontSize: 10, color: '#475569' }}>man-days celkem</span>
        </div>
      </div>
    </div>
  );
}
