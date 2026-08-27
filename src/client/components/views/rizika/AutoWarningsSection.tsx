import { AutoWarningCard, type AutoWarning } from './AutoWarningCard';

/** Sekce „⚡ Automatická varování" — nezobrazí se, pokud žádná varování nejsou. */
export function AutoWarningsSection({ warnings }: { warnings: AutoWarning[] }) {
  if (warnings.length === 0) return null;
  return (
    <div style={{ marginTop: 28 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        <div
          style={{
            fontSize: 10,
            color: '#475569',
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            fontWeight: 700,
          }}
        >
          ⚡ Automatická varování
        </div>
        <span style={{ fontSize: 9, color: '#334155' }}>detekováno z aktuálního plánu</span>
      </div>
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        {warnings.map((w) => (
          <div key={w.title} style={{ flex: '1 1 350px', minWidth: 300, maxWidth: 500 }}>
            <AutoWarningCard w={w} />
          </div>
        ))}
      </div>
    </div>
  );
}
