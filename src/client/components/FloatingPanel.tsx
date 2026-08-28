// Společný rám plovoucích panelů v horní liště — Quick Notes a Trezor.
//
// Vznikl proto, že se ty dva rozešly: poznámky byly celovýšková lišta
// přilepená ke kraji obrazovky, trezor plovoucí karta pod lištou. Ve stejné
// aplikaci to vypadalo jako dvě různé aplikace. Rám je tady jednou, takže
// panely od sebe nemůžou znovu utéct — stejná logika jako u `AppStyles`
// (sdílené třídy na jednom místě) a `constants/layers.ts` (z-index).
import type { ReactNode } from 'react';
import { LAYERS } from '../constants/layers';
import { TOP_BAR_HEIGHT } from './TopBar';

/** Mezera mezi lištou a panelem, i mezi panelem a spodkem okna. */
const GAP = 8;

interface FloatingPanelProps {
  /** Přístupné jméno dialogu (`aria-label`). */
  label: string;
  /** Nadpis v hlavičce; ikona je součástí textu, ať jsou panely souměrné. */
  title: ReactNode;
  /** Popisek zavíracího tlačítka — „Zavřít poznámky", „Zavřít trezor". */
  closeLabel: string;
  /** Volitelný obsah vpravo od nadpisu (třeba odznak čekajících poznámek). */
  headerExtra?: ReactNode;
  /**
   * Jakákoli interakce uvnitř panelu. Trezor si tím posouvá odpočet
   * automatického zámku (FR-VAULT-03).
   */
  onInteraction?: () => void;
  onClose: () => void;
  children: ReactNode;
}

export function FloatingPanel({
  label,
  title,
  closeLabel,
  headerExtra,
  onInteraction,
  onClose,
  children,
}: FloatingPanelProps) {
  return (
    <div
      role="dialog"
      aria-label={label}
      onPointerDown={onInteraction}
      onKeyDown={onInteraction}
      style={{
        position: 'fixed',
        // Odvozeno z výšky lišty, ne opsané číslo: lišta je `fixed` a svou
        // výšku si rezervuje obsah zvlášť (viz `TOP_BAR_HEIGHT`), takže její
        // změna musí panely posunout s sebou.
        top: TOP_BAR_HEIGHT + GAP,
        right: 14,
        width: 380,
        maxHeight: `calc(100vh - ${TOP_BAR_HEIGHT + GAP * 2}px)`,
        background: '#0f1117',
        border: '1px solid #1e2533',
        borderRadius: 10,
        zIndex: LAYERS.floatingPanel,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        boxShadow: '0 12px 32px rgba(0,0,0,.45)',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '12px 14px',
          borderBottom: '1px solid #1e2533',
        }}
      >
        <span style={{ fontSize: 12, fontWeight: 700, color: '#f1f5f9' }}>{title}</span>
        {headerExtra}
        <button
          type="button"
          onClick={onClose}
          aria-label={closeLabel}
          style={{
            marginLeft: 'auto',
            background: 'none',
            border: 'none',
            color: '#64748b',
            cursor: 'pointer',
            fontSize: 16,
          }}
        >
          ×
        </button>
      </div>
      {/* `minHeight: 0` je nutnost, ne kosmetika: bez něj by se flexový potomek
          odmítl zmenšit pod svůj obsah a panel by přerostl `maxHeight` místo
          toho, aby se uvnitř rolovalo. */}
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
        {children}
      </div>
    </div>
  );
}
