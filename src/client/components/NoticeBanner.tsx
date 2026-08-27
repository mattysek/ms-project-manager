// Chybová hláška jako pruh, ne jako `alert()`.
//
// Modální dialog prohlížeče se nedá zavřít jinak než myší, nedá se otestovat
// a v aplikaci, která jinde hlásí chyby pruhy s `role="alert"`, vypadá cizí.
// Sdílené mezi LandingPage (import, operace nad projekty) a workspace (import
// do otevřeného projektu).
interface NoticeBannerProps {
  message: string | null;
  onDismiss: () => void;
  /** Pruh přes celou šířku (workspace) vs. karta v obsahu (LandingPage). */
  variant?: 'strip' | 'card';
}

export function NoticeBanner({ message, onDismiss, variant = 'strip' }: NoticeBannerProps) {
  if (!message) return null;

  const card = variant === 'card';
  return (
    <div
      role="alert"
      style={{
        background: '#2a0a0a',
        border: card ? '1px solid #f8717155' : undefined,
        borderBottom: card ? '1px solid #f8717155' : '1px solid #f8717155',
        borderRadius: card ? 8 : undefined,
        marginBottom: card ? 20 : undefined,
        padding: card ? '8px 16px' : '8px 28px',
        fontSize: 11,
        color: '#fca5a5',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
      }}
    >
      <span>⚠ {message}</span>
      <button
        type="button"
        className="btn"
        onClick={onDismiss}
        style={{
          marginLeft: 'auto',
          padding: '2px 10px',
          background: 'transparent',
          borderColor: '#f8717155',
          color: '#fca5a5',
          fontSize: 10,
        }}
      >
        Zavřít
      </button>
    </div>
  );
}
