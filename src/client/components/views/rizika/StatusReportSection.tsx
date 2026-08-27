// Sekce „Statusová zpráva" — vygeneruje shrnutí stavu projektu (progress,
// rizika, příležitosti) do editovatelného textového pole (Scenario:
// Automatické vygenerování statusové zprávy, risks-opportunities.feature).
// Text je koncept pro copy-paste do reportu/e-mailu, na server nepatří — ale
// musí přežít přepnutí záložky, protože se generuje právě proto, aby si k němu
// člověk došel pro čísla jinam. Drží ho `sessionStorage` per projekt.
import type { Opportunity, Risk } from '../../../types';
import { useSessionDraft } from '../../../hooks/useSessionDraft';
import { generateStatusReport } from './statusReport';

interface StatusReportSectionProps {
  risks: Risk[];
  opps: Opportunity[];
  overallProgress: number;
  /** Klíč konceptu — bez něj by se koncept přenesl mezi projekty. */
  projectId: string;
}

export function StatusReportSection({
  risks,
  opps,
  overallProgress,
  projectId,
}: StatusReportSectionProps) {
  const [text, setText] = useSessionDraft(`statusReport:${projectId}`);

  return (
    <div
      style={{
        border: '1px solid #1e2533',
        borderRadius: 10,
        overflow: 'hidden',
        marginBottom: 28,
      }}
    >
      <div
        style={{
          background: '#161b27',
          padding: '10px 16px',
          borderBottom: '1px solid #1e2533',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
        }}
      >
        <div
          style={{
            fontSize: 10,
            color: '#64748b',
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
          }}
        >
          Statusová zpráva
        </div>
        <button
          type="button"
          className="btn"
          onClick={() => setText(generateStatusReport(risks, opps, overallProgress))}
          style={{
            marginLeft: 'auto',
            padding: '3px 12px',
            background: '#0d1f38',
            borderColor: '#4f9cf944',
            color: '#93c5fd',
            fontSize: 10,
          }}
        >
          AUTO
        </button>
      </div>
      <div style={{ padding: '12px 16px' }}>
        <textarea
          className="inp"
          aria-label="Statusová zpráva"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Klikněte AUTO pro vygenerování shrnutí, nebo pište vlastní text…"
          style={{
            width: '100%',
            minHeight: 140,
            resize: 'vertical',
            lineHeight: 1.6,
            fontSize: 11,
          }}
        />
      </div>
    </div>
  );
}
