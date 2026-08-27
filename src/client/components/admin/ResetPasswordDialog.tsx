// Reset hesla uživatele adminem — admin nezadává staré heslo (FR-AUTH-05).
import { useState } from 'react';
import { LAYERS } from '../../constants/layers';

interface ResetPasswordDialogProps {
  displayName: string;
  onReset: (newPassword: string) => Promise<string | null>;
  onClose: () => void;
}

export function ResetPasswordDialog({ displayName, onReset, onClose }: ResetPasswordDialogProps) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const failure = await onReset(password);
    if (failure) setError(failure);
    else setDone(true);
  };

  return (
    // Klikací overlay pro zavření modalu kliknutím mimo obsah — standardní vzor, který se
    // nedá vyjádřit interaktivní rolí bez zavádějící sémantiky. Klávesnicové ovládání jde
    // přes tlačítka uvnitř dialogu.
    // biome-ignore lint/a11y/useKeyWithClickEvents: overlay pro zavření kliknutím mimo, ne interaktivní prvek
    // biome-ignore lint/a11y/noStaticElementInteractions: overlay pro zavření kliknutím mimo, ne interaktivní prvek
    <div
      onClick={(e) => e.target === e.currentTarget && onClose()}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,.75)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: LAYERS.dialogOverDialog,
      }}
    >
      <div
        style={{
          background: '#0c1018',
          border: '1px solid #1e2533',
          borderRadius: 10,
          padding: 22,
          width: 320,
        }}
      >
        <div style={{ fontSize: 13, fontWeight: 700, color: '#e2e8f0', marginBottom: 14 }}>
          Reset hesla — {displayName}
        </div>
        {done ? (
          <>
            <div style={{ color: '#6ee7b7', fontSize: 12, marginBottom: 16 }}>
              Heslo bylo resetováno
            </div>
            <button
              type="button"
              className="btn"
              onClick={onClose}
              style={{ background: '#161b27', borderColor: '#2d3748', color: '#94a3b8' }}
            >
              Zavřít
            </button>
          </>
        ) : (
          <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <input
              type="password"
              className="inp"
              placeholder="Nové heslo"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              // biome-ignore lint/a11y/noAutofocus: jediné pole modalu, otevřeného explicitní akcí uživatele
              autoFocus
            />
            {error && <div style={{ color: '#fca5a5', fontSize: 11 }}>{error}</div>}
            <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
              <button
                type="button"
                onClick={onClose}
                className="btn"
                style={{ flex: 1, background: '#161b27', borderColor: '#2d3748', color: '#94a3b8' }}
              >
                Zrušit
              </button>
              <button
                type="submit"
                disabled={!password}
                className="btn"
                style={{
                  flex: 1,
                  background: '#0d2210',
                  borderColor: '#34d39966',
                  color: '#6ee7b7',
                }}
              >
                Resetovat
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
