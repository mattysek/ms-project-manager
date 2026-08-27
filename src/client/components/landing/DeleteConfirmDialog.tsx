import { LAYERS } from '../../constants/layers';

interface DeleteConfirmDialogProps {
  onCancel: () => void;
  onConfirm: () => void;
}

export function DeleteConfirmDialog({ onCancel, onConfirm }: DeleteConfirmDialogProps) {
  return (
    // Klikací overlay pro zavření modalu kliknutím mimo obsah — standardní
    // vzor, který se nedá vyjádřit interaktivní rolí bez zavádějící sémantiky
    // (celá obrazovka by se ohlašovala čtečce jako "tlačítko"). Klávesnicové
    // ovládání jde přes tlačítka uvnitř dialogu. Zavírá jen klik přímo na
    // overlay (`target === currentTarget`), ne bublání z obsahu dialogu — díky
    // tomu vnitřní `<div>` nepotřebuje vlastní `onClick`/`onKeyDown` pár.
    // biome-ignore lint/a11y/useKeyWithClickEvents: overlay pro zavření kliknutím mimo, ne interaktivní prvek
    // biome-ignore lint/a11y/noStaticElementInteractions: overlay pro zavření kliknutím mimo, ne interaktivní prvek
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.7)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: LAYERS.modal,
      }}
      onClick={(e) => e.target === e.currentTarget && onCancel()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Smazat projekt?"
        style={{
          background: '#161b27',
          border: '1px solid #f8717155',
          borderRadius: 10,
          padding: 24,
          maxWidth: 400,
        }}
      >
        <div style={{ fontSize: 14, fontWeight: 600, color: '#f87171', marginBottom: 12 }}>
          Smazat projekt?
        </div>
        <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 20 }}>
          Tato akce je nevratná. Projekt bude trvale smazán ze serveru.
        </div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button
            type="button"
            className="btn"
            onClick={onCancel}
            style={{ background: '#1a1a1a', borderColor: '#333', color: '#999' }}
          >
            Zrušit
          </button>
          <button
            type="button"
            className="btn"
            onClick={onConfirm}
            style={{ background: '#2a1010', borderColor: '#f8717166', color: '#f87171' }}
          >
            Smazat
          </button>
        </div>
      </div>
    </div>
  );
}
