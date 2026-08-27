// Popis úkolu — píše se rovnou do konceptu, přepínač jen mění zobrazení.
//
// Dřív měl popis vlastní editační režim s tlačítky „✎ Upravit" a „Uložit
// popis", takže jediné pole v celém dialogu se ukládalo jinak než všechna
// ostatní: název, MD, kategorie i odkazy se zapisují do konceptu a odejdou
// s „Uložit změny", kdežto popis chtěl dvě kliknutí navíc — a kdo je
// neudělal, o rozepsaný text přišel.
//
// Teď je popis obyčejné pole konceptu. Zůstává jen přepínač **zdroj ⇄ náhled**,
// protože markdown má smysl vidět vysázený; se zápisem ale nemá nic společného
// a nic neukládá.
import { useMemo, useState } from 'react';
import type { Task } from '../../types';
import { markdownToHtml } from '../../utils/htmlMarkdownConverter';

const EMPTY_DESC = '<p style="color:#475569;font-style:italic">Žádný popis</p>';

export function useDescriptionEditor(
  editedTask: Task,
  updateField: <K extends keyof Task>(field: K, value: Task[K]) => void
) {
  const [showPreview, setShowPreview] = useState(false);

  // Sanitizováno v `markdownToHtml` — popis mohl napsat jiný uživatel.
  const renderedDesc = useMemo(
    () => (editedTask.desc ? markdownToHtml(editedTask.desc) : EMPTY_DESC),
    [editedTask.desc]
  );

  return {
    /** Text popisu; jde přímo z konceptu, žádný mezistupeň. */
    value: editedTask.desc || '',
    setValue: (next: string) => updateField('desc', next),
    showPreview,
    togglePreview: () => setShowPreview((value) => !value),
    renderedDesc,
  };
}

export type DescriptionEditor = ReturnType<typeof useDescriptionEditor>;
