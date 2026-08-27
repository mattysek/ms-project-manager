// Seznam projektů — REST API místo `projectStorage` (ADR-005, PRD-00 Fáze 2:
// „LandingPage napojení na REST API"). Otevření projektu jen předá `projectId`
// dál — `App.tsx` se k němu připojí přes `useProjectSession` (`JoinProject`).
import { useState } from 'react';
import { useOfflineStatus } from '../hooks/useOfflineStatus';
import { NoticeBanner } from './NoticeBanner';
import { AppStyles } from './AppStyles';
import { parseImportFile } from '../utils/importExport';
import { stashPendingImport } from '../state/pendingImport';
import { useProjectsList } from './landing/useProjectsList';
import { NewProjectForm } from './landing/NewProjectForm';
import { ProjectList } from './landing/ProjectList';
import { DeleteConfirmDialog } from './landing/DeleteConfirmDialog';
import { ArchiveSection } from './landing/ArchiveSection';

interface LandingPageProps {
  onOpenProject: (projectId: string) => void;
  /** Přehled napříč projekty (PRD-08) — stojí mimo projekt, tedy i mimo záložky. */
  onOpenMyWork: () => void;
}

/**
 * Import projektu se otevírá jako nový (prázdný) projekt na serveru, do
 * kterého se hned po `full_state` pošle `full_state_import`. Parsing zůstává
 * na klientovi (ADR-005); naparsovaná data mezitím čekají v `pendingImport`
 * — `useAppLifecycleEffects` je dopošle, jakmile se naváže spojení.
 */
function importAsNewProject(
  createAndOpen: (name: string) => Promise<string | null>,
  onOpenProject: (projectId: string) => void,
  onError: (message: string) => void
): void {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json,.zip,application/json,application/zip';
  input.onchange = async (e) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    try {
      const parsed = await parseImportFile(file);
      const id = await createAndOpen(parsed.project.name || 'Importovaný projekt');
      if (!id) return;
      stashPendingImport(id, parsed);
      onOpenProject(id);
    } catch (err) {
      onError(`Import selhal: ${(err as Error).message}`);
    }
  };
  input.click();
}

/** Aktivní projekt umí jedinou akci: archivaci. Mazání je až nad archivem. */
function activeProjectActions(
  project: { id: string; name: string },
  archive: (id: string) => void
) {
  return [
    {
      label: '🗄',
      title: 'Archivovat',
      onClick: () => {
        if (confirm(`Archivovat projekt ${project.name}? Data zůstanou zachována.`)) {
          archive(project.id);
        }
      },
    },
  ];
}

/** Stav a obsluha akcí LandingPage — vytaženo, ať `LandingPage` zůstane pod rozpočtem ADR-012. */
function useLanding(onOpenProject: (projectId: string) => void) {
  const list = useProjectsList();
  const [showNewForm, setShowNewForm] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  // Chyby importu — chyby operací nad projekty hlásí `useProjectsList`.
  const [notice, setNotice] = useState<string | null>(null);
  // Před připojením k projektu ještě neexistuje SignalR kanál (ADR-004) — na
  // LandingPage má smysl jen hrubý signál z prohlížeče, ne stav spojení.
  const { isOffline } = useOfflineStatus('connected');

  const createProject = async (name: string) => {
    const id = await list.createAndOpen(name);
    if (id) {
      setShowNewForm(false);
      onOpenProject(id);
    }
  };

  // FR-OFFLINE-07: import projektu vyžaduje spojení se serverem.
  const importProject = () => {
    if (isOffline) {
      setNotice('Import projektu vyžaduje připojení k serveru');
      return;
    }
    importAsNewProject(list.createAndOpen, onOpenProject, setNotice);
  };

  return {
    list,
    isOffline,
    notice,
    dismissNotice: () => setNotice(null),
    showNewForm,
    setShowNewForm,
    deleteConfirm,
    setDeleteConfirm,
    createProject,
    importProject,
  };
}

