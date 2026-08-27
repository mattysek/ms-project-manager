// Změna vlastního hesla — FR-AUTH-04.
import { useState } from 'react';
import * as authApi from '../../api/authApi';
import { LAYERS } from '../../constants/layers';

interface ChangePasswordDialogProps {
  onClose: () => void;
}

export function ChangePasswordDialog({ onClose }: ChangePasswordDialogProps) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (newPassword.length < 8) {
      setError('Heslo musí mít alespoň 8 znaků');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Hesla se neshodují');
      return;
    }
    try {
      await authApi.changePassword(currentPassword, newPassword);
      setSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Změna hesla se nezdařila');
    }
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
          Změna hesla
        </div>
        {success ? (
          <>
            <div style={{ color: '#6ee7b7', fontSize: 12, marginBottom: 16 }}>
              Heslo bylo úspěšně změněno
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
          <ChangePasswordForm
            currentPassword={currentPassword}
            setCurrentPassword={setCurrentPassword}
            newPassword={newPassword}
            setNewPassword={setNewPassword}
            confirmPassword={confirmPassword}
            setConfirmPassword={setConfirmPassword}
            error={error}
            onSubmit={handleSubmit}
            onCancel={onClose}
          />
        )}
      </div>
    </div>
  );
}

interface FormProps {
  currentPassword: string;
  setCurrentPassword: (v: string) => void;
  newPassword: string;
  setNewPassword: (v: string) => void;
  confirmPassword: string;
  setConfirmPassword: (v: string) => void;
  error: string | null;
  onSubmit: (e: React.FormEvent) => void;
  onCancel: () => void;
}

function ChangePasswordForm({
  currentPassword,
  setCurrentPassword,
  newPassword,
  setNewPassword,
  confirmPassword,
  setConfirmPassword,
  error,
  onSubmit,
  onCancel,
}: FormProps) {
  return (
    <form onSubmit={onSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <input
        type="password"
        className="inp"
        placeholder="Současné heslo"
        value={currentPassword}
        onChange={(e) => setCurrentPassword(e.target.value)}
      />
      <input
        type="password"
        className="inp"
        placeholder="Nové heslo"
        value={newPassword}
        onChange={(e) => setNewPassword(e.target.value)}
      />
      <input
        type="password"
        className="inp"
        placeholder="Potvrzení nového hesla"
        value={confirmPassword}
        onChange={(e) => setConfirmPassword(e.target.value)}
      />
      {error && <div style={{ color: '#fca5a5', fontSize: 11 }}>{error}</div>}
      <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
        <button
          type="button"
          onClick={onCancel}
          className="btn"
          style={{ flex: 1, background: '#161b27', borderColor: '#2d3748', color: '#94a3b8' }}
        >
          Zrušit
        </button>
        <button
          type="submit"
          className="btn"
          style={{ flex: 1, background: '#0d2210', borderColor: '#34d39966', color: '#6ee7b7' }}
        >
          Uložit
        </button>
      </div>
    </form>
  );
}
