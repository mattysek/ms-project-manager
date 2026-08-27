import type { Task, Categories, PersonWithWeeks } from '../types';
import { LAYERS } from '../constants/layers';

interface TooltipProps {
  task: Task;
  x: number;
  y: number;
  cats: Categories;
  people: PersonWithWeeks[];
  guessLabel: (url: string) => string;
}

export function Tooltip({ task, x, y, cats, people, guessLabel }: TooltipProps) {
  const cat = cats[task.cat];

  return (
    <div
      data-testid="task-tooltip"
      style={{
        position: 'fixed',
        left: Math.min(x, window.innerWidth - 280),
        top: y,
        background: '#1e2533',
        border: '1px solid #3b4a5a',
        borderRadius: 8,
        padding: '10px 14px',
        fontSize: 11,
        color: '#e2e8f0',
        zIndex: LAYERS.tooltip,
        maxWidth: 270,
        boxShadow: '0 8px 32px #000a',
        pointerEvents: 'none',
      }}
    >
      <div
        style={{
          fontWeight: 700,
          color: cat?.tx || '#f1f5f9',
          marginBottom: 5,
          lineHeight: 1.4,
        }}
      >
        {task.name}
      </div>
      <div style={{ display: 'flex', gap: 10, fontSize: 10, color: '#64748b' }}>
        <span>{cat?.label || task.cat}</span>
        <span>
          W{task.s}→W{task.e}
        </span>
        <span style={{ color: '#94a3b8', fontWeight: 600 }}>{task.md} MD</span>
        <span>{task.progress ?? 0}%</span>
      </div>
      {task.desc && (
        <div
          style={{
            fontSize: 10,
            color: '#94a3b8',
            marginTop: 4,
            lineHeight: 1.5,
            maxHeight: 60,
            overflow: 'hidden',
          }}
        >
          {task.desc}
        </div>
      )}
      {(task.links || []).length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 5 }}>
          {task.links.map((l) => (
            <a
              key={l.id}
              href={l.url}
              target="_blank"
              rel="noreferrer"
              style={{
                fontSize: 9,
                color: '#4f9cf9',
                textDecoration: 'none',
                padding: '1px 6px',
                background: '#0d1f38',
                border: '1px solid #4f9cf933',
                borderRadius: 3,
                pointerEvents: 'auto',
              }}
            >
              ↗ {l.label || guessLabel(l.url)}
            </a>
          ))}
        </div>
      )}
      <div style={{ fontSize: 10, color: '#475569', marginTop: 4 }}>
        {people.find((p) => p.id === task.p)?.name}
      </div>
    </div>
  );
}
