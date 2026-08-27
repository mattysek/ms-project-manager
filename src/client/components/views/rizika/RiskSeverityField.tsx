import type { Severity } from '../../../types';
import { SEV_CFG } from '../../../constants';

interface RiskSeverityFieldProps {
  sev: Severity;
  isEditing: boolean;
  onChange: (sev: Severity) => void;
}

/** Závažnost rizika — v needitujícím stavu barevný štítek, v editaci select. */
export function RiskSeverityField({ sev, isEditing, onChange }: RiskSeverityFieldProps) {
  const c = SEV_CFG[sev];
  if (!isEditing) {
    return (
      <span
        style={{
          padding: '2px 8px',
          background: `${c.bd}33`,
          border: `1px solid ${c.bd}88`,
          borderRadius: 12,
          color: c.tx,
          fontSize: 9,
          fontWeight: 700,
          flexShrink: 0,
        }}
      >
        {c.label}
      </span>
    );
  }
  return (
    <select
      aria-label="Závažnost rizika"
      value={sev}
      onChange={(e) => onChange(e.target.value as Severity)}
      style={{
        background: '#0c1018',
        border: `1px solid ${c.bd}`,
        borderRadius: 4,
        color: c.tx,
        fontSize: 9,
        padding: '2px 6px',
        fontFamily: 'inherit',
        cursor: 'pointer',
      }}
    >
      {Object.entries(SEV_CFG).map(([k, v]) => (
        <option key={k} value={k}>
          {v.label}
        </option>
      ))}
    </select>
  );
}
