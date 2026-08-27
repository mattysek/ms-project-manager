export function ChangelogHeader() {
  return (
    <div
      style={{
        background: '#161b27',
        padding: '10px 16px',
        borderBottom: '1px solid #1e2533',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
      }}
    >
      <div
        style={{
          fontSize: 10,
          color: '#64748b',
          letterSpacing: '0.1em',
          textTransform: 'uppercase',
        }}
      >
        Changelog / Meeting log
      </div>
      <div style={{ fontSize: 10, color: '#334155', marginLeft: 'auto' }}>
        co se změnilo, co reportovat
      </div>
    </div>
  );
}
