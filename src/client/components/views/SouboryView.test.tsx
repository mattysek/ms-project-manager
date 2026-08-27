// Testy SouboryView — scénáře `docs/features/files.feature`.
//
// Po migraci na ADR-010 je obsah souboru na serveru: upload jde přes
// `POST /api/projects/{id}/files`, náhled a stažení přes `GET /api/files/{id}`.
// Testy proto mockují `src/api/filesApi.ts`, ne `FileRef.data` — ten už
// neexistuje.
//
// Poznámka k souboru je obyčejný text, takže jde běžným command kanálem
// (`update_file_note`); harness ji aplikuje do lokálního stavu stejně, jako by
// to udělal `applyDiff` po odpovědi serveru.
import { fireEvent, render, screen } from '@testing-library/react';
import mammoth from 'mammoth';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import * as XLSX from 'xlsx';
import { makeFileRef } from '../../state/testFixtures';
import type { FileRef } from '../../types';
import type { MemberRole } from '../../types/protocol';
import { SouboryView } from './SouboryView';
import * as filesApi from '../../api/filesApi';

vi.mock('../../api/filesApi', async (importOriginal) => {
  const actual = await importOriginal<typeof filesApi>();
  return {
    ...actual,
    uploadFile: vi.fn(),
    fetchFileArrayBuffer: vi.fn(),
    fetchFileText: vi.fn(),
    fetchFileBlob: vi.fn(),
    deleteFile: vi.fn(),
    inlinePreviewUrl: (fileId: string) => `/api/files/${fileId}`,
  };
});

vi.mock('mammoth', () => {
  const convertToHtml = vi.fn();
  // `mammoth` je CJS balíček — pod `esModuleInterop` může default import
  // směřovat buď na `.default`, nebo na modul samotný, podle transformu.
  return { default: { convertToHtml }, convertToHtml };
});

const PROJECT_ID = 'p1';

/**
 * Drží `files` tak, jak by je držel `AppState`: upload/mazání přes
 * `addFileLocally`/`removeFileLocally`, poznámka přes command, který se
 * projeví, až když ho harness aplikuje (odpovídá `file_note_updated` diffu).
 */
function Harness({ initialFiles = [] as FileRef[], role = 'pm' as MemberRole, isOffline = false }) {
  const [files, setFiles] = useState<FileRef[]>(initialFiles);

  return (
    <SouboryView
      files={files}
      projectId={PROJECT_ID}
      role={role}
      isOffline={isOffline}
      fileCommands={{
        updateFileNote: (fileId, note) =>
          setFiles((prev) => prev.map((f) => (f.id === fileId ? { ...f, note } : f))),
        addFileLocally: (file) => setFiles((prev) => [...prev, file]),
        removeFileLocally: (fileId) => setFiles((prev) => prev.filter((f) => f.id !== fileId)),
      }}
    />
  );
}

function renderSoubory(initialFiles: FileRef[] = [], role: MemberRole = 'pm'): void {
  render(<Harness initialFiles={initialFiles} role={role} />);
}

/** Drop zóna nemá vlastní accessible name — text uvnitř je přímé dítě. */
function dropZone(): HTMLElement {
  const el = screen.getByText('Přetáhněte soubory sem nebo klikněte pro výběr').parentElement;
  if (!el) throw new Error('Drop zóna nenalezena — zkontroluj strukturu SouboryView.');
  return el;
}

/** `FileRef` bez obsahu — server po ADR-010 vrací jen metadata. */
function uploaded(name: string, mimeType: string, id = name): FileRef {
  return makeFileRef({ id, name, mimeType });
}

/** Odpověď `POST /api/projects/{id}/files`. */
function uploadResult(file: FileRef) {
  return { file, totalSize: file.size };
}

describe('SouboryView — offline (FR-OFFLINE-07)', () => {
  // @scenario: offline.feature > Upload souborů je zakázán při offline
  it('při offline je drop zóna neaktivní se zprávou "Upload souborů vyžaduje připojení"', () => {
    render(<Harness isOffline={true} />);

    expect(screen.getByText('Upload souborů vyžaduje připojení')).toBeInTheDocument();
  });

  it('online zobrazuje standardní výzvu k přetažení souborů', () => {
    render(<Harness isOffline={false} />);

    expect(screen.getByText('Přetáhněte soubory sem nebo klikněte pro výběr')).toBeInTheDocument();
  });
});

