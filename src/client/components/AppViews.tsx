// Routuje aktivní záložku na příslušný View — vytaženo z App.tsx (ADR-012:
// `App()` by jinak neslo přes 250 řádků JSX pro devět view). Views samy
// zůstávají beze změny (ADR-005), dostávají jen commandy místo přímých setterů.
//
// Každá záložka má vlastní malou render funkci (ADR-012: `AppViews` samo by
// jako jedna if-chain funkce překročilo 60řádkový rozpočet) — `AppViews` je
// jen výběr podle `view`.
import type { ViewType } from '../types';
import type { AppState } from '../state/appState';
import type { MemberRole } from '../types/protocol';
import type { AppCommands } from '../hooks/appCommands';
import type { UseAdoSyncResult } from '../hooks/useAdoSync';
import type { ProjectDerivedData } from '../hooks/useProjectDerivedData';
import {
  ProjektView,
  GanttView,
  SeznamView,
  KapacitaView,
  RizikaView,
  SouboryView,
  AdoSyncView,
} from './views';
import { TodoView } from './views/TodoView';
import { ProjectMembersSection } from './members/ProjectMembersSection';
import { useProjectMemberList } from './members/useProjectMemberList';
import type { Member } from '../api/membersApi';
import { KnowledgeBaseView } from './views/KnowledgeBaseView';

interface AppViewsProps {
  view: ViewType;
  state: AppState;
  derived: ProjectDerivedData;
  commands: AppCommands;
  isOffline: boolean;
  /** ADO Sync si stav i commandy nese sám (ADR-008) — mimo `AppState`. */
  ado: UseAdoSyncResult;
  role: MemberRole | null;
  /** Id přihlášeného uživatele — Gantt/Kapacita s ním porovnávají `Person.userId` (ADR-006 doplněk). */
  currentUserId: string;
  /** Potřebuje ho sekce členů projektu (FR-ROLE-02) — členství jde přes REST, ne přes commandy. */
  projectId: string;
  /** Úkol k rozbalení po prokliku z „Moje práce" (PRD-08). */
  focusTask: { taskId: string | null; onHandled: () => void };
}

/** Vstup pro dílčí render funkce níž — stejná 3 pole pro každou (ADR-012 `useMaxParams`). */
interface ViewRenderCtx {
  state: AppState;
  derived: ProjectDerivedData;
  commands: AppCommands;
}

function renderProjekt(
  { state, derived, commands }: ViewRenderCtx,
  membersSection: React.ReactNode,
  role: MemberRole | null
) {
  return (
    <ProjektView
      project={state.project}
      updateProject={commands.updateProject}
      changeDates={commands.changeDates}
      setMilestones={commands.setMilestones}
      weeks={derived.weeks}
      membersSection={membersSection}
      role={role}
    />
  );
}

function renderGantt(
  { state, derived, commands }: ViewRenderCtx,
  role: MemberRole | null,
  currentUserId: string
) {
  return (
    <GanttView
      people={derived.people}
      tasks={state.tasks}
      setTasks={commands.setTasks}
      weeks={derived.weeks}
      monthGroups={derived.monthGroups}
      cats={state.cats}
      roles={state.roles}
      lanes={derived.lanes}
      numWeeks={derived.numWeeks}
      milestones={state.project.milestones}
      role={role}
      currentUserId={currentUserId}
    />
  );
}

function renderSeznam(
  { state, derived, commands }: ViewRenderCtx,
  focus: { taskId: string | null; onHandled: () => void }
) {
  return (
    <SeznamView
      focusTaskId={focus.taskId}
      onFocusHandled={focus.onHandled}
      tasks={state.tasks}
      setTasks={commands.setTasks}
      people={derived.people}
      cats={state.cats}
      setCats={commands.setCats}
      roles={state.roles}
      numWeeks={derived.numWeeks}
    />
  );
}

function renderKapacita(
  { state, derived, commands }: ViewRenderCtx,
  role: MemberRole | null,
  currentUserId: string,
  members: Member[]
) {
  return (
    <KapacitaView
      rawPeople={state.people}
      setRawPeople={commands.setRawPeople}
      people={derived.people}
      tasks={state.tasks}
      weeks={derived.weeks}
      monthGroups={derived.monthGroups}
      budget={state.project.budget}
      roles={state.roles}
      setRoles={commands.setRoles}
      role={role}
      currentUserId={currentUserId}
      members={members}
    />
  );
}

function renderRizika(
  { state, derived, commands }: ViewRenderCtx,
  role: MemberRole | null,
  projectId: string
) {
  return (
    <RizikaView
      risks={state.risks}
      setRisks={commands.setRisks}
      opps={state.opps}
      setOpps={commands.setOpps}
      project={state.project}
      updateProject={commands.updateProject}
      people={derived.people}
      tasks={state.tasks}
      weeks={derived.weeks}
      roles={state.roles}
      role={role}
      overallProgress={derived.overallProgress}
      projectId={projectId}
    />
  );
}

interface AdoRenderCtx {
  state: AppState;
  derived: ProjectDerivedData;
  ado: UseAdoSyncResult;
  role: MemberRole | null;
  isOffline: boolean;
}

function renderAdo({ state, derived, ado, role, isOffline }: AdoRenderCtx) {
  return (
    <AdoSyncView
      ado={ado}
      adoConfig={state.adoConfig}
      adoSyncLog={state.adoSyncLog}
      tasks={state.tasks}
      people={derived.people}
      cats={state.cats}
      numWeeks={derived.numWeeks}
      role={role}
      isOffline={isOffline}
    />
  );
}

function renderTodo({ state, commands }: ViewRenderCtx) {
  return (
    <TodoView
      reminders={state.reminders}
      setReminders={commands.setReminders}
      todos={state.todos}
      setTodos={commands.setTodos}
    />
  );
}

export function AppViews({
  view,
  state,
  derived,
  commands,
  isOffline,
  ado,
  role,
  currentUserId,
  projectId,
  focusTask,
}: AppViewsProps) {
  const ctx: ViewRenderCtx = { state, derived, commands };
  // Nabídka účtů pro Kapacitu (FR-ROLE-07). Členství je REST zdroj pravdy, do
  // `AppState` nepatří; seznam se obnoví při každém příchodu na záložku, aby
  // v nabídce byl i člen přidaný až po otevření projektu.
  const members = useProjectMemberList(projectId, view === 'kapacita');

  switch (view) {
    case 'projekt':
      return renderProjekt(
        ctx,
        <ProjectMembersSection projectId={projectId} role={role} currentUserId={currentUserId} />,
        role
      );
    case 'gantt':
      return renderGantt(ctx, role, currentUserId);
    case 'seznam':
      return renderSeznam(ctx, focusTask);
    case 'kapacita':
      return renderKapacita(ctx, role, currentUserId, members);
    case 'rizika':
      return renderRizika(ctx, role, projectId);
    case 'ado':
      return renderAdo({ state, derived, ado, role, isOffline });
    case 'soubory':
      return (
        <SouboryView
          files={state.files}
          projectId={projectId}
          fileCommands={commands}
          role={role}
          isOffline={isOffline}
        />
      );
    case 'todo':
      return renderTodo(ctx);
    case 'kb':
      return (
        <KnowledgeBaseView
          kbPages={state.kbPages}
          setKbPages={commands.setKbPages}
          projectId={projectId}
        />
      );
  }
}
