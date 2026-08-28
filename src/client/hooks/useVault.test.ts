// Trezor hesel — PRD-09, ADR-016.
//
// Krypto tu běží doopravdy (WebCrypto v jsdom), zamockovaný je jen server.
// Ověřuje se tím i to, co je na trezoru podstatné: že se na „server" dostanou
// výhradně zašifrované blobs.
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useVault, AUTO_LOCK_MS } from './useVault';
import * as vaultApi from '../api/vaultApi';
import type { EncryptedEntry, VaultProfile } from '../api/vaultApi';

vi.mock('../api/vaultApi');

const PASSWORD = 'TrezorHeslo123';
const ABSENT: VaultProfile = {
  exists: false,
  kdf: '',
  iterations: 0,
  salt: '',
  verifier: '',
  verifierIv: '',
};

/** Server, který si pamatuje, co mu klient poslal — jen jako blobs. */
function fakeServer() {
  let profile: VaultProfile = ABSENT;
  const rows: EncryptedEntry[] = [];

  vi.mocked(vaultApi.fetchProfile).mockImplementation(async () => profile);
  vi.mocked(vaultApi.createVault).mockImplementation(async (input) => {
    profile = { exists: true, ...input };
    return profile;
  });
  vi.mocked(vaultApi.listEntries).mockImplementation(async () => [...rows]);
  vi.mocked(vaultApi.createEntry).mockImplementation(async (entry) => {
    const row = {
      id: entry.id ?? 'generated',
      ciphertext: entry.ciphertext,
      iv: entry.iv,
      createdAt: '2026-01-01',
      updatedAt: '2026-01-01',
    };
    rows.push(row);
    return row;
  });
  vi.mocked(vaultApi.updateEntry).mockImplementation(async (id, entry) => {
    const index = rows.findIndex((row) => row.id === id);
    rows[index] = { ...rows[index], ciphertext: entry.ciphertext, iv: entry.iv };
    return rows[index];
  });
  vi.mocked(vaultApi.deleteEntry).mockImplementation(async (id) => {
    rows.splice(
      rows.findIndex((row) => row.id === id),
      1
    );
  });
  vi.mocked(vaultApi.deleteVault).mockImplementation(async () => {
    profile = ABSENT;
    rows.length = 0;
  });
  vi.mocked(vaultApi.rekeyVault).mockImplementation(async (input, entries) => {
    profile = { exists: true, ...input };
    rows.length = 0;
    for (const entry of entries) {
      rows.push({
        id: entry.id ?? 'generated',
        ciphertext: entry.ciphertext,
        iv: entry.iv,
        createdAt: '2026-01-01',
        updatedAt: '2026-01-01',
      });
    }
    return profile;
  });

  return { rows };
}

const draft = (overrides: Partial<{ id: string; title: string; password: string }> = {}) => ({
  id: 'e1',
  title: 'Testovací server',
  username: 'svc_test',
  password: 'Tajne123',
  url: 'https://test.firma.cz',
  note: '',
  ...overrides,
});

/** Trezor založený a odemčený — výchozí situace většiny scénářů. */
async function unlockedVault() {
  const view = renderHook(() => useVault());
  await waitFor(() => expect(view.result.current.status).toBe('absent'));
  await act(async () => {
    await view.result.current.create(PASSWORD, PASSWORD);
  });
  return view;
}

