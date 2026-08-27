import { useEffect } from 'react';
import type { Task, Categories, PersonWithWeeks } from '../types';
import { DescriptionSection } from './taskDetail/DescriptionSection';
import { LinksSection } from './taskDetail/LinksSection';
import { ModalFooter, ModalHeader } from './taskDetail/ModalChrome';
import { TaskFields } from './taskDetail/TaskFields';
import { useDescriptionEditor } from './taskDetail/useDescriptionEditor';
import { useTaskDraft } from './taskDetail/useTaskDraft';
import { LAYERS } from '../constants/layers';

interface TaskDetailModalProps {
  task: Task;
  onSave: (updatedTask: Task) => void;
  onClose: () => void;
  onDelete?: () => void;
  cats: Categories;
  people: PersonWithWeeks[];
  numWeeks: number;
}

const FALLBACK_CAT = { bg: '#111', bd: '#4b5563', tx: '#94a3b8' };

/**
 * Escape zavírá modal.
 *
 * Dřív měl dva kroky — nejdřív zrušil editaci popisu, teprve pak zavřel —
 * protože popis byl jediné pole s vlastním editačním režimem. Ten zmizel
 * (popis se teď píše rovnou do konceptu), takže Escape zahazuje rozepsané
 * změny stejně u popisu jako u názvu nebo MD. Jednotné chování je tu
 * důležitější než záchranná brzda na jediném poli.
 */
function useEscapeKey(onClose: () => void) {
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [onClose]);
}

/** Obsah dialogu — vše mezi hlavičkou a patičkou. */
function DetailCard({
  draft,
  desc,
  cats,
  people,
  numWeeks,
  currentPerson,
  onClose,
  onSave,
  onDelete,
}: {
  draft: ReturnType<typeof useTaskDraft>;
  desc: ReturnType<typeof useDescriptionEditor>;
  cats: Categories;
  people: PersonWithWeeks[];
  numWeeks: number;
  currentPerson: PersonWithWeeks | undefined;
  onClose: () => void;
  onSave: (task: Task) => void;
  onDelete?: () => void;
}) {
  const { editedTask, updateField } = draft;
  const currentCat = cats[editedTask.cat] || { ...FALLBACK_CAT, label: editedTask.cat };

  return (
    <div
      style={{
        background: '#0c1018',
        border: '1px solid #1e2533',
        borderRadius: 12,
        width: '100%',
        maxWidth: 700,
        maxHeight: '90vh',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
      }}
    >
      <ModalHeader editedTask={editedTask} currentPerson={currentPerson} onClose={onClose} />
      <div
        style={{
          padding: 20,
          overflowY: 'auto',
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
        }}
      >
        <TaskFields
          editedTask={editedTask}
          updateField={updateField}
          cats={cats}
          people={people}
          numWeeks={numWeeks}
          currentCat={currentCat}
          currentPerson={currentPerson}
        />
        <DescriptionSection editor={desc} />
        <LinksSection
          links={editedTask.links || []}
          addLink={draft.addLink}
          updateLink={draft.updateLink}
          deleteLink={draft.deleteLink}
        />
      </div>
      <ModalFooter
        task={editedTask}
        onDelete={onDelete}
        onClose={onClose}
        onSave={() => {
          onSave(editedTask);
          onClose();
        }}
      />
    </div>
  );
}

export function TaskDetailModal({
  task,
  onSave,
  onClose,
  onDelete,
  cats,
  people,
  numWeeks,
}: TaskDetailModalProps) {
  const draft = useTaskDraft(task);
  const desc = useDescriptionEditor(draft.editedTask, draft.updateField);

  useEscapeKey(onClose);

  const currentPerson = people.find((p) => p.id === draft.editedTask.p);

  // Zavírá jen klik přímo na overlay, ne bublání z obsahu dialogu.
  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onClose();
  };

  return (
    // Klikací overlay pro zavření modalu kliknutím mimo obsah — standardní vzor, který se
    // nedá vyjádřit interaktivní rolí bez zavádějící sémantiky. Klávesnicové ovládání jde
    // přes Escape (viz `useEscapeKey`) a tlačítko Zrušit.
    // biome-ignore lint/a11y/useKeyWithClickEvents: overlay pro zavření kliknutím mimo, klávesnice má Escape
    // biome-ignore lint/a11y/noStaticElementInteractions: overlay pro zavření kliknutím mimo, ne interaktivní prvek
    <div
      onClick={handleBackdropClick}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.75)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: LAYERS.modal,
        padding: 20,
      }}
    >
      <DetailCard
        draft={draft}
        desc={desc}
        cats={cats}
        people={people}
        numWeeks={numWeeks}
        currentPerson={currentPerson}
        onClose={onClose}
        onSave={onSave}
        onDelete={onDelete}
      />
    </div>
  );
}
