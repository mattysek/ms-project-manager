// Tlačítko „🔐 Trezor" v horní liště — dostupné i bez otevřeného projektu
// (stejně jako Quick Notes v FR-QN-01).
import { PanelToggleButton } from '../PanelToggleButton';

interface VaultButtonProps {
  open: boolean;
  locked: boolean;
  onToggle: () => void;
}

export function VaultButton({ open, locked, onToggle }: VaultButtonProps) {
  return (
    <PanelToggleButton
      active={open}
      // Ikona nese druhou informaci než zvýraznění: jestli je trezor zamčený.
      icon={locked ? '🔐' : '🔓'}
      label="Trezor"
      ariaLabel={locked ? 'Trezor — zamčený' : 'Trezor — odemčený'}
      title="Trezor hesel"
      onClick={onToggle}
    />
  );
}
