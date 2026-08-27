// Stav a handlery pro editaci karet rizik a příležitostí — kdo se právě edituje,
// která položka je čerstvě přidaná (mění label dokončovacího tlačítka), a CRUD
// nad `risks`/`opps` (Scenario: Přidání/Editace/Smazání rizika/příležitosti).
import { useState } from 'react';
import type { Opportunity, Risk } from '../../../types';
import { uid } from '../../../utils';

const RISK_DELETE_CONFIRM = 'Opravdu smazat toto riziko? Tuto akci nelze vrátit.';
const OPP_DELETE_CONFIRM = 'Opravdu smazat tuto příležitost? Tuto akci nelze vrátit.';

type SetRisks = React.Dispatch<React.SetStateAction<Risk[]>>;
type SetOpps = React.Dispatch<React.SetStateAction<Opportunity[]>>;

function useRiskEditing(setRisks: SetRisks) {
  const [editR, setEditR] = useState<string | null>(null);
  const [newR, setNewR] = useState<string | null>(null);

  const toggleEditR = (id: string | null) => {
    if (id === null && editR === newR) setNewR(null);
    setEditR(id);
  };
  const updR = (id: string, f: keyof Risk, v: string) =>
    setRisks((p) => p.map((r) => (r.id === id ? { ...r, [f]: v } : r)));
  const delR = (id: string) => {
    if (!window.confirm(RISK_DELETE_CONFIRM)) return;
    setRisks((p) => p.filter((r) => r.id !== id));
  };
  const addR = () => {
    const id = uid();
    setRisks((p) => [...p, { id, sev: 'low', who: '', title: 'Nové riziko', detail: '' }]);
    setEditR(id);
    setNewR(id);
  };

  return { editR, newR, toggleEditR, updR, delR, addR };
}

function useOpportunityEditing(setOpps: SetOpps) {
  const [editO, setEditO] = useState<string | null>(null);
  const [newO, setNewO] = useState<string | null>(null);

  const toggleEditO = (id: string | null) => {
    if (id === null && editO === newO) setNewO(null);
    setEditO(id);
  };
  const updO = (id: string, f: keyof Opportunity, v: string) =>
    setOpps((p) => p.map((o) => (o.id === id ? { ...o, [f]: v } : o)));
  const delO = (id: string) => {
    if (!window.confirm(OPP_DELETE_CONFIRM)) return;
    setOpps((p) => p.filter((o) => o.id !== id));
  };
  const addO = () => {
    const id = uid();
    setOpps((p) => [...p, { id, title: 'Nová příležitost', detail: '' }]);
    setEditO(id);
    setNewO(id);
  };

  return { editO, newO, toggleEditO, updO, delO, addO };
}

/** Kombinovaný editační stav rizik a příležitostí pro `RizikaView`. */
export function useRiskOpportunityEditing(setRisks: SetRisks, setOpps: SetOpps) {
  const risk = useRiskEditing(setRisks);
  const opp = useOpportunityEditing(setOpps);
  return { risk, opp };
}
