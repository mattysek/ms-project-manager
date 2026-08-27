// Tooltip nad pruhem — zpožděné zobrazení, aby nevyskakoval při přejíždění myší.
import { useCallback, useRef, useState } from 'react';
import type { Task, TooltipState } from '../../../types';

const HOVER_DELAY_MS = 120;

/**
 * `closeTooltip` je stabilní, aby ho šlo předat do `useGanttDrag` jako
 * `onDragStart` — proto hook nic neví o probíhajícím tažení a potlačení
 * tooltipu během tahu řeší volající (viz `onEnterBar` v `GanttView`).
 */
export function useGanttTooltip() {
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const closeTooltip = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    setTooltip(null);
  }, []);

  const showTooltipAfterDelay = useCallback((e: React.MouseEvent<Element>, task: Task) => {
    const r = e.currentTarget.getBoundingClientRect();
    timer.current = setTimeout(
      () => setTooltip({ task, x: r.left, y: r.bottom + 6 }),
      HOVER_DELAY_MS
    );
  }, []);

  return { tooltip, closeTooltip, showTooltipAfterDelay };
}
