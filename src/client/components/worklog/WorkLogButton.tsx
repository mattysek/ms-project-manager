// Tlačítko „⏱ Výkazy" v horní liště (FR-WL-10).
//
// Když stopky běží, tlačítko to ukazuje **i se zavřeným panelem**: zapomenuté
// stopky jsou nejčastější způsob, jak si člověk rozbije data, a schovat tu
// informaci za jedno kliknutí by tomu jen pomohlo.
import { PanelToggleButton } from '../PanelToggleButton';
import { durationMs, formatDuration } from '../../utils/worklog';
import type { WorkLogEntry } from '../../api/worklogApi';

interface WorkLogButtonProps {
  open: boolean;
  running: WorkLogEntry | null;
  now: number;
  onToggle: () => void;
}

export function WorkLogButton({ open, running, now, onToggle }: WorkLogButtonProps) {
  const elapsed = running ? formatDuration(durationMs(running, now)) : null;

  return (
    <PanelToggleButton
      active={open}
      icon="⏱"
      label={elapsed ?? 'Výkazy'}
      ariaLabel={running ? `Výkazy — běží ${running.title}, ${elapsed}` : 'Výkazy práce'}
      title={running ? `Běží: ${running.title}` : 'Vykazování práce'}
      onClick={onToggle}
    />
  );
}
