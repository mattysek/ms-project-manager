// Testy useAppNavigation — otevření/zavření projektu (project-management.feature).

import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useAppNavigation } from './useAppNavigation';
import type { AuthenticatedAuth } from './useAuth';
import type { Route } from './useRoute';

function makeRoute(): Route {
  return { path: '/projects/p1', navigate: vi.fn() };
}

describe('useAppNavigation — zavření projektu', () => {
  // @scenario: project-management.feature > Zavření projektu
  //
  // V single-user architektuře (CLAUDE.md, staré chování) musel `closeProject`
  // před odchodem počkat na debounced `useAutoSave`. Po ADR-004/ADR-005 to
  // odpadá: každý slice setter pošle command hned při vzniku a čeká se
  // optimisticky (`useCommandDispatch.dispatch` → `channel.sendCommand`,
  // žádný debounce) — „čekající změny" v tomhle smyslu už neexistují, takže
  // kliknutí na „← Zpět" může přejít na LandingPage okamžitě.
  it('"← Zpět" okamžitě přejde na LandingPage — commandy už byly odeslané při vzniku', () => {
    const route = makeRoute();
    const setCurrentProjectId = vi.fn();
    const setView = vi.fn();
    const auth = { logout: vi.fn() } as unknown as AuthenticatedAuth;
    const { result } = renderHook(() =>
      useAppNavigation(route, setCurrentProjectId, setView, auth)
    );

    result.current.closeProject();

    expect(setCurrentProjectId).toHaveBeenCalledWith(null);
    expect(route.navigate).toHaveBeenCalledWith('/');
  });

  it('loadProject nastaví projekt, přepne na view "projekt" a naviguje na jeho URL', () => {
    const route = makeRoute();
    const setCurrentProjectId = vi.fn();
    const setView = vi.fn();
    const auth = { logout: vi.fn() } as unknown as AuthenticatedAuth;
    const { result } = renderHook(() =>
      useAppNavigation(route, setCurrentProjectId, setView, auth)
    );

    result.current.loadProject('proj-42');

    expect(setCurrentProjectId).toHaveBeenCalledWith('proj-42');
    expect(setView).toHaveBeenCalledWith('projekt');
    expect(route.navigate).toHaveBeenCalledWith('/projects/proj-42');
  });
});