// ── Upload ───────────────────────────────────────────────────────────────────

describe('SouboryView — upload', () => {
  // @scenario: files.feature > Upload souboru přes drag-and-drop
  it('přetažení souboru ho pošle na server a zóna během přetahování zobrazí feedback', async () => {
    vi.mocked(filesApi.uploadFile).mockResolvedValue(
      uploadResult(uploaded('diagram-architektury.png', 'image/png'))
    );
    renderSoubory();
    const zone = dropZone();
    const file = new File(['obsah'], 'diagram-architektury.png', { type: 'image/png' });
    const dataTransfer = { files: [file] };

    fireEvent.dragOver(zone, { dataTransfer });
    expect(screen.getByText('Pusťte soubory zde...')).toBeInTheDocument();

    fireEvent.drop(zone, { dataTransfer });

    expect(await screen.findByText('diagram-architektury.png')).toBeInTheDocument();
    // Obsah jde na server, ne do stavu projektu (ADR-010).
    expect(filesApi.uploadFile).toHaveBeenCalledWith(PROJECT_ID, file);
  });

  // @scenario: files.feature > Upload více souborů najednou
  it('výběr 3 souborů najednou nahraje všechny a zachová pořadí uploadu', async () => {
    const names = ['specifikace-api.pdf', 'kapacitni-plan.xlsx', 'diagram-architektury.png'];
    const types = [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'image/png',
    ];
    vi.mocked(filesApi.uploadFile).mockImplementation(async (_projectId, file) =>
      uploadResult(uploaded(file.name, file.type))
    );
    renderSoubory();

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const files = names.map((name, i) => new File(['x'], name, { type: types[i] }));

    fireEvent.change(input, { target: { files } });
    await screen.findByText('diagram-architektury.png');

    const shown = screen
      .getAllByText(/specifikace-api\.pdf|kapacitni-plan\.xlsx|diagram-architektury\.png/)
      .map((el) => el.textContent);
    expect(shown).toEqual(names);
  });

  it('chybu ze serveru zobrazí uživateli a soubor do seznamu nepřidá', async () => {
    vi.mocked(filesApi.uploadFile).mockRejectedValue(
      new Error('Soubor je větší než povolených 25 MB')
    );
    renderSoubory();

    fireEvent.drop(dropZone(), {
      dataTransfer: { files: [new File(['x'], 'velky.pdf', { type: 'application/pdf' })] },
    });

    expect(await screen.findByText(/25 MB/)).toBeInTheDocument();
    expect(screen.queryByText('velky.pdf')).not.toBeInTheDocument();
  });
});

// ── Preview ──────────────────────────────────────────────────────────────────

