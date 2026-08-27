// CRUD nad milníky a jejich checklistem — jediné místo, kde se skládá nové pole milníků.
import type { Milestone, MilestoneCheckItem } from '../../../types';
import { uid } from '../../../utils';

export function useMilestoneEditing(
  milestones: Milestone[],
  setMilestones: (milestones: Milestone[]) => void
) {
  /** Přepíše jeden milník; ostatní zůstanou referenčně stejné. */
  const mapMilestone = (id: string, fn: (m: Milestone) => Milestone) =>
    setMilestones(milestones.map((m) => (m.id === id ? fn(m) : m)));

  const addMilestone = () => {
    setMilestones([
      ...milestones,
      { id: uid(), title: 'Nový milník', weekIndex: 0, checkItems: [] },
    ]);
  };

  const updateMilestone = (id: string, updates: Partial<Milestone>) =>
    mapMilestone(id, (m) => ({ ...m, ...updates }));

  const deleteMilestone = (id: string) => {
    if (!confirm('Opravdu smazat tento milník?')) return;
    setMilestones(milestones.filter((m) => m.id !== id));
  };

  const addCheckItem = (milestoneId: string) =>
    mapMilestone(milestoneId, (m) => ({
      ...m,
      checkItems: [...m.checkItems, { id: uid(), text: '', completed: false }],
    }));

  const updateCheckItem = (
    milestoneId: string,
    itemId: string,
    updates: Partial<MilestoneCheckItem>
  ) =>
    mapMilestone(milestoneId, (m) => ({
      ...m,
      checkItems: m.checkItems.map((item) => (item.id === itemId ? { ...item, ...updates } : item)),
    }));

  const deleteCheckItem = (milestoneId: string, itemId: string) =>
    mapMilestone(milestoneId, (m) => ({
      ...m,
      checkItems: m.checkItems.filter((item) => item.id !== itemId),
    }));

  return {
    addMilestone,
    updateMilestone,
    deleteMilestone,
    addCheckItem,
    updateCheckItem,
    deleteCheckItem,
  };
}

export type MilestoneEditing = ReturnType<typeof useMilestoneEditing>;