export function LandingPage({ onOpenProject, onOpenMyWork }: LandingPageProps) {
  const ui = useLanding(onOpenProject);
  const { projects, archived, loading, error, dismissError, archive, unarchive, remove } = ui.list;
  const { isOffline, notice } = ui;

  return (
    <div
      style={{
        fontFamily: "'IBM Plex Mono','Courier New',monospace",
        background: '#0f1117',
        minHeight: '100vh',
        color: '#e2e8f0',
        padding: '40px 28px',
      }}
    >
      <AppStyles />
      <LandingStyles />

      <div style={{ maxWidth: 900, margin: '0 auto' }}>
        <Hero />

        {isOffline && <OfflineBanner />}

        {/* Blokující `alert()` nahrazený pruhem: modální dialog prohlížeče se
            nedá zavřít jinak než myší, nejde otestovat a v aplikaci, která
            jinde hlásí chyby pruhy s `role="alert"`, vypadá cizí. */}
        <NoticeBanner
          variant="card"
          message={error ?? notice}
          onDismiss={error ? dismissError : ui.dismissNotice}
        />

        <ActionButtons
          isOffline={isOffline}
          onNew={() => ui.setShowNewForm(true)}
          onImport={ui.importProject}
          onMyWork={onOpenMyWork}
        />

        {ui.showNewForm && (
          <NewProjectForm onCreate={ui.createProject} onCancel={() => ui.setShowNewForm(false)} />
        )}

        <div
          style={{
            fontSize: 10,
            color: '#64748b',
            textTransform: 'uppercase',
            letterSpacing: '0.12em',
            marginBottom: 12,
          }}
        >
          Uložené projekty ({projects.length})
        </div>

        <ProjectList
          projects={projects}
          loading={loading}
          onOpen={onOpenProject}
          actionsFor={(project) => activeProjectActions(project, archive)}
        />

        <ArchiveSection
          archived={archived}
          onOpen={onOpenProject}
          onUnarchive={unarchive}
          onRequestDelete={ui.setDeleteConfirm}
        />

        {ui.deleteConfirm && (
          <DeleteConfirmDialog
            onCancel={() => ui.setDeleteConfirm(null)}
            onConfirm={() => {
              remove(ui.deleteConfirm ?? '');
              ui.setDeleteConfirm(null);
            }}
          />
        )}
      </div>
    </div>
  );
}

function LandingStyles() {
  return (
    <style>{`
        .project-card{transition:all .15s;cursor:pointer}
        .project-card:hover{border-color:#4f9cf9!important;background:#0d1a2a!important}
      `}</style>
  );
}

function Hero() {
  return (
    <div style={{ textAlign: 'center', marginBottom: 40 }}>
      <div
        style={{
          fontSize: 32,
          fontWeight: 700,
          color: '#4f9cf9',
          marginBottom: 8,
          fontFamily: "'IBM Plex Sans',sans-serif",
        }}
      >
        📊 MS Project Manager
      </div>
      <div style={{ fontSize: 12, color: '#64748b' }}>Kapacitní plánování a správa projektů</div>
    </div>
  );
}

function OfflineBanner() {
  return (
    <div
      style={{
        background: '#2a2010',
        border: '1px solid #f59e0b55',
        borderRadius: 8,
        padding: '8px 16px',
        marginBottom: 20,
        fontSize: 11,
        color: '#fcd34d',
        textAlign: 'center',
      }}
    >
      ⚠ Offline — seznam projektů může být neaktuální. Import projektu vyžaduje připojení.
    </div>
  );
}

function ActionButtons({
  isOffline,
  onNew,
  onImport,
  onMyWork,
}: {
  isOffline: boolean;
  onNew: () => void;
  onImport: () => void;
  onMyWork: () => void;
}) {
  return (
    <div
      style={{
        display: 'flex',
        gap: 10,
        marginBottom: 24,
        justifyContent: 'center',
        flexWrap: 'wrap',
      }}
    >
      <button
        type="button"
        className="btn"
        onClick={onNew}
        style={{
          background: '#0d2210',
          borderColor: '#34d39966',
          color: '#6ee7b7',
          padding: '10px 24px',
          fontSize: 13,
        }}
      >
        + Nový projekt
      </button>
      <button
        type="button"
        className="btn"
        onClick={onImport}
        title={isOffline ? 'Import projektu vyžaduje připojení k serveru' : undefined}
        style={{
          background: '#161b27',
          borderColor: '#4f9cf944',
          color: isOffline ? '#475569' : '#93c5fd',
          padding: '10px 24px',
          fontSize: 13,
          cursor: isOffline ? 'not-allowed' : 'pointer',
        }}
      >
        ⬆ Import...
      </button>
      <button
        type="button"
        className="btn"
        onClick={onMyWork}
        style={{
          background: '#161b27',
          borderColor: '#a78bfa44',
          color: '#c4b5fd',
          padding: '10px 24px',
          fontSize: 13,
        }}
      >
        📋 Moje práce
      </button>
    </div>
  );
}
