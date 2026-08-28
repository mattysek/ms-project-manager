// Společný rám plovoucích panelů — quick-notes.feature.
//
// Smysl téhle sady je jediný: aby se poznámky a trezor znovu vizuálně
// nerozešly. Dřív byly poznámky celovýšková lišta u kraje a trezor plovoucí
// karta pod lištou, takže ve stejné aplikaci vypadaly jako dvě různé.
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { FloatingPanel } from './FloatingPanel';
import { TOP_BAR_HEIGHT } from './TopBar';
import { LAYERS } from '../constants/layers';
import { QuickNotesPanel } from './quicknotes/QuickNotesPanel';
import { VaultPanel } from './vault/VaultPanel';

function renderPanel(over: Partial<React.ComponentProps<typeof FloatingPanel>> = {}) {
  render(
    <FloatingPanel
      label="Testovací panel"
      title="🔧 Testovací panel"
      closeLabel="Zavřít testovací panel"
      onClose={vi.fn()}
      {...over}
    >
      <div>obsah panelu</div>
    </FloatingPanel>
  );
  return screen.getByRole('dialog', { name: 'Testovací panel' });
}

describe('FloatingPanel', () => {
  it('je plovoucí karta zavěšená pod horní lištou', () => {
    const panel = renderPanel();

    expect(panel.style.position).toBe('fixed');
    // Odvozeno z výšky lišty, ne opsané číslo — jinak by změna lišty panel
    // buď schovala pod ni, nebo nechala viset v mezeře.
    expect(panel.style.top).toBe(`${TOP_BAR_HEIGHT + 8}px`);
    expect(panel.style.right).toBe('14px');
    expect(panel.style.borderRadius).toBe('10px');
  });

  // @scenario: quick-notes.feature > Uživatelské menu je nad otevřeným panelem
  it('leží pod vrstvou uživatelského menu', () => {
    // Panel i menu jsou uvnitř `TopBar`, takže o pořadí rozhoduje tenhle
    // rozdíl. Když byl obrácený, panel menu překryl a položky nešly kliknout.
    const panel = renderPanel();

    expect(Number(panel.style.zIndex)).toBe(LAYERS.floatingPanel);
    expect(LAYERS.userMenu).toBeGreaterThan(LAYERS.floatingPanel);
    // A pod celoobrazovkovými modály, které panel překrýt mají.
    expect(LAYERS.modal).toBeGreaterThan(LAYERS.userMenu);
  });

  it('zavírá se křížkem s vlastním popiskem', async () => {
    const onClose = vi.fn();
    renderPanel({ onClose });

    await userEvent.click(screen.getByLabelText('Zavřít testovací panel'));

    expect(onClose).toHaveBeenCalled();
  });

  it('hlásí interakci volajícímu', async () => {
    // Trezor si tím posouvá odpočet automatického zámku (FR-VAULT-03).
    const onInteraction = vi.fn();
    renderPanel({ onInteraction });

    await userEvent.click(screen.getByText('obsah panelu'));

    expect(onInteraction).toHaveBeenCalled();
  });

  it('bez interakčního callbacku nespadne', async () => {
    renderPanel();

    await userEvent.click(screen.getByText('obsah panelu'));

    expect(screen.getByText('obsah panelu')).toBeInTheDocument();
  });
});

describe('Poznámky a trezor sdílí rám', () => {
  /** Vlastnosti rámu, které dělají „jak to vypadá". */
  const frameOf = (panel: HTMLElement) => ({
    position: panel.style.position,
    top: panel.style.top,
    right: panel.style.right,
    width: panel.style.width,
    maxHeight: panel.style.maxHeight,
    border: panel.style.border,
    borderRadius: panel.style.borderRadius,
    background: panel.style.background,
    zIndex: panel.style.zIndex,
  });

  const notesStub = {
    notes: [],
    loaded: true,
    loading: false,
    pendingCount: 0,
    isOffline: false,
    load: vi.fn(),
    createNote: vi.fn(),
    saveNote: vi.fn(),
    deleteNote: vi.fn(),
    markConverted: vi.fn(),
  } as unknown as React.ComponentProps<typeof QuickNotesPanel>['notes'];

  const vaultStub = {
    status: 'locked',
    entries: [],
    error: null,
    create: vi.fn(),
    unlock: vi.fn(),
    lock: vi.fn(),
    save: vi.fn(),
    remove: vi.fn(),
    changePassword: vi.fn(),
    destroy: vi.fn(),
    touch: vi.fn(),
  } as unknown as React.ComponentProps<typeof VaultPanel>['vault'];

  // @scenario: quick-notes.feature > Panel poznámek vypadá stejně jako trezor
  it('oba panely mají shodnou polohu, šířku i orámování', () => {
    const notes = render(
      <QuickNotesPanel
        notes={notesStub}
        projects={[]}
        canConvert={false}
        onConvert={vi.fn()}
        onClose={vi.fn()}
      />
    );
    const notesFrame = frameOf(notes.getByRole('dialog', { name: 'Quick Notes' }));
    notes.unmount();

    const vault = render(<VaultPanel vault={vaultStub} onClose={vi.fn()} />);
    const vaultFrame = frameOf(vault.getByRole('dialog', { name: 'Trezor hesel' }));

    // Kdyby někdo přestyloval jeden z panelů zvlášť, spadne tohle — o to jde.
    expect(notesFrame).toEqual(vaultFrame);
    expect(notesFrame.position).toBe('fixed');
  });

  it('oba mají v hlavičce ikonu a zavírací křížek', () => {
    const notes = render(
      <QuickNotesPanel
        notes={notesStub}
        projects={[]}
        canConvert={false}
        onConvert={vi.fn()}
        onClose={vi.fn()}
      />
    );
    expect(notes.getByText('📝 Moje poznámky')).toBeInTheDocument();
    expect(notes.getByLabelText('Zavřít poznámky')).toBeInTheDocument();
    notes.unmount();

    const vault = render(<VaultPanel vault={vaultStub} onClose={vi.fn()} />);
    expect(vault.getByText('🔐 Trezor hesel')).toBeInTheDocument();
    expect(vault.getByLabelText('Zavřít trezor')).toBeInTheDocument();
  });
});
