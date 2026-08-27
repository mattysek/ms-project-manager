// Správa kategorií úkolů — rozbalovací panel v horní části SeznamView.
import { useState } from 'react';
import type { Categories, Task } from '../../../types';
import { deriveCat, uid } from '../../../utils';
import type { SetTasks } from './useTaskActions';

export interface CategoryManagerState {
  open: boolean;
  toggle: () => void;
  newCatLabel: string;
  setNewCatLabel: (v: string) => void;
  newCatColor: string;
  setNewCatColor: (v: string) => void;
  updateCat: (k: string, f: keyof Categories[string], v: string) => void;
  updateCatColor: (k: string, hex: string) => void;
  deleteCat: (k: string) => void;
  addCat: () => void;
}

type SetCats = React.Dispatch<React.SetStateAction<Categories>>;

export function useCategoryManager(
  cats: Categories,
  setCats: SetCats,
  setTasks: SetTasks
): CategoryManagerState {
  const [open, setOpen] = useState(false);
  const [newCatLabel, setNewCatLabel] = useState('');
  const [newCatColor, setNewCatColor] = useState('#6366f1');

  const updateCat = (k: string, f: keyof Categories[string], v: string) =>
    setCats((prev) => ({ ...prev, [k]: { ...prev[k], [f]: v } }));

  const updateCatColor = (k: string, hex: string) =>
    setCats((prev) => ({
      ...prev,
      [k]: { ...prev[k], bd: hex, bg: `${hex}18`, tx: `${hex}dd` },
    }));

  const deleteCat = (k: string) => {
    if (Object.keys(cats).length <= 1) return;
    const fallback = Object.keys(cats).find((x) => x !== k) || 'obecne';
    setTasks((prev: Task[]) => prev.map((t) => (t.cat === k ? { ...t, cat: fallback } : t)));
    setCats((prev) => {
      const next = { ...prev };
      delete next[k];
      return next;
    });
  };

  const addCat = () => {
    if (!newCatLabel.trim()) return;
    const key = `cat_${uid()}`;
    setCats((prev) => ({ ...prev, [key]: deriveCat(newCatColor, newCatLabel.trim()) }));
    setNewCatLabel('');
    setNewCatColor('#6366f1');
  };

  return {
    open,
    toggle: () => setOpen((v) => !v),
    newCatLabel,
    setNewCatLabel,
    newCatColor,
    setNewCatColor,
    updateCat,
    updateCatColor,
    deleteCat,
    addCat,
  };
}
