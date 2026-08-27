// Sdílený layout přihlašovacích stránek (Login, Setup) — drží styl konzistentní
// s LandingPage a nemá logiku, jen rám a společné CSS třídy.
export function AuthShell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div
      style={{
        fontFamily: "'IBM Plex Mono','Courier New',monospace",
        background: '#0f1117',
        minHeight: '100vh',
        color: '#e2e8f0',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
      }}
    >
      <style>{`
        .inp{background:#0c1018;border:1px solid #1e2533;border-radius:4px;color:#e2e8f0;font-family:inherit;font-size:12px;padding:7px 10px;outline:none}
        .inp:focus{border-color:#4f9cf9}
        .btn{cursor:pointer;font-family:inherit;border-radius:6px;font-size:11px;padding:5px 13px;border:1px solid}
        .auth-label{display:flex;flex-direction:column;font-size:10px;color:#64748b;text-transform:uppercase;letter-spacing:.08em}
        .auth-error{background:#2a1010;border:1px solid #f8717155;border-radius:6px;padding:8px 12px;font-size:11px;color:#fca5a5}
        .auth-notice{background:#1a2a3a;border:1px solid #4f9cf955;border-radius:6px;padding:8px 12px;font-size:11px;color:#93c5fd;margin-bottom:12px}
      `}</style>
      <div
        style={{
          width: '100%',
          maxWidth: 340,
          border: '1px solid #1e2533',
          borderRadius: 12,
          padding: 28,
          background: '#0c1018',
        }}
      >
        <div
          style={{
            fontSize: 20,
            fontWeight: 700,
            color: '#4f9cf9',
            marginBottom: 4,
            fontFamily: "'IBM Plex Sans',sans-serif",
          }}
        >
          📊 MS Project Manager
        </div>
        <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 20 }}>{title}</div>
        {children}
      </div>
    </div>
  );
}
