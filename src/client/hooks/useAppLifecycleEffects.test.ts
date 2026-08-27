// Dopsání odloženého importu z LandingPage (project-management.feature).
//
// LandingPage parsuje soubor na klientovi (ADR-005), založí prázdný projekt
// přes REST a naparsovaná data odloží (`pendingImport`); dopošle je tenhle
// hook po prvním `full_state`.
import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as attachments from '../state/importAttachments';
import { stashPendingImport } from '../state/pendingImport';
import { makeAppState } from '../state/testFixtures';
import { useAppLifecycleEffects } from './useAppLifecycleEffects';
import type { ProjectCommand } from '../types/protocol';

const PROJECT_ID = 'p1';

function pendingImport(files: unknown[]) {
  const state = makeAppState();
  // Přes `stashPendingImport`, ne přímo do `sessionStorage`: obsah příloh se
  // tam schválně nedostane (kvóta úložiště, viz `pendingImport.ts`).
  stashPendingImport(PROJECT_ID, {
    project: state.project,
    people: state.people,
    tasks: state.tasks,
    cats: state.cats,
    roles: state.roles,
    risks: [],
    opps: [],
    files,
    reminders: [],
    todos: [],
    kbPages: [],
    adoConfig: null,
    adoSyncLog: [],
  } as never);
}

function renderLifecycle() {
  const dispatched: ProjectCommand[] = [];
  const warnings: string[] = [];
  renderHook(() =>
    useAppLifecycleEffects({
      currentProjectId: PROJECT_ID,
      view: 'projekt',
      state: makeAppState(),
      fullStateVersion: 1,
      sendPresence: vi.fn(),
      dispatch: (command) => dispatched.push(command),
      onImportWarning: (message) => warnings.push(message),
    })
  );
  return { dispatched, warnings };
}

afterEach(() => {
  sessionStorage.clear();
  vi.restoreAllMocks();
});

describe('useAppLifecycleEffects — odložený import', () => {
  // @scenario: project-management.feature > Import projektu z ZIP souboru
  it('přílohy jdou mimo full_state_import a nahrají se přes REST', async () => {
    // `ImportedFile` nemá `addedBy`, které je na serveru povinné pole `FileRef`.
    // Dokud přílohy jezdily uvnitř stavu, neshodilo to „jen přílohy" — celý
    // command se odmítl na vazbě argumentů a z celého ZIPu se neuložilo nic.
    const upload = vi.spyOn(attachments, 'uploadImported').mockResolvedValue([]);
    pendingImport([
      { id: 'f1', name: 'smlouva.pdf', mimeType: 'application/pdf', size: 10, addedAt: '', note: '', content: '' },
    ]);

    const { dispatched } = renderLifecycle();

    const command = dispatched.find((c) => c.type === 'full_state_import');
    expect(command).toBeDefined();
    expect(command && 'state' in command && command.state.files).toEqual([]);

    await waitFor(() => expect(upload).toHaveBeenCalledTimes(1));
    expect(upload.mock.calls[0][1]).toHaveLength(1);
  });

  it('neúspěšné nahrání přílohy se ohlásí', async () => {
    vi.spyOn(attachments, 'uploadImported').mockResolvedValue(['smlouva.pdf']);
    pendingImport([
      { id: 'f1', name: 'smlouva.pdf', mimeType: 'application/pdf', size: 10, addedAt: '', note: '', content: '' },
    ]);

    const { warnings } = renderLifecycle();

    await waitFor(() => expect(warnings).toHaveLength(1));
    expect(warnings[0]).toContain('smlouva.pdf');
  });

  it('bez čekajícího importu se nic neposílá', () => {
    const { dispatched } = renderLifecycle();
    expect(dispatched.some((c) => c.type === 'full_state_import')).toBe(false);
  });

  // `adoConfig: null` je neplatný vstup (`WithSkippableOptionFields`) — musí
  // z payloadu úplně zmizet, ne se poslat jako null.
  it('projekt bez ADO nemá v payloadu klíč adoConfig', () => {
    pendingImport([]);
    const { dispatched } = renderLifecycle();

    const command = dispatched.find((c) => c.type === 'full_state_import');
    expect(command && 'state' in command && 'adoConfig' in command.state).toBe(false);
  });
});
