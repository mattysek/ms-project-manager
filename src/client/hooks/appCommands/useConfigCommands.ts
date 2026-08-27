import { useCallback } from 'react';
import { INIT_CATS, INIT_ROLES } from '../../constants';
import type { Categories, Roles } from '../../types';
import type { AppCommandsDeps } from './types';

export interface ConfigCommands {
  setCats: React.Dispatch<React.SetStateAction<Categories>>;
  setRoles: React.Dispatch<React.SetStateAction<Roles>>;
}

function valuesDiffer(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) !== JSON.stringify(b);
}

/** `set_cats`/`set_roles` nahrazují celý objekt najednou — protokol nezná dílčí diff. */
export function useConfigCommands({ state, dispatch }: AppCommandsDeps): ConfigCommands {
  const setCats = useCallback(
    (updater: Categories | ((prev: Categories) => Categories)) => {
      const prev = state?.cats ?? INIT_CATS;
      const next = typeof updater === 'function' ? updater(prev) : updater;
      if (valuesDiffer(prev, next)) dispatch({ type: 'set_cats', cats: next });
    },
    [state, dispatch]
  );

  const setRoles = useCallback(
    (updater: Roles | ((prev: Roles) => Roles)) => {
      const prev = state?.roles ?? INIT_ROLES;
      const next = typeof updater === 'function' ? updater(prev) : updater;
      if (valuesDiffer(prev, next)) dispatch({ type: 'set_roles', roles: next });
    },
    [state, dispatch]
  );

  return { setCats, setRoles };
}
