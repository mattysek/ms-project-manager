// Milníky v záhlaví Ganttu — sdílené mezi buňkou týdne a podkladem řádku osoby.
import type { Milestone } from '../../../types';

export function isMilestoneComplete(m: Milestone): boolean {
  return m.checkItems.length > 0 && m.checkItems.every((item) => item.completed);
}

// Barva popisku týdne v hlavičce Ganttu — aktuální týden modře, týden s
// nesplněným milníkem červeně, se splněným zeleně, jinak neutrálně.
export function weekLabelColor(
  isCurrent: boolean,
  hasMilestones: boolean,
  hasIncomplete: boolean
): string {
  if (isCurrent) return '#93c5fd';
  if (!hasMilestones) return '#475569';
  return hasIncomplete ? '#fca5a5' : '#6ee7b7';
}

// Podbarvení buňky týdne v řádku osoby podle stavu milníků v daném týdnu.
export function weekMilestoneBg(hasMilestones: boolean, allComplete: boolean): string {
  if (!hasMilestones) return 'transparent';
  return allComplete ? '#0d221014' : '#1a0f0a14';
}

/** Milníky spadající do týdne podle 0-based indexu (`Milestone.weekIndex`). */
export function milestonesForWeek(milestones: Milestone[], weekIdx: number): Milestone[] {
  return milestones.filter((m) => m.weekIndex === weekIdx);
}
