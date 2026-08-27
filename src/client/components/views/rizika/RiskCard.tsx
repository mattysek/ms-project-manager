import type { Risk } from '../../../types';
import { SEV_CFG } from '../../../constants';
import { RiskCardBody } from './RiskCardBody';
import { RiskCardHeader } from './RiskCardHeader';

interface RiskCardProps {
  r: Risk;
  isEditing: boolean;
  /** Právě přidané, ještě nepotvrzené riziko — dokončovací tlačítko píše "Přidat", ne "Uložit". */
  isNew: boolean;
  /** PM smí editovat/mazat rizika, Dev jen číst (PRD-03 FR-ROLE-01) — ikony pro Dev úplně chybí. */
  canWrite: boolean;
  onUpdate: (id: string, field: keyof Risk, value: string) => void;
  onDelete: (id: string) => void;
  onToggleEdit: (id: string | null) => void;
}

export function RiskCard(props: RiskCardProps) {
  const { r, isEditing } = props;
  const c = SEV_CFG[r.sev];
  return (
    <div
      style={{
        background: c.bg,
        border: `1px solid ${c.bd}55`,
        borderRadius: 8,
        padding: '14px 16px',
        marginBottom: 8,
      }}
    >
      <RiskCardHeader {...props} />
      <RiskCardBody r={r} isEditing={isEditing} onUpdate={props.onUpdate} />
    </div>
  );
}
