// Přepínače panelů v horní liště — quick-notes.feature.
//
// Testuje se obojí najednou, protože o to celé jde: panely sedí na stejném
// místě, takže otevřený smí být jen jeden a z lišty musí být poznat který.
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TopBar } from './TopBar';
import { QuickNotesHost } from './quicknotes/QuickNotesHost';
import { VaultHost } from './vault/VaultHost';
import { useOpenPanel } from '../hooks/useOpenPanel';
import * as vaultApi from '../api/vaultApi';
import * as quickNotesApi from '../api/quickNotesApi';
import * as projectsApi from '../api/projectsApi';
import { useQuickNotes } from '../hooks/useQuickNotes';

vi.mock('../api/vaultApi');

const user = {
  userId: 'u1',
  userName: 'petra.kolarova',
  displayName: 'Petra Kolářová',
  isAdmin: false,
};

/** Lišta se skutečným zapojením obou panelů, jako v `AuthenticatedApp`. */
function Bar() {
  const notes = useQuickNotes();
  const panel = useOpenPanel();
  return (
    // biome-ignore lint/a11y/useValidAriaRole: `role` je prop TopBaru (MemberRole), ne ARIA role
    <TopBar
      user={user}
      role={null}
      onLogout={vi.fn()}
      onOpenAdmin={vi.fn()}
      quickNotes={
        <QuickNotesHost
          notes={notes}
          activeProjectId="p1"
          onConvert={vi.fn()}
          open={panel.open === 'notes'}
          onToggle={() => panel.toggle('notes')}
          onClose={panel.close}
        />
      }
      vault={
        <VaultHost
          open={panel.open === 'vault'}
          onToggle={() => panel.toggle('vault')}
          onClose={panel.close}
        />
      }
    />
  );
}

const notesPanel = () => screen.queryByRole('dialog', { name: 'Quick Notes' });
const vaultPanel = () => screen.queryByRole('dialog', { name: 'Trezor hesel' });
const notesButton = () => screen.getByRole('button', { name: /Poznámky/ });
const vaultButton = () => screen.getByRole('button', { name: /Trezor/ });

beforeEach(() => {
  localStorage.clear();
  vi.mocked(vaultApi.fetchProfile).mockResolvedValue({
    exists: false,
    kdf: '',
    iterations: 0,
    salt: '',
    verifier: '',
    verifierIv: '',
  });
  vi.spyOn(quickNotesApi, 'listNotes').mockResolvedValue([]);
  vi.spyOn(projectsApi, 'listProjects').mockResolvedValue([]);
});

describe('Přepínání panelů v liště', () => {
  // @scenario: quick-notes.feature > Otevřený je vždy jen jeden panel
  it('otevření trezoru zavře poznámky', async () => {
    render(<Bar />);

    await userEvent.click(notesButton());
    expect(notesPanel()).toBeInTheDocument();

    await userEvent.click(vaultButton());

    // Přesně ten stav, který se dřív překrýval.
    expect(await screen.findByRole('dialog', { name: 'Trezor hesel' })).toBeInTheDocument();
    expect(notesPanel()).not.toBeInTheDocument();
  });

  it('otevření poznámek zavře trezor', async () => {
    render(<Bar />);
    await userEvent.click(vaultButton());
    expect(vaultPanel()).toBeInTheDocument();

    await userEvent.click(notesButton());

    expect(await screen.findByRole('dialog', { name: 'Quick Notes' })).toBeInTheDocument();
    expect(vaultPanel()).not.toBeInTheDocument();
  });

  it('nikdy nejsou vidět oba naráz', async () => {
    render(<Bar />);

    await userEvent.click(notesButton());
    await userEvent.click(vaultButton());
    await userEvent.click(notesButton());

    expect(screen.getAllByRole('dialog')).toHaveLength(1);
  });

  // @scenario: quick-notes.feature > Tlačítko v liště ukazuje, který panel je otevřený
  it('aktivní je vždy nanejvýš jedno tlačítko', async () => {
    render(<Bar />);

    // Zavřeno: ani jedno.
    expect(notesButton()).toHaveAttribute('aria-pressed', 'false');
    expect(vaultButton()).toHaveAttribute('aria-pressed', 'false');

    await userEvent.click(notesButton());
    expect(notesButton()).toHaveAttribute('aria-pressed', 'true');
    expect(vaultButton()).toHaveAttribute('aria-pressed', 'false');

    await userEvent.click(vaultButton());
    expect(vaultButton()).toHaveAttribute('aria-pressed', 'true');
    expect(notesButton()).toHaveAttribute('aria-pressed', 'false');
  });

  it('aktivní tlačítko je odlišené i barvou, nejen atributem', async () => {
    render(<Bar />);
    const closed = notesButton().style.borderColor;

    await userEvent.click(notesButton());

    expect(notesButton().style.borderColor).not.toBe(closed);
  });

  it('zavření panelu zhasne i tlačítko', async () => {
    render(<Bar />);
    await userEvent.click(notesButton());

    await userEvent.click(screen.getByLabelText('Zavřít poznámky'));

    expect(notesPanel()).not.toBeInTheDocument();
    expect(notesButton()).toHaveAttribute('aria-pressed', 'false');
  });
});
