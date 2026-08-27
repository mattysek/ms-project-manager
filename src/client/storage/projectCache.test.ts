// Testy projectCache — IndexedDB cache celého AppState pro offline start (FR-OFFLINE-04).
import { describe, expect, it } from 'vitest';
import { clearProjectCache, getProjectCache, saveProjectCache } from './projectCache';
import { makeAppState } from '../state/testFixtures';
import { uid } from '../utils';

function freshProjectId(): string {
  return `proj-${uid()}`;
}

describe('projectCache', () => {
  it('getProjectCache vrátí null, pokud projekt ještě nebyl cachován', async () => {
    expect(await getProjectCache(freshProjectId())).toBeNull();
  });

  it('saveProjectCache uloží stav a getProjectCache ho vrátí i s časovou značkou', async () => {
    const projectId = freshProjectId();
    const state = makeAppState();

    await saveProjectCache(projectId, state);
    const cached = await getProjectCache(projectId);

    expect(cached?.projectId).toBe(projectId);
    expect(cached?.state).toEqual(state);
    expect(cached?.cachedAt).toBeTruthy();
  });

  it('saveProjectCache podruhé přepíše starý cache (invalidace při reconnectu — ADR-009)', async () => {
    const projectId = freshProjectId();
    await saveProjectCache(projectId, makeAppState({ tasks: [] }));

    const freshState = makeAppState({ tasks: [], people: [] });
    await saveProjectCache(projectId, freshState);

    const cached = await getProjectCache(projectId);
    expect(cached?.state).toEqual(freshState);
  });

  it('clearProjectCache smaže cache projektu', async () => {
    const projectId = freshProjectId();
    await saveProjectCache(projectId, makeAppState());

    await clearProjectCache(projectId);

    expect(await getProjectCache(projectId)).toBeNull();
  });

  it('cache jiného projektu se neovlivňuje', async () => {
    const projectA = freshProjectId();
    const projectB = freshProjectId();
    await saveProjectCache(projectA, makeAppState({ tasks: [] }));
    await saveProjectCache(projectB, makeAppState({ tasks: [], people: [] }));

    await clearProjectCache(projectA);

    expect(await getProjectCache(projectA)).toBeNull();
    expect(await getProjectCache(projectB)).not.toBeNull();
  });
});
