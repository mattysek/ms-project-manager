// Minimální URL routing bez knihovny — server dělá SPA fallback na `index.html`
// pro libovolnou cestu (`Hosting/StaticFiles.fs`), takže hluboké odkazy typu
// `/projects/abc123` nebo `/admin/users` fungují, pokud si klient sám
// synchronizuje `window.history` (FR-AUTH-01, FR-AUTH-03 returnUrl).
import { useCallback, useEffect, useState } from 'react';

export interface Route {
  path: string;
  navigate: (path: string, opts?: { replace?: boolean }) => void;
}

function currentPath(): string {
  return window.location.pathname + window.location.search;
}

export function useRoute(): Route {
  const [path, setPath] = useState(currentPath);

  useEffect(() => {
    const onPopState = () => setPath(currentPath());
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const navigate = useCallback((next: string, opts?: { replace?: boolean }) => {
    if (opts?.replace) window.history.replaceState(null, '', next);
    else window.history.pushState(null, '', next);
    setPath(next);
  }, []);

  return { path, navigate };
}

/** Cesta projektu z URL — `/projects/{id}` → `{id}`, jinak `null`. */
export function projectIdFromPath(path: string): string | null {
  const match = /^\/projects\/([^/?]+)/.exec(path);
  return match ? decodeURIComponent(match[1]) : null;
}
