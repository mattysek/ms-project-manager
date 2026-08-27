// Sdílené drobnosti kolem milníků a přehledu týdnů.
import type { Milestone } from '../../../types';

export function isMilestoneComplete(m: Milestone): boolean {
  return m.checkItems.length > 0 && m.checkItems.every((item) => item.completed);
}

// Zvýraznění řádku přehledu týdnů — cíl přetažení milníku má přednost před zebrou.
export function weekRowBg(isDropTarget: boolean, rowIndex: number): string {
  if (isDropTarget) return '#1a2a3a';
  return rowIndex % 2 === 0 ? '#0c1018' : '#0e1320';
}
