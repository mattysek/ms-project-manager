import { useCallback } from 'react';
import { reconcileList } from '../../state/reconcileList';
import type { Opportunity, Risk } from '../../types';
import type { AppCommandsDeps } from './types';

export interface RiskOppCommands {
  setRisks: React.Dispatch<React.SetStateAction<Risk[]>>;
  setOpps: React.Dispatch<React.SetStateAction<Opportunity[]>>;
}

/** `setRisks`/`setOpps` pro RizikaView. */
export function useRiskOppCommands({ state, dispatch }: AppCommandsDeps): RiskOppCommands {
  const setRisks = useCallback(
    (updater: Risk[] | ((prev: Risk[]) => Risk[])) => {
      const prev = state?.risks ?? [];
      const next = typeof updater === 'function' ? updater(prev) : updater;
      const commands = reconcileList(prev, next, {
        add: (risk) => ({ type: 'add_risk', risk }),
        update: (id, fields) => ({ type: 'update_risk', riskId: id, fields }),
        remove: (id) => ({ type: 'delete_risk', riskId: id }),
      });
      for (const command of commands) dispatch(command);
    },
    [state, dispatch]
  );

  const setOpps = useCallback(
    (updater: Opportunity[] | ((prev: Opportunity[]) => Opportunity[])) => {
      const prev = state?.opps ?? [];
      const next = typeof updater === 'function' ? updater(prev) : updater;
      const commands = reconcileList(prev, next, {
        add: (opp) => ({ type: 'add_opportunity', opp }),
        update: (id, fields) => ({ type: 'update_opportunity', oppId: id, fields }),
        remove: (id) => ({ type: 'delete_opportunity', oppId: id }),
      });
      for (const command of commands) dispatch(command);
    },
    [state, dispatch]
  );

  return { setRisks, setOpps };
}
