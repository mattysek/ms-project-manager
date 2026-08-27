// Testy projectsApi — REST klient pro LandingPage (PRD-00, ADR-005).
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createProject, deleteProject, listProjects, ProjectsApiError } from './projectsApi';
import type { ProjectSummary } from './projectsApi';

function summary(overrides: Partial<ProjectSummary>): ProjectSummary {
  return {
    id: 'p1',
    name: 'Projekt',
    startDate: '2026-01-01',
    endDate: '2026-06-01',
    budget: 100,
    peopleCount: 0,
    taskCount: 0,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function mockFetchOnce(status: number, body: unknown): void {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: status >= 200 && status < 300,
      status,
      statusText: 'status',
      json: async () => body,
      text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
    })
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('projectsApi', () => {
  // @scenario: project-management.feature > Seznam projektů je seřazen dle poslední úpravy
  it('listProjects seřadí výsledek podle updatedAt sestupně', async () => {
    const older = summary({ id: 'a', updatedAt: '2026-01-01T00:00:00.000Z' });
    const newer = summary({ id: 'b', updatedAt: '2026-01-02T00:00:00.000Z' });
    mockFetchOnce(200, [older, newer]);

    const result = await listProjects();

    expect(result.map((p) => p.id)).toEqual(['b', 'a']);
  });

  it('createProject zavolá POST /api/projects s názvem v těle', async () => {
    mockFetchOnce(200, summary({ name: 'Nový' }));

    const result = await createProject('Nový');

    expect(result.name).toBe('Nový');
    const call = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(call[0]).toBe('/api/projects');
    expect(call[1]).toMatchObject({ method: 'POST', body: JSON.stringify({ name: 'Nový' }) });
  });

  it('deleteProject zavolá DELETE na /api/projects/{id}', async () => {
    mockFetchOnce(204, undefined);

    await deleteProject('p1');

    const call = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(call[0]).toBe('/api/projects/p1');
    expect(call[1]).toMatchObject({ method: 'DELETE' });
  });

  it('chybová odpověď vyhodí ProjectsApiError se statusem', async () => {
    mockFetchOnce(403, 'Nemáte oprávnění');

    await expect(deleteProject('p1')).rejects.toThrow(ProjectsApiError);
  });
});
