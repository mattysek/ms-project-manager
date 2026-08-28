// Dostupnost trezoru v horní liště — PRD-09, UI.
//
// Trezor sedí ve `TopBar` ze stejného důvodu jako Quick Notes (FR-QN-01):
// lišta je jediné místo, které vidí LandingPage i otevřený projekt. Kdyby žil
// uvnitř `ProjectWorkspace`, bez otevřeného projektu by nebyl kde.
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { VaultHost } from './VaultHost';
import { TopBar } from '../TopBar';
import * as vaultApi from '../../api/vaultApi';
import { useOpenPanel } from '../../hooks/useOpenPanel';

vi.mock('../../api/vaultApi');

const user = {
  userId: 'u1',
  userName: 'jan.novak',
  displayName: 'Jan Novák',
  isAdmin: false,
};

beforeEach(() => {
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
 * `TopBar` ve stavu LandingPage — žádný otevřený projekt, tedy ani role na něm.
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
    />
  );
}

// @scenario: vault.feature > Trezor je dostupný i bez otevřeného projektu
describe('VaultHost v horní liště', () => {
  it('tlačítko Trezor je v liště i bez otevřeného projektu', async () => {
    render(<LandingTopBar />);

    expect(await screen.findByRole('button', { name: /trezor/i })).toBeInTheDocument();
  });

  it('kliknutí otevře a zavře panel', async () => {
    render(<LandingTopBar />);

    await userEvent.click(await screen.findByRole('button', { name: /trezor/i }));
    expect(await screen.findByRole('dialog', { name: 'Trezor hesel' })).toBeInTheDocument();

    await userEvent.click(screen.getByLabelText('Zavřít trezor'));
    expect(screen.queryByRole('dialog', { name: 'Trezor hesel' })).not.toBeInTheDocument();
  });

  it('zamčený trezor je poznat už z lišty', async () => {
    render(<VaultHost open={false} onToggle={vi.fn()} onClose={vi.fn()} />);

    expect(await screen.findByLabelText('Trezor — zamčený')).toBeInTheDocument();
  });
});
