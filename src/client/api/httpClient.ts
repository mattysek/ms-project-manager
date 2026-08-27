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

export async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(path, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...init.headers },
    ...init,
  });
  if (!response.ok) {
    throw new ApiError(await errorMessage(response), response.status);
  }
  if (response.status === 204) return undefined as T;
  const text = await response.text();
  return (text ? JSON.parse(text) : undefined) as T;
}
