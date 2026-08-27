import { useState } from 'react';
import type { KbEditorTab } from './KbEditorPane';

/**
 * Rozepsaný draft editace stránky — název, obsah, aktivní záložka editoru
 * a `updatedAt` báze pro detekci konfliktu (`useKbConflict`).
 */
export function useKbDraft() {
  const [editContent, setEditContent] = useState('');
  const [editTitle, setEditTitle] = useState('');
  const [editorTab, setEditorTab] = useState<KbEditorTab>('edit');
  // `updatedAt` stránky v okamžiku vstupu do editace — `useKbConflict` ho
  // porovnává s aktuálním, aby poznal uložení jiným uživatelem (Scenario:
  // Simultánní editace stejné KB stránky).
  const [editBaseUpdatedAt, setEditBaseUpdatedAt] = useState<string | null>(null);
  // Štítky se v editoru zadávají jako čárkami oddělený text; na pole se
  // převádějí až při uložení (`parseTags`).
  const [editTags, setEditTags] = useState('');

  const reset = () => {
    setEditContent('');
    setEditTitle('');
    setEditTags('');
  };

  return {
    editContent,
    setEditContent,
    editTitle,
    setEditTitle,
    editorTab,
    setEditorTab,
    editBaseUpdatedAt,
    setEditBaseUpdatedAt,
    editTags,
    setEditTags,
    reset,
  };
}

export type KbDraft = ReturnType<typeof useKbDraft>;
