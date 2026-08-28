// Panel trezoru — PRD-09.
//
// Testuje se skládání obrazovek podle stavu; šifrování a API má vlastní testy
// (`useVault.test.ts`, `vaultCrypto.test.ts`), tady je `vault` atrapa.
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { VaultPanel } from './VaultPanel';
import type { UseVaultResult, VaultStatus } from '../../hooks/useVault';

const SETUP_WARNING = /zapomenete, obsah trezoru je nenávratně ztracen/i;

function vaultStub(status: VaultStatus, overrides: Partial<UseVaultResult> = {}): UseVaultResult {
  return {
    status,
    entries: [],
    error: null,
    create: vi.fn(async () => null),
    unlock: vi.fn(async () => null),
    lock: vi.fn(),
    save: vi.fn(async () => null),
    remove: vi.fn(async () => {}),
    changePassword: vi.fn(async () => null),
    destroy: vi.fn(async () => {}),
    touch: vi.fn(),
    ...overrides,
  };
}

describe('VaultPanel — založení', () => {
  // @scenario: vault.feature > Založení trezoru při prvním otevření
  it('bez trezoru nabídne založení a varuje před ztrátou hesla', async () => {
    const create = vi.fn(async () => null);
    render(<VaultPanel vault={vaultStub('absent', { create })} onClose={vi.fn()} />);

    // Varování patří PŘED založení, ne až do potvrzení — potom už je pozdě.
    expect(screen.getByRole('note')).toHaveTextContent(SETUP_WARNING);

    await userEvent.type(screen.getByLabelText(/heslo k trezoru/i), 'TrezorHeslo123');
    await userEvent.type(screen.getByLabelText(/potvrzení hesla/i), 'TrezorHeslo123');
    await userEvent.click(screen.getByRole('button', { name: 'Založit trezor' }));

    expect(create).toHaveBeenCalledWith('TrezorHeslo123', 'TrezorHeslo123');
  });

  // @scenario: vault.feature > Heslo k trezoru musí mít alespoň 12 znaků
  it('krátké heslo zobrazí chybu z hooku', async () => {
    const create = vi.fn(async () => 'Heslo k trezoru musí mít alespoň 12 znaků');
    render(<VaultPanel vault={vaultStub('absent', { create })} onClose={vi.fn()} />);

    await userEvent.type(screen.getByLabelText(/heslo k trezoru/i), 'kratke');
    await userEvent.type(screen.getByLabelText(/potvrzení hesla/i), 'kratke');
    await userEvent.click(screen.getByRole('button', { name: 'Založit trezor' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Heslo k trezoru musí mít alespoň 12 znaků'
    );
  });

  // @scenario: vault.feature > Potvrzení hesla se musí shodovat
  it('neshodné potvrzení zobrazí chybu', async () => {
    const create = vi.fn(async () => 'Hesla se neshodují');
    render(<VaultPanel vault={vaultStub('absent', { create })} onClose={vi.fn()} />);

    await userEvent.type(screen.getByLabelText(/heslo k trezoru/i), 'TrezorHeslo123');
    await userEvent.type(screen.getByLabelText(/potvrzení hesla/i), 'TrezorHeslo456');
    await userEvent.click(screen.getByRole('button', { name: 'Založit trezor' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Hesla se neshodují');
  });
});

describe('VaultPanel — odemčení a zamčení', () => {
  // @scenario: vault.feature > Odemčení trezoru správným heslem
  it('zamčený trezor žádá heslo a předá ho hooku', async () => {
    const unlock = vi.fn(async () => null);
    render(<VaultPanel vault={vaultStub('locked', { unlock })} onClose={vi.fn()} />);

    await userEvent.type(screen.getByLabelText('Heslo k trezoru'), 'TrezorHeslo123');
    await userEvent.click(screen.getByRole('button', { name: 'Odemknout' }));

    expect(unlock).toHaveBeenCalledWith('TrezorHeslo123');
  });

  // @scenario: vault.feature > Odemčení špatným heslem
  it('špatné heslo zobrazí hlášku a nechá trezor zamčený', async () => {
    const unlock = vi.fn(async () => 'Nesprávné heslo k trezoru');
    render(<VaultPanel vault={vaultStub('locked', { unlock })} onClose={vi.fn()} />);

    await userEvent.type(screen.getByLabelText('Heslo k trezoru'), 'SpatneHeslo999');
    await userEvent.click(screen.getByRole('button', { name: 'Odemknout' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Nesprávné heslo k trezoru');
    expect(screen.getByRole('button', { name: 'Odemknout' })).toBeInTheDocument();
  });

  // @scenario: vault.feature > Ruční zamčení trezoru
  it('tlačítko Zamknout zavolá zámek', async () => {
    const lock = vi.fn();
    render(<VaultPanel vault={vaultStub('unlocked', { lock })} onClose={vi.fn()} />);

    await userEvent.click(screen.getByRole('button', { name: 'Zamknout' }));

    expect(lock).toHaveBeenCalled();
  });
});

describe('VaultPanel — záznamy a správa trezoru', () => {
  // @scenario: vault.feature > Přidání záznamu
  it('formulář nového záznamu uloží zadané hodnoty', async () => {
    const save = vi.fn(async () => null);
    render(<VaultPanel vault={vaultStub('unlocked', { save })} onClose={vi.fn()} />);

    await userEvent.click(screen.getByRole('button', { name: '+ Nový záznam' }));
    await userEvent.type(screen.getByLabelText('Název'), 'Testovací server');
    await userEvent.type(screen.getByLabelText('Uživatelské jméno'), 'svc_test');
    await userEvent.type(screen.getByLabelText('Heslo'), 'Tajne123');
    await userEvent.type(screen.getByLabelText('URL'), 'https://test.firma.cz');
    await userEvent.click(screen.getByRole('button', { name: 'Uložit' }));

    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Testovací server',
        username: 'svc_test',
        password: 'Tajne123',
        url: 'https://test.firma.cz',
      })
    );
  });

  // @scenario: vault.feature > Název záznamu je povinný
  it('chybějící název ohlásí formulář', async () => {
    const save = vi.fn(async () => 'Název je povinný');
    render(<VaultPanel vault={vaultStub('unlocked', { save })} onClose={vi.fn()} />);

    await userEvent.click(screen.getByRole('button', { name: '+ Nový záznam' }));
    await userEvent.click(screen.getByRole('button', { name: 'Uložit' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Název je povinný');
  });

  // @scenario: vault.feature > Generátor hesel
  it('generátor vyplní pole hesla', async () => {
    render(<VaultPanel vault={vaultStub('unlocked')} onClose={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: '+ Nový záznam' }));

    await userEvent.click(screen.getByRole('button', { name: 'Generovat heslo' }));

    await userEvent.click(screen.getByLabelText('Zobrazit heslo'));
    expect((screen.getByLabelText('Heslo') as HTMLInputElement).value).toHaveLength(20);
  });

  // @scenario: vault.feature > Změna hesla k trezoru
  it('změna hesla předá obě hesla hooku', async () => {
    const changePassword = vi.fn(async () => null);
    render(<VaultPanel vault={vaultStub('unlocked', { changePassword })} onClose={vi.fn()} />);

    await userEvent.click(screen.getByRole('button', { name: 'Změnit heslo trezoru' }));
    await userEvent.type(screen.getByLabelText('Stávající heslo'), 'TrezorHeslo123');
    await userEvent.type(screen.getByLabelText(/^nové heslo/i), 'NoveTrezorHeslo456');
    await userEvent.type(screen.getByLabelText('Potvrzení nového hesla'), 'NoveTrezorHeslo456');
    await userEvent.click(screen.getByRole('button', { name: 'Změnit heslo' }));

    expect(changePassword).toHaveBeenCalledWith('TrezorHeslo123', 'NoveTrezorHeslo456');
  });

  // @scenario: vault.feature > Změna hesla trezoru se špatným stávajícím heslem
  it('špatné stávající heslo zobrazí chybu a dialog nezavře', async () => {
    const changePassword = vi.fn(async () => 'Nesprávné heslo k trezoru');
    render(<VaultPanel vault={vaultStub('unlocked', { changePassword })} onClose={vi.fn()} />);

    await userEvent.click(screen.getByRole('button', { name: 'Změnit heslo trezoru' }));
    await userEvent.type(screen.getByLabelText('Stávající heslo'), 'SpatneHeslo999');
    await userEvent.type(screen.getByLabelText(/^nové heslo/i), 'NoveTrezorHeslo456');
    await userEvent.type(screen.getByLabelText('Potvrzení nového hesla'), 'NoveTrezorHeslo456');
    await userEvent.click(screen.getByRole('button', { name: 'Změnit heslo' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Nesprávné heslo k trezoru');
    expect(screen.getByLabelText('Stávající heslo')).toBeInTheDocument();
  });

  // @scenario: vault.feature > Zrušení trezoru bez znalosti hesla
  it('zrušení ze zamčeného trezoru vyžaduje opsání slova SMAZAT', async () => {
    const destroy = vi.fn(async () => {});
    render(<VaultPanel vault={vaultStub('locked', { destroy })} onClose={vi.fn()} />);

    await userEvent.click(screen.getByRole('button', { name: /zapomněli jste heslo/i }));

    const confirm = screen.getByRole('button', { name: 'Zrušit trezor' });
    expect(confirm).toBeDisabled();

    await userEvent.type(screen.getByLabelText(/opište slovo SMAZAT/i), 'SMAZAT');
    expect(confirm).toBeEnabled();

    await userEvent.click(confirm);
    expect(destroy).toHaveBeenCalled();
  });
});
