// Čistá funkce pro generování statusové zprávy (Scenario: Automatické
// vygenerování statusové zprávy, risks-opportunities.feature). Žádný stav,
// žádná perzistence — jen text, který si uživatel může před použitím upravit.
import type { Opportunity, Risk, Severity } from '../../../types';
import { SEV_CFG } from '../../../constants';

const SEVERITY_ORDER: Severity[] = ['high', 'med', 'low'];

function riskCountLabel(risks: Risk[], sev: Severity): string | null {
  const count = risks.filter((r) => r.sev === sev).length;
  return count > 0 ? `${count}× ${SEV_CFG[sev].label}` : null;
}

function riskBullets(risks: Risk[]): string {
  return SEVERITY_ORDER.flatMap((sev) => risks.filter((r) => r.sev === sev))
    .map((r) => `• ${SEV_CFG[r.sev].label} — ${r.title}`)
    .join('\n');
}

function opportunityBullets(opps: Opportunity[]): string {
  return opps.map((o) => `• ${o.title}`).join('\n');
}

/** Sestaví shrnutí stavu projektu — progress, rizika dle závažnosti, příležitosti. */
export function generateStatusReport(
  risks: Risk[],
  opps: Opportunity[],
  overallProgress: number
): string {
  const riskCounts = SEVERITY_ORDER.map((sev) => riskCountLabel(risks, sev))
    .filter((x): x is string => x !== null)
    .join(', ');
  const parts = [
    `Celkový progress: ${overallProgress} %`,
    `Rizika (${risks.length}): ${riskCounts || 'žádná'}`,
    riskBullets(risks),
    `Příležitosti (${opps.length}):`,
    opportunityBullets(opps),
  ];
  return parts.filter((p) => p.length > 0).join('\n\n');
}
