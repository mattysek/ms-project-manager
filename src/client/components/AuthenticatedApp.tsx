// Vše, co App.tsx dělalo předtím, plus routing na `/admin/users` a Quick
// Notes/TopBar — vytaženo z `App.tsx`, aby `AuthGate` (přihlášení) a tahle
// komponenta (aplikace samotná) byly každá pod rozpočtem ADR-012 zvlášť.
import { useState, type ReactNode } from 'react';
import type { ViewType } from '../types';
import { INIT_PROJECT } from '../constants';
import { LandingPage } from './LandingPage';
import { ProjectWorkspace } from './ProjectWorkspace';
import { TopBar, TOP_BAR_HEIGHT } from './TopBar';
import { AppStyles } from './AppStyles';
import { AdminUsersPage } from './admin/AdminUsersPage';
import { MyWorkPage } from './workload/MyWorkPage';
import { QuickNotesHost } from './quicknotes/QuickNotesHost';
import { useNoteConversion } from './quicknotes/useNoteConversion';
import { useProjectSession } from '../hooks/useProjectSession';
import { useAppCommands } from '../hooks/appCommands';
import { useAppLifecycleEffects } from '../hooks/useAppLifecycleEffects';
import { useAppNavigation } from '../hooks/useAppNavigation';
import { useProjectDerivedData } from '../hooks/useProjectDerivedData';
import { useExportImport } from '../hooks/useExportImport';
import { useQuickNotes } from '../hooks/useQuickNotes';
import { useRoute, projectIdFromPath } from '../hooks/useRoute';
import type { AuthenticatedAuth } from '../hooks/useAuth';

const LOADING_STYLE = {
  fontFamily: "'IBM Plex Mono','Courier New',monospace",
  background: '#0f1117',
  minHeight: '100vh',
  color: '#e2e8f0',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
} as const;

interface AuthenticatedAppProps {
  auth: AuthenticatedAuth;
}

/**
 * Tři stavy hlavního obsahu (žádný projekt / načítání / workspace) — jako
 * if/else, ne vnořený ternární výraz (style/noNestedTernary).
 */
function MainContent({
  currentProjectId,
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
  focusTask,
  nav,
  userId,
}: {
  currentProjectId: string | null;
  project: React.ComponentProps<typeof ProjectWorkspace>['project'];
  state: React.ComponentProps<typeof ProjectWorkspace>['state'] | null;
  view: ViewType;
  setView: React.Dispatch<React.SetStateAction<ViewType>>;
  session: React.ComponentProps<typeof ProjectWorkspace>['session'];
  derived: React.ComponentProps<typeof ProjectWorkspace>['derived'];
  commands: React.ComponentProps<typeof ProjectWorkspace>['commands'];
  exportProject: React.ComponentProps<typeof ProjectWorkspace>['exportProject'];
  importError: React.ComponentProps<typeof ProjectWorkspace>['importError'];
  dismissImportError: React.ComponentProps<typeof ProjectWorkspace>['dismissImportError'];
  focusTask: React.ComponentProps<typeof ProjectWorkspace>['focusTask'];
  nav: ReturnType<typeof useAppNavigation>;
  userId: string;
}): ReactNode {
  if (currentProjectId === null) {
    return <LandingPage onOpenProject={nav.loadProject} onOpenMyWork={nav.openMyWork} />;
  }
  if (!state) return <div style={LOADING_STYLE}>Načítám projekt...</div>;
  return (
    <ProjectWorkspace
      projectId={currentProjectId}
      project={project}
      state={state}
      view={view}
      setView={setView}
      session={session}
      derived={derived}
      commands={commands}
      exportProject={exportProject}
      importError={importError}
      dismissImportError={dismissImportError}
      focusTask={focusTask}
      onBack={nav.closeProject}
      currentUserId={userId}
    />
  );
}

/** Sešije session, commandy, odvozená data a export/import do jednoho celku. */
function useWorkspaceData({
  currentProjectId,
  view,
  userId,
  notes,
}: {
  currentProjectId: string | null;
  view: ViewType;
  userId: string | undefined;
  notes: ReturnType<typeof useQuickNotes>;
}) {
  const session = useProjectSession(currentProjectId, { userId });
  const commands = useAppCommands({
    state: session.state,
    dispatch: session.dispatch,
    applyLocal: session.applyLocal,
  });
  // Přílohy z importovaného ZIPu se nahrávají po `full_state_import`; když
  // některá neprojde, uživatel se to musí dozvědět (`NoticeBanner`).
  const [importWarning, setImportWarning] = useState<string | null>(null);
  useAppLifecycleEffects({
    currentProjectId,
    view,
    state: session.state,
    fullStateVersion: session.fullStateVersion,
    sendPresence: session.sendPresence,
    dispatch: session.dispatch,
    onImportWarning: setImportWarning,
  });

  const project = session.state?.project ?? INIT_PROJECT;
  const derived = useProjectDerivedData(
    project,
    session.state?.tasks ?? [],
    session.state?.people ?? []
  );
  const exportImport = useExportImport({ state: session.state, isOffline: session.isOffline });
  const conversion = useNoteConversion({
    notes,
    state: session.state,
    derived,
    onCreated: (task) => commands.setTasks((prev) => [...prev, task]),
  });

  return {
    session,
    commands,
    project,
    derived,
    exportImport,
    conversion,
    importWarning,
    dismissImportWarning: () => setImportWarning(null),
  };
}

export function AuthenticatedApp({ auth }: AuthenticatedAppProps) {
  const route = useRoute();
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(() =>
    projectIdFromPath(route.path)
  );
  const [view, setView] = useState<ViewType>('projekt');
  const nav = useAppNavigation(route, setCurrentProjectId, setView, auth);
  const notes = useQuickNotes();

  const ws = useWorkspaceData({ currentProjectId, view, userId: auth.user?.userId, notes });
  const { session, commands, project, derived, exportImport, conversion } = ws;

  // Přehled napříč projekty stojí mimo projekt (PRD-08), takže i mimo
  // `ProjectWorkspace` — vlastní cesta, ne desátá záložka.
  if (route.path.startsWith('/moje-prace')) {
    return (
      <MyWorkPage onBack={() => route.navigate('/')} onOpenTask={nav.loadProjectTask} />
    );
  }

  if (route.path.startsWith('/admin/users')) {
    if (!auth.user.isAdmin) {
      route.navigate('/', { replace: true });
      return null;
    }
    return <AdminUsersPage onBack={() => route.navigate('/')} />;
  }

  return (
    <div
      style={{ ...LOADING_STYLE, display: 'block', userSelect: 'none', paddingTop: TOP_BAR_HEIGHT }}
    >
      <AppStyles />
      <TopBar
        user={auth.user}
        role={session.myRole}
        onLogout={nav.handleLogout}
        onOpenAdmin={() => route.navigate('/admin/users')}
        quickNotes={
          <QuickNotesHost
            notes={notes}
            activeProjectId={currentProjectId}
            onConvert={conversion.requestConvert}
          />
        }
      />
      <MainContent
        currentProjectId={currentProjectId}
        project={project}
        state={session.state}
        view={view}
        setView={setView}
        session={session}
        derived={derived}
        commands={commands}
        exportProject={exportImport.exportProject}
        importError={ws.importWarning}
        dismissImportError={ws.dismissImportWarning}
        focusTask={{ taskId: nav.pendingTaskId, onHandled: nav.clearPendingTask }}
        nav={nav}
        userId={auth.user.userId}
      />
      {conversion.modal}
    </div>
  );
}
