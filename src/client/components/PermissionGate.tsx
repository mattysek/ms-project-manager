// UI vrstva oprávnění (PRD-03, FR-ROLE-04, ADR-006). Toto NENÍ bezpečnostní
// vrstva — server validuje každý command znovu v `authorizeCommand`
// (ADR-006). PermissionGate jen disabluje/skryje ovládací prvky, aby uživatel
// bez oprávnění neklikal naprázdno.
//
// Výchozí chování: prvek zůstává viditelný, ale `disabled`/`readOnly` s
// tooltipem — FR-ROLE-04 to výslovně vyžaduje ("disabled, ne hidden").
// Jediná zdokumentovaná výjimka je sekce ADO Sync konfigurace pro Dev
// (`hide` prop) — tam se PAT informace nesmí vůbec objevit v DOMu.
import { cloneElement, isValidElement } from 'react';
import type { ReactElement } from 'react';
import type { MemberRole } from '../types/protocol';

const REQUIRES_PM_TOOLTIP = 'Tato akce vyžaduje roli Project Manager';

interface PermissionGateProps {
  /** Role aktuálního uživatele na projektu; `null` = zatím nenačteno (chová se jako bez oprávnění). */
  role: MemberRole | null;
  /** Jediná podporovaná role v ADR-006 — PM smí vše, tenhle gate cílí na akce vyhrazené PM. */
  require: 'pm';
  /** Jediné dítě — button/input/select/textarea, kterému se vloží `disabled`/`readOnly`. */
  children: ReactElement;
  /** Použije `readOnly` místo `disabled` — pro textové vstupy, které mají zůstat čitelné/vybíratelné. */
  readOnly?: boolean;
  /** ADO Sync konfigurace: Dev sekci vůbec nevidí (FR-ROLE-04 výjimka). */
  hide?: boolean;
}

export function PermissionGate({ role, require, children, readOnly, hide }: PermissionGateProps) {
  const authorized = role === require;
  if (authorized) return children;
  if (hide) return null;
  if (!isValidElement(children)) return children;

  const extra = readOnly ? { readOnly: true } : { disabled: true };
  return cloneElement(children as ReactElement<Record<string, unknown>>, {
    ...extra,
    title: REQUIRES_PM_TOOLTIP,
  });
}
