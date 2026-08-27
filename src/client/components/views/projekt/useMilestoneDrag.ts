// Přetažení štítku milníku na jiný týden v přehledu (nativní HTML5 drag-and-drop).
import { useState } from 'react';
import type { Milestone } from '../../../types';

export function useMilestoneDrag(
  updateMilestone: (id: string, updates: Partial<Milestone>) => void
) {
  const [draggingMilestoneId, setDraggingMilestoneId] = useState<string | null>(null);
  const [dropTargetWeekIdx, setDropTargetWeekIdx] = useState<number | null>(null);

  const onMilestoneDragStart = (e: React.DragEvent, milestoneId: string) => {
    setDraggingMilestoneId(milestoneId);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', milestoneId);
  };

  const onMilestoneDragEnd = () => {
    setDraggingMilestoneId(null);
    setDropTargetWeekIdx(null);
  };

  const onWeekDragOver = (e: React.DragEvent, weekIdx: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dropTargetWeekIdx !== weekIdx) setDropTargetWeekIdx(weekIdx);
  };

  const onWeekDragLeave = (e: React.DragEvent) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) setDropTargetWeekIdx(null);
  };

  const onWeekDrop = (e: React.DragEvent, weekIdx: number) => {
    e.preventDefault();
    const milestoneId = e.dataTransfer.getData('text/plain');
    if (milestoneId && draggingMilestoneId) updateMilestone(milestoneId, { weekIndex: weekIdx });
    setDraggingMilestoneId(null);
    setDropTargetWeekIdx(null);
  };

  return {
    draggingMilestoneId,
    dropTargetWeekIdx,
    onMilestoneDragStart,
    onMilestoneDragEnd,
    onWeekDragOver,
    onWeekDragLeave,
    onWeekDrop,
  };
}

export type MilestoneDrag = ReturnType<typeof useMilestoneDrag>;
