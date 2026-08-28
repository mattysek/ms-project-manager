// Tlačítko + panel trezoru dohromady — obdoba `QuickNotesHost` (FR-QN-01).
//
// Stav trezoru (`useVault`) vlastní tahle komponenta: na rozdíl od poznámek ho
// nikdo jiný nepotřebuje a odvozený klíč má žít v co nejmenším kusu stromu.
// Naopak „je panel otevřený" vlastní volající (`useOpenPanel`) — o tom musí
// rozhodovat jedno místo pro oba panely, jinak se překrývají.
//
// Zavření panelu trezor **nezamyká**: klíč drží `useVault` a stará se o něj
// automatický zámek (FR-VAULT-03). Zamykat schováním panelu by znamenalo, že
// letmý pohled do poznámek stojí znovuzadání hesla.
import { useVault } from '../../hooks/useVault';
import { VaultButton } from './VaultButton';
import { VaultPanel } from './VaultPanel';

interface VaultHostProps {
  open: boolean;
  onToggle: () => void;
  onClose: () => void;
}

export function VaultHost({ open, onToggle, onClose }: VaultHostProps) {
  const vault = useVault();

  return (
    <>
      <VaultButton open={open} locked={vault.status !== 'unlocked'} onToggle={onToggle} />
      {open && <VaultPanel vault={vault} onClose={onClose} />}
    </>
  );
}