beforeEach(() => {
  fakeServer();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useVault — založení a odemčení', () => {
  // @scenario: vault.feature > Založení trezoru při prvním otevření
  it('založí trezor a rovnou ho odemkne', async () => {
    const view = await unlockedVault();

    expect(view.result.current.status).toBe('unlocked');
    expect(view.result.current.entries).toEqual([]);
  });

  // @scenario: vault.feature > Heslo k trezoru musí mít alespoň 12 znaků
  it('odmítne krátké heslo a trezor nezaloží', async () => {
    const view = renderHook(() => useVault());
    await waitFor(() => expect(view.result.current.status).toBe('absent'));

    let failure: string | null = null;
    await act(async () => {
      failure = await view.result.current.create('kratke', 'kratke');
    });

    expect(failure).toBe('Heslo k trezoru musí mít alespoň 12 znaků');
    expect(view.result.current.status).toBe('absent');
    expect(vaultApi.createVault).not.toHaveBeenCalled();
  });

  // @scenario: vault.feature > Potvrzení hesla se musí shodovat
  it('odmítne neshodné potvrzení hesla', async () => {
    const view = renderHook(() => useVault());
    await waitFor(() => expect(view.result.current.status).toBe('absent'));

    let failure: string | null = null;
    await act(async () => {
      failure = await view.result.current.create(PASSWORD, 'TrezorHeslo456');
    });

    expect(failure).toBe('Hesla se neshodují');
    expect(vaultApi.createVault).not.toHaveBeenCalled();
  });

  // @scenario: vault.feature > Odemčení trezoru správným heslem
  it('správné heslo odemkne trezor i s obsahem', async () => {
    const created = await unlockedVault();
    await act(async () => {
      await created.result.current.save(draft());
    });

    const view = renderHook(() => useVault());
    await waitFor(() => expect(view.result.current.status).toBe('locked'));
    await act(async () => {
      await view.result.current.unlock(PASSWORD);
    });

    expect(view.result.current.status).toBe('unlocked');
    expect(view.result.current.entries[0].password).toBe('Tajne123');
  });

  // @scenario: vault.feature > Odemčení špatným heslem
  it('špatné heslo trezor neodemkne a nic neprozradí', async () => {
    const created = await unlockedVault();
    await act(async () => {
      await created.result.current.save(draft());
    });

    const view = renderHook(() => useVault());
    await waitFor(() => expect(view.result.current.status).toBe('locked'));

    let failure: string | null = null;
    await act(async () => {
      failure = await view.result.current.unlock('SpatneHeslo999');
    });

    expect(failure).toBe('Nesprávné heslo k trezoru');
    expect(view.result.current.status).toBe('locked');
    expect(view.result.current.entries).toEqual([]);
  });

  it('prázdný trezor jde odemknout — ověřuje se proti verifieru, ne proti záznamům', async () => {
    await unlockedVault();

    const view = renderHook(() => useVault());
    await waitFor(() => expect(view.result.current.status).toBe('locked'));
    await act(async () => {
      await view.result.current.unlock(PASSWORD);
    });

    expect(view.result.current.status).toBe('unlocked');
  });
});

describe('useVault — zamčení', () => {
  // @scenario: vault.feature > Ruční zamčení trezoru
  it('zamčení zahodí klíč i dešifrovaný obsah', async () => {
    const view = await unlockedVault();
    await act(async () => {
      await view.result.current.save(draft());
    });

    act(() => view.result.current.lock());

    expect(view.result.current.status).toBe('locked');
    // Kdyby tu záznamy zůstaly, bylo by zamčení jen kosmetika (FR-VAULT-03).
    expect(view.result.current.entries).toEqual([]);
  });

  // @scenario: vault.feature > Automatické zamčení po nečinnosti
  it('po 15 minutách nečinnosti se zamkne sám', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const view = await unlockedVault();

    await act(async () => {
      vi.advanceTimersByTime(AUTO_LOCK_MS + 30_000);
    });

    expect(view.result.current.status).toBe('locked');
  });

  it('práce s trezorem odpočet posouvá', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const view = await unlockedVault();

    // Deset minut, dotek, dalších deset — dohromady přes limit, ale bez
    // souvislé nečinnosti, takže trezor musí zůstat otevřený.
    await act(async () => {
      vi.advanceTimersByTime(10 * 60 * 1000);
    });
    act(() => view.result.current.touch());
    await act(async () => {
      vi.advanceTimersByTime(10 * 60 * 1000);
    });

    expect(view.result.current.status).toBe('unlocked');
  });
});

