// Externí odkazy úkolu — mimo jiné vazba na work item v Azure DevOps.
import type { Task } from '../../types';
import { guessLabel } from '../../utils';
import type { TaskDraft } from './useTaskDraft';

type TaskLink = NonNullable<Task['links']>[number];

function LinkRow({
  link,
  updateLink,
  deleteLink,
}: {
  link: TaskLink;
  updateLink: TaskDraft['updateLink'];
  deleteLink: TaskDraft['deleteLink'];
}) {
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
      <input
        className="inp"
        value={link.label}
        placeholder={guessLabel(link.url) || 'Popisek'}
        onChange={(e) => updateLink(link.id, 'label', e.target.value)}
        style={{ width: 140, flexShrink: 0, color: '#94a3b8', fontSize: 11 }}
      />
      <input
        className="inp"
        value={link.url}
        placeholder="https://..."
        onChange={(e) => {
          const v = e.target.value;
          updateLink(link.id, 'url', v);
          // Popisek se dopočítá z URL jen dokud si ho uživatel nenapsal sám.
          if (!link.label) updateLink(link.id, 'label', guessLabel(v));
        }}
        style={{ flex: 1, minWidth: 0, color: '#4f9cf9', fontSize: 11 }}
      />
      {link.url && (
        <a
          href={link.url}
          target="_blank"
          rel="noreferrer"
          style={{
            color: '#4f9cf9',
            fontSize: 14,
            padding: '4px 8px',
            borderRadius: 4,
            border: '1px solid #4f9cf933',
            background: '#0d1f38',
            textDecoration: 'none',
            flexShrink: 0,
          }}
        >
          ↗
        </a>
      )}
      <button
        type="button"
        onClick={() => deleteLink(link.id)}
        style={{
          background: 'none',
          border: 'none',
          color: '#475569',
          cursor: 'pointer',
          fontSize: 14,
          padding: '4px 6px',
          borderRadius: 4,
          flexShrink: 0,
          transition: 'color .15s',
        }}
        onMouseEnter={(e) => (e.currentTarget.style.color = '#f87171')}
        onMouseLeave={(e) => (e.currentTarget.style.color = '#475569')}
      >
        ✕
      </button>
    </div>
  );
}

export function LinksSection({
  links,
  addLink,
  updateLink,
  deleteLink,
}: {
  links: TaskLink[];
  addLink: TaskDraft['addLink'];
  updateLink: TaskDraft['updateLink'];
  deleteLink: TaskDraft['deleteLink'];
}) {
  return (
    <div style={{ border: '1px solid #1e2533', borderRadius: 8, overflow: 'hidden' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          padding: '8px 12px',
          background: '#161b27',
          borderBottom: '1px solid #1e2533',
        }}
      >
        <span
          style={{
            fontSize: 9,
            color: '#64748b',
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
          }}
        >
          Externí odkazy
        </span>
        <button
          type="button"
          onClick={addLink}
          className="btn"
          style={{
            marginLeft: 'auto',
            padding: '3px 10px',
            fontSize: 9,
            background: '#0d2210',
            borderColor: '#34d39944',
            color: '#6ee7b7',
          }}
        >
          + Přidat odkaz
        </button>
      </div>
      <div style={{ padding: 12, maxHeight: 150, overflowY: 'auto' }}>
        {links.length === 0 ? (
          <div
            style={{
              fontSize: 11,
              color: '#475569',
              fontStyle: 'italic',
              textAlign: 'center',
              padding: '8px 0',
            }}
          >
            Žádné odkazy
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {links.map((link) => (
              <LinkRow key={link.id} link={link} updateLink={updateLink} deleteLink={deleteLink} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
