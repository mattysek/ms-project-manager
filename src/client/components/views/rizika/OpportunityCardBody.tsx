import type { Opportunity } from '../../../types';

interface OpportunityCardBodyProps {
  o: Opportunity;
  isEditing: boolean;
  onUpdate: (id: string, field: keyof Opportunity, value: string) => void;
}

/** Název a detail příležitosti — v editaci vstupní pole, jinak prostý text. */
export function OpportunityCardBody({ o, isEditing, onUpdate }: OpportunityCardBodyProps) {
  if (isEditing) {
    return (
      <>
        <input
          className="inp"
          aria-label="Název příležitosti"
          value={o.title}
          onChange={(e) => onUpdate(o.id, 'title', e.target.value)}
          style={{
            width: '100%',
            marginBottom: 6,
            fontWeight: 600,
            borderColor: '#22c55e44',
          }}
          // biome-ignore lint/a11y/noAutofocus: uživatel právě přepnul do editace jediné karty
          autoFocus
        />
        <textarea
          className="inp"
          aria-label="Detail příležitosti"
          value={o.detail}
          onChange={(e) => onUpdate(o.id, 'detail', e.target.value)}
          style={{ width: '100%', borderColor: '#22c55e44' }}
        />
      </>
    );
  }
  return (
    <>
      <div style={{ fontSize: 12, fontWeight: 600, color: '#86efac', marginBottom: 5 }}>
        {o.title}
      </div>
      <div style={{ fontSize: 11, color: '#4ade8099', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>
        {o.detail}
      </div>
    </>
  );
}
