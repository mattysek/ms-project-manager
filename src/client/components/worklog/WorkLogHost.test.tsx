// Panel výkazů v horní liště — PRD-10, FR-WL-10.
//
// Panel sedí ve `TopBar` ze stejného důvodu jako poznámky a trezor: lišta je
// jediné místo, které vidí LandingPage i otevřený projekt. Panely tři jsou
// na stejné pozici, takže otevřený smí být jen jeden.
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WorkLogHost } from './WorkLogHost';
import { VaultHost } from '../vault/VaultHost';
import { TopBar } from '../TopBar';
import * as vaultApi from '../../api/vaultApi';
import { useOpenPanel } from '../../hooks/useOpenPanel';
import { entry, mockWorkLog } from './worklogHarness';

vi.mock('../../api/vaultApi');

const user = {
  userId: 'u1',
  userName: 'petra.kolarova',
  displayName: 'Petra Kolářová',
  isAdmin: false,
};

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
});

/**
 * Lišta bez otevřeného projektu, se skutečným zapojením výkazů i trezoru.
 *
 * `role` je tady doménová prop (`MemberRole`), ne ARIA atribut; Biome to
 * u literálu `null` nerozezná a hlásí `useValidAriaRole`.
 */
function LandingTopBar() {
  const panel = useOpenPanel();
  return (
    // biome-ignore lint/a11y/useValidAriaRole: `role` je prop TopBaru (MemberRole), ne ARIA role
    <TopBar
      user={user}
      role={null}
      onLogout={vi.fn()}
      onOpenAdmin={vi.fn()}
      quickNotes={null}
      vault={
        <VaultHost
          open={panel.open === 'vault'}
          onToggle={() => panel.toggle('vault')}
          onClose={panel.close}
        />
      }
      worklog={
        <WorkLogHost
          open={panel.open === 'worklog'}
          onToggle={() => panel.toggle('worklog')}
          onClose={panel.close}
          onOpenFull={vi.fn()}
        />
      }
    />
  );
}

describe('panel výkazů v liště', () => {
  // @scenario: worklog.feature > Panel výkazů se otevírá z horní lišty
  it('otevře se z lišty i bez otevřeného projektu', async () => {
    mockWorkLog();
    render(<LandingTopBar />);

    await userEvent.click(screen.getByRole('button', { name: 'Výkazy práce' }));

    // Stejný rám (`FloatingPanel`) jako poznámky a trezor — dialog s vlastním
    // přístupným jménem.
    expect(await screen.findByRole('dialog', { name: 'Výkazy práce' })).toBeInTheDocument();
    expect(screen.getByLabelText('Co teď děláš?')).toBeInTheDocument();
  });

  // @scenario: worklog.feature > Otevřený je vždy jen jeden panel ze tří
  it('otevření trezoru zavře výkazy', async () => {
    mockWorkLog();
    render(<LandingTopBar />);

    await userEvent.click(screen.getByRole('button', { name: 'Výkazy práce' }));
    expect(await screen.findByRole('dialog', { name: 'Výkazy práce' })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Trezor — zamčený' }));

    expect(await screen.findByRole('dialog', { name: 'Trezor hesel' })).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: 'Výkazy práce' })).not.toBeInTheDocument();
  });

  // @scenario: worklog.feature > Tlačítko v liště ukazuje běžící čas i se zavřeným panelem
  it('běžící čas je na tlačítku vidět i se zavřeným panelem', async () => {
    const running = entry({
      id: 'r',
      title: 'Ladění importu',
      startedAt: new Date(Date.now() - 45 * 60_000).toISOString(),
      endedAt: undefined,
    });
    mockWorkLog({ running });
    render(<LandingTopBar />);

    // Zapomenuté stopky jsou nejčastější způsob, jak si člověk rozbije data —
    // schovat je za jedno kliknutí by tomu jen pomohlo.
    const button = await screen.findByRole('button', {
      name: 'Výkazy — běží Ladění importu, 0:45',
    });
    expect(button).toHaveTextContent('0:45');
    expect(screen.queryByRole('dialog', { name: 'Výkazy práce' })).not.toBeInTheDocument();
  });

  it('stop v panelu zastaví běžící činnost', async () => {
    const running = entry({
      id: 'r',
      title: 'Ladění importu',
      startedAt: new Date(Date.now() - 10 * 60_000).toISOString(),
      endedAt: undefined,
    });
    const api = mockWorkLog({ running });
    render(<LandingTopBar />);

    await userEvent.click(await screen.findByRole('button', { name: /^Výkazy — běží/ }));
    await userEvent.click(await screen.findByRole('button', { name: '⏹ Stop' }));

    await waitFor(() => expect(api.stop).toHaveBeenCalledTimes(1));
    // Čas ukončení posílá klient (ADR-017) — je to okamžik kliknutí.
    expect(typeof api.stop.mock.calls[0][0]).toBe('string');
    expect(await screen.findByLabelText('Co teď děláš?')).toBeInTheDocument();
  });
});
