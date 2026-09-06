// Sdílený REST klient pro nová API (auth, admin, členové, quick notes).
//
// Server (`Api/Http.fs`, `error`) vrací chyby vždy jako JSON `{ message }`,
// takže na rozdíl od `projectsApi.ts` (které čte `response.text()`) tenhle
// klient nejdřív zkusí naparsovat JSON tělo a vytáhnout `message` — a teprve
// při selhání spadne na syrový text. Autentizace je cookie-based (ADR-003),
// `credentials: 'include'` posílá session cookie.
export class ApiError extends Error {
  constructor(
    message: string,
    public statusCode: number
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function errorMessage(response: Response): Promise<string> {
  const text = await response.text().catch(() => '');
  if (!text) return `${response.status} ${response.statusText}`;
  try {
    const parsed = JSON.parse(text) as { message?: string };
    return parsed.message || text;
  } catch {
    return text;
  }
}

/**
 * Hláška pro případ, kdy požadavek vůbec neodejde — vypnutý server, spadlá
 * síť, DNS. `fetch` v takové chvíli vyhodí `TypeError` s anglickým textem
 * („Failed to fetch"), a ten se bez tohohle překladu dostal až do UI: uživatel
 * viděl u seznamu členů projektu prostě „Failed to fetch".
 */
export const NETWORK_ERROR_MESSAGE = 'Server neodpovídá — zkontroluj připojení';

/** Chyba ze sítě, ne odpověď serveru; `statusCode` je 0, žádná odpověď nedorazila. */
export function isNetworkError(err: unknown): boolean {
  return err instanceof ApiError && err.statusCode === 0;
}

export async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', ...init.headers },
      ...init,
    });
  } catch {
    // `fetch` odmítá výjimkou jen při síťové chybě; HTTP stavy chodí jako
    // `ok: false` a řeší je větev níž.
    throw new ApiError(NETWORK_ERROR_MESSAGE, 0);
  }
  if (!response.ok) {
    throw new ApiError(await errorMessage(response), response.status);
  }
  if (response.status === 204) return undefined as T;
  const text = await response.text();
  return (text ? JSON.parse(text) : undefined) as T;
}
