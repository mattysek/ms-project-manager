// Sdílené kulisy testů výkazů: zamockované REST volání a stavba záznamů.
//
// Server je tu zamockovaný celý, takže se testuje jen chování obrazovky.
// Pravidla, která drží server (jedny běžící stopky, validace časů, soukromí),
// se ověřují v `WorkLogApiTests.fs` — z prohlížeče na ně není vidět.
import { vi } from 'vitest';
import * as projectsApi from '../../api/projectsApi';
import * as worklogApi from '../../api/worklogApi';
import type { WorkLogEntry } from '../../api/worklogApi';

/** Místní datum a čas → instant; test tak nezávisí na časové zóně. */
export function at(day: string, time: string): string {
  return new Date(`${day}T${time}:00`).toISOString();
}

export function entry(over: Partial<WorkLogEntry> & { id: string }): WorkLogEntry {
  const startedAt = over.startedAt ?? at('2026-03-02', '09:00');
  return {
    title: 'Code review',
    description: '',
    startedAt,
    endedAt: at('2026-03-02', '10:30'),
    tags: [],
    createdAt: startedAt,
    updatedAt: startedAt,
    ...over,
  };
}

export function project(id: string, name: string): projectsApi.ProjectSummary {
  return {
    id,
    name,
    startDate: '2026-01-01',
    endDate: '2026-12-31',
    budget: 0,
    peopleCount: 0,
    taskCount: 0,
    createdAt: at('2026-01-01', '08:00'),
    updatedAt: at('2026-01-01', '08:00'),
  };
}

export interface MockOptions {
  entries?: WorkLogEntry[];
  running?: WorkLogEntry | null;
  tags?: string[];
  projects?: projectsApi.ProjectSummary[];
}

/** Zamockuje celé REST rozhraní výkazů i seznam projektů. */
export function mockWorkLog(options: MockOptions = {}) {
  const entries = options.entries ?? [];
  vi.spyOn(worklogApi, 'listEntries').mockResolvedValue(entries);
  vi.spyOn(worklogApi, 'fetchRunning').mockResolvedValue(options.running ?? null);
  vi.spyOn(worklogApi, 'listTags').mockResolvedValue(options.tags ?? []);
  vi.spyOn(projectsApi, 'listProjects').mockResolvedValue(options.projects ?? []);

  /** Vstup formuláře na uložený záznam: `| null` pole se převedou na chybějící. */
  const fromInput = (input: worklogApi.WorkLogEntryInput, id: string): WorkLogEntry =>
    entry({
      ...input,
      id,
      description: input.description ?? '',
      projectId: input.projectId ?? undefined,
      endedAt: input.endedAt ?? undefined,
      tags: input.tags ?? [],
    });

  return {
    create: vi.spyOn(worklogApi, 'createEntry').mockImplementation(async (input) => ({
      entry: fromInput(input, 'new'),
    })),
    update: vi
      .spyOn(worklogApi, 'updateEntry')
      .mockImplementation(async (id, input) => fromInput(input, id)),
    remove: vi.spyOn(worklogApi, 'deleteEntry').mockResolvedValue(undefined),
    stop: vi
      .spyOn(worklogApi, 'stopRunning')
      .mockImplementation(async (endedAt) => entry({ id: 'stopped', endedAt })),
  };
}
