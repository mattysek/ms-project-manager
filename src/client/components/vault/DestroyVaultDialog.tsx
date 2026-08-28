// Zrušení trezoru — FR-VAULT-10.
//
// Vyžaduje opsání slova, ne jen klik na „Ano": tohle je jediná operace
// v aplikaci, po které jsou data opravdu a nenávratně pryč — server je
// nedokáže obnovit ani ze zálohy klíče, protože žádný nemá.
import { useState } from 'react';

const CONFIRMATION_WORD = 'SMAZAT';

interface DestroyVaultDialogProps {
  onDestroy: () => Promise<void>;
  onClose: () => void;
}

export function DestroyVaultDialog({ onDestroy, onClose }: DestroyVaultDialogProps) {
  const [typed, setTyped] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    await onDestroy();
    setSubmitting(false);
    onClose();
  };

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div
        role="alert"
        style={{
          background: '#2a1010',
          border: '1px solid #f8717155',
          borderRadius: 6,
          padding: '8px 12px',
          fontSize: 11,
          color: '#fca5a5',
          lineHeight: 1.5,
        }}
      >
        Zrušením trezoru se smažou všechny uložené záznamy. Obsah je nenávratně ztracen a nelze ho
        obnovit.
      </div>
      <label className="auth-label">
        Pro potvrzení opište slovo {CONFIRMATION_WORD}
        <input
          className="inp"
          value={typed}
          onChange={(event) => setTyped(event.target.value)}
          style={{ width: '100%', marginTop: 4 }}
        />
      </label>
      <div style={{ display: 'flex', gap: 6 }}>
        <button
          type="submit"
          className="btn"
          disabled={submitting || typed !== CONFIRMATION_WORD}
          style={{
            background: '#2a1010',
            borderColor: '#f8717166',
            color: '#fca5a5',
            padding: '4px 14px',
          }}
        >
          {submitting ? 'Ruším…' : 'Zrušit trezor'}
        </button>
        <button
          type="button"
          className="btn"
          onClick={onClose}
          style={{
            background: '#161b27',
            borderColor: '#2d3748',
            color: '#94a3b8',
            padding: '4px 9px',
          }}
        >
          Zpět
        </button>
      </div>
    </form>
  );
}