describe('SouboryView — preview souborů', () => {
  // @scenario: files.feature > Preview obrázku (PNG/JPEG)
  it('zobrazí preview obrázku přiblížený na čitelnou velikost', () => {
    renderSoubory([uploaded('diagram-architektury.png', 'image/png', 'f1')]);

    fireEvent.click(screen.getByTitle('Zobrazit náhled'));

    const img = screen.getByAltText('diagram-architektury.png') as HTMLImageElement;
    expect(img.src).toContain('/api/files/f1');
    expect(img).toHaveStyle({ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' });
  });

  // @scenario: files.feature > Preview PDF souboru
  it('zobrazí PDF viewer přes celou výšku (scrollování řeší nativní viewer v iframe)', () => {
    renderSoubory([uploaded('specifikace-api.pdf', 'application/pdf', 'f1')]);

    fireEvent.click(screen.getByTitle('Zobrazit náhled'));

    const iframe = screen.getByTitle('specifikace-api.pdf') as HTMLIFrameElement;
    expect(iframe.src).toContain('/api/files/f1');
    expect(iframe).toHaveStyle({ width: '100%', height: '100%' });
  });

  // @scenario: files.feature > Preview Excel souboru (XLSX)
  it('zobrazí tabulku dat z prvního listu a umožní přepnout list', async () => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.aoa_to_sheet([
        ['Sloupec A', 'Sloupec B'],
        ['1', '2'],
      ]),
      'List1'
    );
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Jiná data']]), 'List2');
    const buffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer;
    vi.mocked(filesApi.fetchFileArrayBuffer).mockResolvedValue(buffer);

    renderSoubory([
      uploaded(
        'kapacitni-plan.xlsx',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'f1'
      ),
    ]);

    fireEvent.click(screen.getByTitle('Zobrazit náhled'));

    expect(await screen.findByText('Sloupec A')).toBeInTheDocument();
    expect(screen.getByText('Sloupec B')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'List2' }));
    expect(await screen.findByText('Jiná data')).toBeInTheDocument();
    expect(screen.queryByText('Sloupec A')).not.toBeInTheDocument();
  });

  // @scenario: files.feature > Preview Word souboru (DOCX)
  it('zobrazí obsah Word dokumentu jako HTML (mammoth konverze)', async () => {
    // `restoreMocks: true` resetuje implementaci před KAŽDÝM testem, proto se
    // návratová hodnota nastavuje tady, ne ve `vi.mock` factory.
    vi.mocked(mammoth.convertToHtml).mockResolvedValue({
      value: '<p>Obsah dokumentu</p>',
      messages: [],
    });
    vi.mocked(filesApi.fetchFileArrayBuffer).mockResolvedValue(new ArrayBuffer(8));

    renderSoubory([
      uploaded(
        'technicka-dokumentace.docx',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'f1'
      ),
    ]);

    fireEvent.click(screen.getByTitle('Zobrazit náhled'));

    expect(await screen.findByText('Obsah dokumentu')).toBeInTheDocument();
  });
});

// ── Poznámky ─────────────────────────────────────────────────────────────────

describe('SouboryView — editace poznámky', () => {
  // @scenario: files.feature > Editace poznámky k souboru (PM)
  it('zadání a uložení poznámky ji zobrazí pod názvem souboru', () => {
    renderSoubory([uploaded('diagram-architektury.png', 'image/png', 'f1')]);

    fireEvent.click(screen.getByTitle('Upravit poznámku'));
    fireEvent.change(screen.getByPlaceholderText('Poznámka...'), {
      target: { value: 'Architekturální diagram z designu session 10.8.2026' },
    });
    fireEvent.click(screen.getByText('✓'));

    expect(
      screen.getByText('Architekturální diagram z designu session 10.8.2026')
    ).toBeInTheDocument();
  });

  // @scenario: files.feature > Dev může editovat poznámku k vlastnímu souboru
  it('Dev může editovat poznámku k souboru, který sám uploadoval', () => {
    // Vlastnictví hlídá server podle `addedBy` (FR-ROLE-01: Dev jen vlastní);
    // tady se ověřuje, že mu UI editaci vlastního souboru nebrání.
    renderSoubory([uploaded('moje-analyza.pdf', 'application/pdf', 'f2')], 'dev');

    fireEvent.click(screen.getByTitle('Upravit poznámku'));
    fireEvent.change(screen.getByPlaceholderText('Poznámka...'), {
      target: { value: 'Moje analýza rizik' },
    });
    fireEvent.keyDown(screen.getByPlaceholderText('Poznámka...'), { key: 'Enter' });

    expect(screen.getByText('Moje analýza rizik')).toBeInTheDocument();
  });
});

// ── Souhrn ───────────────────────────────────────────────────────────────────

describe('SouboryView — souhrn', () => {
  // @scenario: files.feature > Zobrazení celkové velikosti souborů
  it('záhlaví seznamu zobrazí celkovou velikost všech souborů', () => {
    renderSoubory([
      makeFileRef({ id: 'f1', name: 'a.pdf', size: 10_000_000 }),
      makeFileRef({ id: 'f2', name: 'b.pdf', size: 6_463_462 }),
    ]);

    expect(screen.getByText('Celkem: 15.7 MB')).toBeInTheDocument();
  });
});
