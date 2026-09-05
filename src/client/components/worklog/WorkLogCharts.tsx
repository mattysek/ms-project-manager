// Grafy přehledu výkazů — inline SVG bez knihovny (ADR-017).
//
// Aplikace už jeden netriviální vizuál (Gantt) kreslí sama a bundle je téma
// ADR-011; přidávat kvůli třem grafům závislost velikosti Rechartu by bylo
// nepoměrné. Data přijdou hotová z `utils/worklog.ts`, tady se jen kreslí.
import type { DayPoint, Slice } from '../../utils/worklog';
import { formatDuration } from '../../utils/worklog';

const AXIS = '#334155';
const BAR = '#4f9cf9';

const WEEKDAY_FORMAT = new Intl.DateTimeFormat('cs-CZ', { day: 'numeric', month: 'numeric' });

interface DailyChartProps {
  points: DayPoint[];
  title: string;
}

/**
 * Sloupcový graf po dnech. Dny bez práce mají nulový sloupec, ne vynechané
 * místo — jinak by se pondělí a středa nakreslily vedle sebe a graf by tvrdil,
 * že se pracovalo dva dny v řadě.
 */
export function DailyChart({ points, title }: DailyChartProps) {
  const height = 140;
  const barWidth = 100 / Math.max(1, points.length);
  const peak = points.reduce((max, point) => Math.max(max, point.ms), 0);
  // Sloupce jsou škálované vůči nejvyššímu dni, takže bez uvedeného měřítka
  // vypadá deset minut stejně jako deset hodin.
  const caption = peak === 0 ? title : `${title} (nejvyšší ${formatDuration(peak)})`;
  // U měsíce se 30 popisků na osu nevejde a slily by se do šedé kaše.
  const labelEvery = points.length <= 14 ? 1 : 2;

  return (
    <figure style={{ margin: 0 }}>
      <figcaption style={{ fontSize: 11, color: '#94a3b8', marginBottom: 6 }}>{caption}</figcaption>
      <svg
        viewBox={`0 0 100 ${height}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={title}
        style={{ width: '100%', height, display: 'block' }}
      >
        <line x1="0" y1={height - 20} x2="100" y2={height - 20} stroke={AXIS} strokeWidth="0.3" />
        {points.map((point, index) => {
          const usable = height - 26;
          const barHeight = peak === 0 ? 0 : (point.ms / peak) * usable;
          return (
            <rect
              key={point.day}
              x={index * barWidth + barWidth * 0.15}
              y={height - 20 - barHeight}
              width={barWidth * 0.7}
              height={barHeight}
              fill={BAR}
              // Titulek nese hodnotu i pro dny s nulou — sloupec sám o sobě
              // není vidět, ale den v grafu je.
            >
              <title>{`${point.day}: ${formatDuration(point.ms)}`}</title>
            </rect>
          );
        })}
      </svg>
      <div style={{ display: 'flex', fontSize: 8, color: '#475569' }}>
        {points.map((point, index) => (
          <span key={point.day} style={{ flex: 1, textAlign: 'center' }}>
            {index % labelEvery === 0
              ? WEEKDAY_FORMAT.format(new Date(`${point.day}T00:00:00`))
              : ''}
          </span>
        ))}
      </div>
    </figure>
  );
}

interface SliceChartProps {
  slices: Slice[];
  title: string;
  /** Vysvětlivka pod grafem — u tagů se hodí říct, že se díly překrývají. */
  note?: string;
}

/** Vodorovné pruhy pro rozpad podle projektů nebo tagů. */
export function SliceChart({ slices, title, note }: SliceChartProps) {
  return (
    <figure style={{ margin: 0 }}>
      <figcaption style={{ fontSize: 11, color: '#94a3b8', marginBottom: 6 }}>{title}</figcaption>
      {slices.length === 0 ? (
        <div style={{ fontSize: 11, color: '#475569' }}>Nic k zobrazení.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {slices.map((slice) => (
            <div key={slice.key} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 10, color: '#94a3b8', minWidth: 130 }}>{slice.label}</span>
              <div style={{ flex: 1, background: '#111827', borderRadius: 3, height: 12 }}>
                <div
                  style={{
                    width: `${Math.round(slice.ratio * 100)}%`,
                    background: BAR,
                    height: '100%',
                    borderRadius: 3,
                  }}
                />
              </div>
              <span style={{ fontSize: 10, color: '#e2e8f0', minWidth: 48, textAlign: 'right' }}>
                {formatDuration(slice.ms)}
              </span>
            </div>
          ))}
        </div>
      )}
      {note && <div style={{ fontSize: 9, color: '#475569', marginTop: 6 }}>{note}</div>}
    </figure>
  );
}
