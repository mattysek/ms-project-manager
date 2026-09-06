// Překlad síťové chyby (offline.feature).
//
// `fetch` při nedostupném serveru vyhodí `TypeError: Failed to fetch` a ten
// text se bez překladu dostal až na obrazovku — u seznamu členů projektu
// stálo doslova „Failed to fetch". Odlišit ho od chyby, kterou vrátil server,
// je přitom potřeba: první znamená „zkus to za chvíli", druhá „tohle nejde".
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, NETWORK_ERROR_MESSAGE, apiRequest, isNetworkError } from './httpClient';

const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  fetchMock.mockReset();
});

/** Zachycená chyba jako `ApiError` — `catch` vrací `unknown`. */
async function failureOf(run: () => Promise<unknown>): Promise<ApiError> {
  try {
    await run();
  } catch (err) {
    return err as ApiError;
  }
  throw new Error('očekávala se chyba, ale volání prošlo');
}

describe('síťová chyba', () => {
  // @scenario: offline.feature > Chyba spojení je česky, ne hláškou prohlížeče
  it('nedostupný server dá českou hlášku a jde odlišit od odpovědi serveru', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));

    const failure = await failureOf(() => apiRequest('/api/projects'));

    expect(failure).toBeInstanceOf(ApiError);
    expect(failure.message).toBe(NETWORK_ERROR_MESSAGE);
    expect(failure.message).not.toContain('fetch');
    // `statusCode: 0` = žádná odpověď nedorazila.
    expect(isNetworkError(failure)).toBe(true);
  });

  it('odpověď serveru zůstává odpovědí serveru', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 403,
      statusText: 'Forbidden',
      text: async () => JSON.stringify({ message: 'Archivovaný projekt je jen ke čtení' }),
    });

    const failure = await failureOf(() => apiRequest('/api/projects'));

    expect(failure.message).toBe('Archivovaný projekt je jen ke čtení');
    expect(isNetworkError(failure)).toBe(false);
  });
});
