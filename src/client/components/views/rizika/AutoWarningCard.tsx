import type { Severity } from '../../../types';
import { SEV_CFG } from '../../../constants';

// Auto-warning type — varování odvozená z aktuálního plánu (přetížení, kritická cesta), ne ruční záznam.
export interface AutoWarning {
  type: 'overallocation' | 'critical-path';
  severity: Severity;
  title: string;
  detail: string;
}

export function AutoWarningCard({ w }: { w: AutoWarning }) {
  const c = SEV_CFG[w.severity];
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
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: 8,
          marginBottom: 6,
        }}
      >
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
        <span
          style={{
            padding: '2px 8px',
            background: '#4f9cf922',
            border: '1px solid #4f9cf944',
            borderRadius: 12,
            color: '#93c5fd',
            fontSize: 9,
            fontWeight: 500,
          }}
        >
          AUTO
        </span>
      </div>
      <div
        style={{
          fontSize: 12,
          fontWeight: 600,
          color: '#f1f5f9',
          marginBottom: 5,
        }}
      >
        {w.title}
      </div>
      <div style={{ fontSize: 11, color: '#94a3b8', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
        {w.detail}
      </div>
    </div>
  );
}
