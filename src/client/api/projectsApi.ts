// REST klient pro správu projektů — nahrazuje `projectStorage.ts` jako zdroj
// pravdy pro LandingPage (ADR-005: „Project CRUD (create, list, delete)" se
// přesouvá na server; Fáze 2 v PRD-00 explicitně žádá „LandingPage napojení na
// REST API").
//
// Všechny endpointy jsou pod `/api/projects` — tak je mapuje server
// (`Hosting/Endpoints.fs`). PRD-00 sice v původním textu psalo `/projects`
// bez prefixu, ale skutečnost je jiná a rozhoduje server.
//
// Tohle se rozešlo a **žádný unit test to nemohl chytit**: obě strany mají
// vlastní testy, ve kterých je ta druhá zamockovaná. Landing page proti
// skutečnému serveru nefungovala vůbec — `/projects` spadlo na SPA fallback,
// vrátilo `index.html` a `response.json()` skončilo výjimkou, kterou UI
// spolklo do `alert`u. Odhalil to až E2E test.
//
// Autentizace je cookie-based (ASP.NET Core Identity, ADR-003) —
// `credentials: 'include'` posílá session cookie.

export interface ProjectSummary {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  budget: number;
  peopleCount: number;
  taskCount: number;
  createdAt: string;
  updatedAt: string;
  /** Vyplněné jen u archivovaných projektů; aktivní ho nemají. */
  archivedAt?: string | null;
}

export class ProjectsApiError extends Error {
  constructor(
    message: string,
    public statusCode: number
  ) {
    super(message);
    this.name = 'ProjectsApiError';
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(path, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...init.headers },
    ...init,
  });
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new ProjectsApiError(
      text || `${response.status} ${response.statusText}`,
      response.status
    );
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

function byUpdatedAtDesc(a: ProjectSummary, b: ProjectSummary): number {
  return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
}

/** Je projekt archivovaný? Server posílá `archivedAt` jen u archivovaných. */
export function isArchived(project: ProjectSummary): boolean {
  return !!project.archivedAt;
}

/** Seznam projektů viditelných pro přihlášeného uživatele, seřazený dle poslední úpravy. */
export async function listProjects(): Promise<ProjectSummary[]> {
  const projects = await request<ProjectSummary[]>('/api/projects');
  return [...projects].sort(byUpdatedAtDesc);
}

/**
 * Archivace je běžný konec projektu; mazání je až druhý krok nad archivem
 * (project-management.feature). Server tvrdé smazání nearchivovaného projektu
 * odmítne, tohle není jen kosmetika v UI.
 */
export async function archiveProject(id: string): Promise<void> {
  await request<void>(`/api/projects/${encodeURIComponent(id)}/archive`, { method: 'POST' });
}

export async function unarchiveProject(id: string): Promise<void> {
  await request<void>(`/api/projects/${encodeURIComponent(id)}/unarchive`, { method: 'POST' });
}

/** Vytvoří projekt; odesílatel se stává PM (server-side, PRD-02/PRD-03). */
export async function createProject(name: string): Promise<ProjectSummary> {
  return request<ProjectSummary>('/api/projects', {
    method: 'POST',
    body: JSON.stringify({ name }),
  });
}

export async function deleteProject(id: string): Promise<void> {
  await request<void>(`/api/projects/${encodeURIComponent(id)}`, { method: 'DELETE' });
}
