// Tvar požadavků na `/api/worklog` (PRD-10, ADR-017).
//
// Test existuje kvůli konkrétní chybě, kterou nechytil žádný jiný: klient
// vynechával `id`, `description` a `endedAt`, protože je má jako nepovinné.
// Na serveru jsou to ale pole typu `string | null`, ne `option`, a
// `FSharp.SystemTextJson` chybějící pole běžného typu odmítne — celé tělo se
// nenaparsovalo a „Start" mlčky nezaložil nic.
//
// Ostatní testy mají server zamockovaný, takže na to nemohly přijít. Odhalilo
// to až E2E; tohle je jeho levná náhrada pro každodenní běh.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createEntry, stopRunning, updateEntry } from './worklogApi';

const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockResolvedValue({
    ok: true,
    status: 200,
    text: async () => '{}',
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  fetchMock.mockReset();
});

function sentBody(): Record<string, unknown> {
  const [, init] = fetchMock.mock.calls[0];
  return JSON.parse(init.body as string) as Record<string, unknown>;
}

const REQUIRED_KEYS = [
  'id',
  'title',
  'description',
  'projectId',
  'startedAt',
  'endedAt',
  'tags',
] as const;

describe('tvar požadavku', () => {
  it('spuštění stopek pošle i pole, která volající nevyplnil', async () => {
    await createEntry({ title: 'Ladění importu', startedAt: '2026-03-02T08:00:00.000Z' });

    const body = sentBody();
    for (const key of REQUIRED_KEYS) expect(body).toHaveProperty(key);
    // Prázdné hodnoty jdou jako `null`/`""`, ne jako chybějící klíč.
    expect(body.endedAt).toBeNull();
    expect(body.projectId).toBeNull();
    expect(body.description).toBe('');
    expect(body.tags).toEqual([]);
  });

  it('úprava pošle stejný úplný tvar a id z cesty', async () => {
    await updateEntry('e1', { title: 'Code review', startedAt: '2026-03-02T08:00:00.000Z' });

    const body = sentBody();
    for (const key of REQUIRED_KEYS) expect(body).toHaveProperty(key);
    expect(body.id).toBe('e1');
  });

  it('zastavení posílá čas kliknutí, ne prázdné tělo', async () => {
    await stopRunning('2026-03-02T10:30:00.000Z');

    expect(sentBody()).toEqual({ endedAt: '2026-03-02T10:30:00.000Z' });
  });
});
