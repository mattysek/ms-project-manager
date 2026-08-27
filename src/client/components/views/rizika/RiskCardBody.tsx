import type { Risk } from '../../../types';

interface RiskCardBodyProps {
  r: Risk;
  isEditing: boolean;
  onUpdate: (id: string, field: keyof Risk, value: string) => void;
}

/** Název a detail rizika — v editaci vstupní pole, jinak prostý text. */
export function RiskCardBody({ r, isEditing, onUpdate }: RiskCardBodyProps) {
  if (isEditing) {
    return (
      <>
        <input
          className="inp"
          aria-label="Název rizika"
          value={r.title}
          onChange={(e) => onUpdate(r.id, 'title', e.target.value)}
          style={{ width: '100%', marginBottom: 6, fontWeight: 600 }}
          // biome-ignore lint/a11y/noAutofocus: uživatel právě přepnul do editace jediné karty
          autoFocus
        />
        <textarea
          className="inp"
          aria-label="Detail rizika"
          value={r.detail}
          onChange={(e) => onUpdate(r.id, 'detail', e.target.value)}
          style={{ width: '100%' }}
        />
      </>
    );
  }
  return (
    <>
      <div style={{ fontSize: 12, fontWeight: 600, color: '#f1f5f9', marginBottom: 5 }}>
        {r.title}
      </div>
      <div style={{ fontSize: 11, color: '#64748b', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
        {r.detail}
      </div>
    </>
  );
}
