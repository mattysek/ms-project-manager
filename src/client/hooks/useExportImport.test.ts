// Testy useExportImport — export/import otevřeného projektu (ADR-005, FR-OFFLINE-07).
import { act, renderHook } from '@testing-library/react';
import JSZip from 'jszip';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { makeAppState, makeFileRef } from '../state/testFixtures';
import { useExportImport } from './useExportImport';

/** Zachytí obsah a název souboru, který by se jinak stáhl (`<a download>` + Blob). */
function captureDownloadedJSON(): { get: () => string | null; filename: () => string | null } {
  let captured: string | null = null;
  let filename: string | null = null;
  const OriginalBlob = globalThis.Blob;
  vi.spyOn(globalThis, 'Blob').mockImplementation((parts?: BlobPart[]) => {
    captured = (parts?.[0] as string) ?? null;
    return new OriginalBlob(parts);
  });
  URL.createObjectURL = vi.fn().mockReturnValue('blob:mock');
  URL.revokeObjectURL = vi.fn();
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
    this: HTMLAnchorElement
  ) {
    filename = this.download;
  });
  return { get: () => captured, filename: () => filename };
}

/** Jen jméno staženého souboru — na rozdíl od `captureDownloadedJSON` nechává `Blob`/`URL` beze změny, protože ZIP test čte obsah přes `JSZip.prototype.file` spy, ne přes dekódování skutečného Blobu (jsdom zatím `Blob.prototype.arrayBuffer/text` neimplementuje). */
function captureDownloadFilename(): () => string | null {
  URL.createObjectURL = vi.fn().mockReturnValue('blob:mock');
  URL.revokeObjectURL = vi.fn();
  let filename: string | null = null;
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
    this: HTMLAnchorElement
  ) {
    filename = this.download;
  });
  return () => filename;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useExportImport — export (offline watermark, FR-OFFLINE-07)', () => {
  // @scenario: offline.feature > Export projektu funguje offline
  it('offline export vloží watermark do JSON, ale stáhne soubor jako normálně', async () => {
    const downloaded = captureDownloadedJSON();
    const state = makeAppState({ files: [] });
    const { result } = renderHook(() => useExportImport({ state, isOffline: true }));

    await act(async () => {
      await result.current.exportProject();
    });

    expect(downloaded.get()).toContain('Exportováno v offline režimu');
  });

  it('online export nevkládá watermark', async () => {
    const downloaded = captureDownloadedJSON();
    const state = makeAppState({ files: [] });
    const { result } = renderHook(() => useExportImport({ state, isOffline: false }));

    await act(async () => {
      await result.current.exportProject();
    });

    expect(downloaded.get()).not.toContain('offline režimu');
  });
});

describe('useExportImport — export bez příloh (project-management.feature)', () => {
  // @scenario: project-management.feature > Export projektu bez příloh jako JSON
  it('bez souborů stáhne .json obsahující tasks/people/risks/milestones/kb/todos, bez ADO PAT', async () => {
    const downloaded = captureDownloadedJSON();
    const state = makeAppState({ files: [] });
    const { result } = renderHook(() => useExportImport({ state, isOffline: false }));

    await act(async () => {
      await result.current.exportProject();
    });

    expect(downloaded.filename()).toMatch(/\.json$/);
    const parsed = JSON.parse(downloaded.get() ?? '{}');
    expect(parsed).toMatchObject({
      tasks: state.tasks,
      people: state.people,
      risks: state.risks,
      reminders: state.reminders,
      todos: state.todos,
      kbPages: state.kbPages,
    });
    expect(parsed.project.milestones).toEqual(state.project.milestones);
    expect(JSON.stringify(parsed)).not.toContain('_pat');
  });
});

vi.mock('../api/filesApi', () => ({
  // Obsah příloh leží po ADR-010 na serveru — export si ho stahuje.
  fetchFileBlob: vi.fn(async (fileId: string) => new Blob([`obsah-${fileId}`])),
}));

describe('useExportImport — export se soubory jako ZIP (project-management.feature)', () => {
  // @scenario: project-management.feature > Export projektu se soubory jako ZIP
  it('s přílohami stáhne .zip s project.json a složkou files/ obsahující všechny soubory', async () => {
    const filename = captureDownloadFilename();
    const fileSpy = vi.spyOn(JSZip.prototype, 'file');
    const folderSpy = vi.spyOn(JSZip.prototype, 'folder');
    const files = [
      makeFileRef({
        id: 'f1',
        name: 'specifikace.pdf',
        mimeType: 'application/pdf',
      }),
      makeFileRef({
        id: 'f2',
        name: 'plan.xlsx',
        mimeType: 'application/vnd.ms-excel',
      }),
      makeFileRef({
        id: 'f3',
        name: 'diagram.png',
        mimeType: 'image/png',
      }),
    ];
    const state = makeAppState({ files });
    const { result } = renderHook(() => useExportImport({ state, isOffline: false }));

    await act(async () => {
      await result.current.exportProject();
    });

    expect(filename()).toMatch(/\.zip$/);

    // `project.json` s metadaty projektu — přes stejný `JSZip.prototype.file`
    // spy, který zachytí i zápisy do složky `files/` (JSZip `.folder(...)`
    // vrací instanci se stejným prototypem, takže spy zachytí obojí).
    const projectJsonCall = fileSpy.mock.calls.find(([path]) => path === 'project.json');
    if (!projectJsonCall) throw new Error('project.json nebyl zapsán do ZIPu');
    const projectJson = JSON.parse(String(projectJsonCall[1]));
    expect(projectJson.project).toEqual(state.project);

    expect(folderSpy).toHaveBeenCalledWith('files');

    // `.folder('files').file(...)` volá `JSZip.prototype.file` na instanci se
    // zúženým rootem — cesta relativní k `files/` je zaznamenaná bez prefixu,
    // prefix JSZip doplní až při `generateAsync`.
    const filePaths = fileSpy.mock.calls
      .map(([path]) => path)
      .filter((p): p is string => typeof p === 'string');
    expect(filePaths).toContain('f1_specifikace.pdf');
    expect(filePaths).toContain('f2_plan.xlsx');
    expect(filePaths).toContain('f3_diagram.png');
  });
});