describe('useVault — záznamy', () => {
  // @scenario: vault.feature > Přidání záznamu
  it('uložený záznam je po zamčení a odemčení stále čitelný', async () => {
    const view = await unlockedVault();

    await act(async () => {
      await view.result.current.save(draft());
    });

    act(() => view.result.current.lock());
    await act(async () => {
      await view.result.current.unlock(PASSWORD);
    });

    expect(view.result.current.entries).toHaveLength(1);
    expect(view.result.current.entries[0]).toMatchObject({
      title: 'Testovací server',
      username: 'svc_test',
      password: 'Tajne123',
    });
  });

  // @scenario: vault.feature > Server obsah trezoru nevidí
  it('na server jde jen zašifrovaný blob', async () => {
    const view = await unlockedVault();

    await act(async () => {
      await view.result.current.save(draft());
    });

    const sent = vi.mocked(vaultApi.createEntry).mock.calls[0][0];
    expect(JSON.stringify(sent)).not.toContain('Tajne123');
    expect(JSON.stringify(sent)).not.toContain('Testovací server');
    expect(JSON.stringify(sent)).not.toContain(PASSWORD);
  });

  // @scenario: vault.feature > Název záznamu je povinný
  it('bez názvu se záznam neuloží', async () => {
    const view = await unlockedVault();

    let failure: string | null = null;
    await act(async () => {
      failure = await view.result.current.save(draft({ title: '   ' }));
    });

    expect(failure).toBe('Název je povinný');
    expect(vaultApi.createEntry).not.toHaveBeenCalled();
  });

  // @scenario: vault.feature > Úprava záznamu
  it('úprava přepíše existující záznam, nezaloží druhý', async () => {
    const view = await unlockedVault();
    await act(async () => {
      await view.result.current.save(draft());
    });

    await act(async () => {
      await view.result.current.save({ ...draft(), username: 'svc_test2' });
    });

    expect(view.result.current.entries).toHaveLength(1);
    expect(view.result.current.entries[0].username).toBe('svc_test2');
    expect(vaultApi.updateEntry).toHaveBeenCalled();
  });

  // @scenario: vault.feature > Smazání záznamu
  it('smazaný záznam ze seznamu zmizí', async () => {
    const view = await unlockedVault();
    await act(async () => {
      await view.result.current.save(draft());
    });

    await act(async () => {
      await view.result.current.remove('e1');
    });

    expect(view.result.current.entries).toEqual([]);
  });

  it('zamčený trezor záznam neuloží', async () => {
    const view = await unlockedVault();
    act(() => view.result.current.lock());

    let failure: string | null = null;
    await act(async () => {
      failure = await view.result.current.save(draft());
    });

    expect(failure).toBe('Trezor je zamčený');
  });
});

describe('useVault — změna hesla a zrušení', () => {
  // @scenario: vault.feature > Změna hesla k trezoru
  it('po změně hesla platí nové a obsah zůstává čitelný', async () => {
    const view = await unlockedVault();
    await act(async () => {
      await view.result.current.save(draft());
    });

    await act(async () => {
      await view.result.current.changePassword(PASSWORD, 'NoveTrezorHeslo456');
    });

    const reopened = renderHook(() => useVault());
    await waitFor(() => expect(reopened.result.current.status).toBe('locked'));

    let oldPassword: string | null = null;
    await act(async () => {
      oldPassword = await reopened.result.current.unlock(PASSWORD);
    });
    expect(oldPassword).toBe('Nesprávné heslo k trezoru');

    await act(async () => {
      await reopened.result.current.unlock('NoveTrezorHeslo456');
    });
    expect(reopened.result.current.status).toBe('unlocked');
    expect(reopened.result.current.entries[0].password).toBe('Tajne123');
  });

  // @scenario: vault.feature > Změna hesla trezoru se špatným stávajícím heslem
  it('špatné stávající heslo změnu odmítne a trezor nechá být', async () => {
    const view = await unlockedVault();
    await act(async () => {
      await view.result.current.save(draft());
    });

    let failure: string | null = null;
    await act(async () => {
      failure = await view.result.current.changePassword('SpatneHeslo999', 'NoveTrezorHeslo456');
    });

    expect(failure).toBe('Nesprávné heslo k trezoru');
    expect(vaultApi.rekeyVault).not.toHaveBeenCalled();

    // Původní heslo musí dál fungovat — jinak by nepovedený pokus o změnu
    // uživatele z trezoru vyzamkl.
    const reopened = renderHook(() => useVault());
    await waitFor(() => expect(reopened.result.current.status).toBe('locked'));
    await act(async () => {
      await reopened.result.current.unlock(PASSWORD);
    });
    expect(reopened.result.current.status).toBe('unlocked');
  });

  // @scenario: vault.feature > Zrušení trezoru bez znalosti hesla
  it('zrušení smaže trezor a nabídne založení nového', async () => {
    const view = await unlockedVault();
    await act(async () => {
      await view.result.current.save(draft());
    });

    await act(async () => {
      await view.result.current.destroy();
    });

    expect(view.result.current.status).toBe('absent');
    expect(view.result.current.entries).toEqual([]);

    const reopened = renderHook(() => useVault());
    await waitFor(() => expect(reopened.result.current.status).toBe('absent'));
  });
});
