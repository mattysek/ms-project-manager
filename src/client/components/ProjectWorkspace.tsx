// Layout otevřeného projektu (Header + offline/collab banner + conflict dialog
// + aktivní view) — vytaženo z App.tsx, aby `App()` zůstal pod rozpočtem
// ADR-012. Props objekt má víc než 4 klíče (ADR-012 „bez zdůvodnění"), ale je
// to čistá kompozice: jediná alternativa je rozestřít stejné hodnoty do
// samostatných parametrů, což nic nezjednoduší.
import type { ViewType, Project } from '../types';
import type { AppState } from '../state/appState';
import type { UseProjectSessionResult } from '../hooks/useProjectSession';
import type { AppCommands } from '../hooks/appCommands';
import type { ProjectDerivedData } from '../hooks/useProjectDerivedData';
import { useMemo } from 'react';
import { isReminderDue } from '../utils/reminders';
import { Header } from './Header';
import { OfflineBanner } from './OfflineBanner';
import { RejectedCommandBanner } from './RejectedCommandBanner';
import { NoticeBanner } from './NoticeBanner';
import { ArchivedBanner } from './ArchivedBanner';
import { useProjectArchived } from '../hooks/useProjectArchived';
import { ConflictResolutionDialog } from './ConflictResolutionDialog';
import { AppViews } from './AppViews';

interface ProjectWorkspaceProps {
  project: Project;
  /** Nenulový stav — volající (`App.tsx`) tenhle komponent renderuje až po `full_state`/cache. */
  state: AppState;
  view: ViewType;
  setView: (view: ViewType) => void;
  session: UseProjectSessionResult;
  derived: ProjectDerivedData;
  commands: AppCommands;
  exportProject: () => void;
  /** Hláška o přílohách, které se při importu nepodařilo nahrát. */
  importError: string | null;
  dismissImportError: () => void;
  onBack: () => void;
  /** Id přihlášeného uživatele — protéká do Gantt/Kapacita pro vlastnictví (ADR-006 doplněk). */
  currentUserId: string;
  /** Id otevřeného projektu — sekce členů ho potřebuje pro REST volání (FR-ROLE-02). */
  projectId: string;
  /** Úkol k rozbalení po prokliku z „Moje práce" (PRD-08). */
  focusTask: { taskId: string | null; onHandled: () => void };
}

export function ProjectWorkspace({
  project,
  state,
  view,
  setView,
  session,
  derived,
  commands,
  exportProject,
  importError,
  dismissImportError,
  onBack,
  currentUserId,
  projectId,
  focusTask,
}: ProjectWorkspaceProps) {
  // Odznak u záložky TODO — připomínky jsou per-user, takže stačí spočítat
  // splatné z vlastního stavu. Přepočítá se při každé změně `reminders`.
  const dueReminders = useMemo(
    () => state.reminders.filter((reminder) => isReminderDue(reminder, new Date())).length,
    [state.reminders]
  );

  const archived = useProjectArchived(projectId);

  return (
    <>
      <Header
        projectName={project.name}
        startDate={project.startDate}
        endDate={project.endDate}
        budget={project.budget}
        numWeeks={derived.numWeeks}
        grand={derived.grand}
        planned={derived.planned}
        plannedDiff={derived.plannedDiff}
        overallProgress={derived.overallProgress}
        view={view}
        setView={setView}
        dueReminders={dueReminders}
        exportJSON={exportProject}
        onBack={onBack}
        canUndo={session.canUndo}
        canRedo={session.canRedo}
        onUndo={session.undo}
        onRedo={session.redo}
        connectionStatus={session.connectionStatus}
        presence={session.presence}
      />
      <ArchivedBanner archived={archived} />
      <RejectedCommandBanner error={session.lastError} />
      <NoticeBanner message={importError} onDismiss={dismissImportError} />
      <OfflineBanner
        isOffline={session.isOffline}
        pendingCount={session.pendingCount}
        syncMessage={session.syncMessage}
        purgedNotice={session.purgedNotice}
        queueFullWarning={session.queueFullWarning}
        collabNotice={session.collabNotice}
        onDismissSyncMessage={session.dismissSyncMessage}
        onDismissPurgedNotice={session.dismissPurgedNotice}
        onDismissQueueFullWarning={session.dismissQueueFullWarning}
        onDismissCollabNotice={session.dismissCollabNotice}
      />
      <ConflictResolutionDialog
        conflicts={session.conflicts}
        onResolve={session.resolveConflict}
        onResolveAll={session.resolveAllConflicts}
      />
      <AppViews
        view={view}
        state={state}
        derived={derived}
        commands={commands}
        isOffline={session.isOffline}
        ado={session.ado}
        role={session.myRole}
        currentUserId={currentUserId}
        projectId={projectId}
        focusTask={focusTask}
      />
    </>
  );
}
