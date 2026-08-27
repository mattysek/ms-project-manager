// Hláška serveru o odmítnutém commandu.
//
// `useProjectChannel` `ErrorOccurred` odjakživa zpracovával — zapsal si ho do
// `lastError` a vrátil zobrazený stav na poslední potvrzený. Jenže `lastError`
// nikdo nevykresloval, takže se odmítnutá změna uživateli prostě vrátila zpět
// bez jediného slova: napsal MD, ono se přepsalo zpátky, a proč se nedozvěděl.
//
// Důvod přitom zná jen server (oprávnění podle ADR-006, archivovaný projekt,
// entita, kterou mezitím někdo smazal) a klient si ho nemá jak domyslet.
import { useEffect, useState } from 'react';
import type { ProjectChannelError } from '../hooks/useProjectChannel';

interface RejectedCommandBannerProps {
  error: ProjectChannelError | null;
}

/** Po téhle době se hláška schová sama — je to reakce na akci, ne trvalý stav. */
const AUTO_HIDE_MS = 6000;

export function RejectedCommandBanner({ error }: RejectedCommandBannerProps) {
  const [visible, setVisible] = useState(false);

  // Jen odmítnutí serverem. Selhání přenosu má surovou anglickou hlášku ze
  // SignalR a uživatel ho už vidí na stavu spojení a v offline frontě.
  const rejection = error?.source === 'server' ? error : null;

  useEffect(() => {
    if (!rejection) return;
    setVisible(true);
    const timer = setTimeout(() => setVisible(false), AUTO_HIDE_MS);
    return () => clearTimeout(timer);
    // `commandType` je v závislostech schválně: dvě odmítnutí se stejnou
    // hláškou po sobě (dvakrát totéž tlačítko) musí odpočet spustit znovu.
  }, [rejection]);

  if (!rejection || !visible) return null;

  return (
    <div
      role="alert"
      style={{
        background: '#2a0a0a',
        borderBottom: '1px solid #f8717155',
        color: '#fca5a5',
        fontSize: 11,
        padding: '8px 28px',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
      }}
    >
      <span>⚠ {rejection.message}</span>
      <button
        type="button"
        className="btn"
        onClick={() => setVisible(false)}
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
