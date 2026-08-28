// Seznam záznamů trezoru — FR-VAULT-06, FR-VAULT-07.
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { VaultEntryList } from './VaultEntryList';
import type { VaultEntry } from '../../hooks/useVault';

const entry = (overrides: Partial<VaultEntry> = {}): VaultEntry => ({
  id: 'e1',
  title: 'Testovací server',
  username: 'svc_test',
  password: 'Tajne123',
  url: 'https://test.firma.cz',
  note: '',
  updatedAt: '2026-01-01',
  ...overrides,
});

function stubClipboard() {
  const writeText = vi.fn(async () => {});
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText, readText: vi.fn(async () => 'Tajne123') },
    configurable: true,
  });
  return writeText;
}

beforeEach(() => {
  stubClipboard();
});

describe('VaultEntryList', () => {
  // @scenario: vault.feature > Heslo je ve výpisu maskované
  it('heslo není ve výpisu vidět', () => {
    render(<VaultEntryList entries={[entry()]} onEdit={vi.fn()} onDelete={vi.fn()} />);

    expect(screen.getByText('Testovací server')).toBeInTheDocument();
    expect(screen.queryByText('Tajne123')).not.toBeInTheDocument();
  });

  // @scenario: vault.feature > Zobrazení hesla na vyžádání
  it('na vyžádání heslo zobrazí a znovu skryje', async () => {
    render(<VaultEntryList entries={[entry()]} onEdit={vi.fn()} onDelete={vi.fn()} />);

    await userEvent.click(screen.getByLabelText('Zobrazit heslo — Testovací server'));
    expect(screen.getByText('Tajne123')).toBeInTheDocument();

    await userEvent.click(screen.getByLabelText('Skrýt heslo — Testovací server'));
    expect(screen.queryByText('Tajne123')).not.toBeInTheDocument();
  });

  // @scenario: vault.feature > Kopírování hesla do schránky
  it('zkopíruje heslo, aniž by ho zobrazilo', async () => {
    const writeText = stubClipboard();
    render(<VaultEntryList entries={[entry()]} onEdit={vi.fn()} onDelete={vi.fn()} />);

    await userEvent.click(screen.getByLabelText('Kopírovat heslo — Testovací server'));

    await waitFor(() => expect(writeText).toHaveBeenCalledWith('Tajne123'));
    // Kopírování nesmí být zároveň odhalení — kolem může někdo stát.
    expect(screen.queryByText('Tajne123')).not.toBeInTheDocument();
  });

  // @scenario: vault.feature > Hledání v trezoru
  it('filtruje podle názvu', async () => {
    const entries = [entry(), entry({ id: 'e2', title: 'Produkční databáze', username: 'dba' })];
    render(<VaultEntryList entries={entries} onEdit={vi.fn()} onDelete={vi.fn()} />);

    await userEvent.type(screen.getByLabelText('Hledat v trezoru'), 'produkč');

    expect(screen.getByText('Produkční databáze')).toBeInTheDocument();
    expect(screen.queryByText('Testovací server')).not.toBeInTheDocument();
  });

  it('hledá i podle uživatelského jména a URL', async () => {
    const entries = [entry(), entry({ id: 'e2', title: 'Produkční databáze', username: 'dba' })];
    render(<VaultEntryList entries={entries} onEdit={vi.fn()} onDelete={vi.fn()} />);

    await userEvent.type(screen.getByLabelText('Hledat v trezoru'), 'svc_test');

    expect(screen.getByText('Testovací server')).toBeInTheDocument();
    expect(screen.queryByText('Produkční databáze')).not.toBeInTheDocument();
  });

  // @scenario: vault.feature > Smazání záznamu
  it('smazání ohlásí volajícímu', async () => {
    const onDelete = vi.fn();
    render(<VaultEntryList entries={[entry()]} onEdit={vi.fn()} onDelete={onDelete} />);

    await userEvent.click(screen.getByLabelText('Smazat záznam — Testovací server'));

    expect(onDelete).toHaveBeenCalledWith(expect.objectContaining({ id: 'e1' }));
  });

  it('prázdný trezor to řekne', () => {
    render(<VaultEntryList entries={[]} onEdit={vi.fn()} onDelete={vi.fn()} />);

    expect(screen.getByText('Trezor je prázdný.')).toBeInTheDocument();
  });
});
